import Anthropic from '@anthropic-ai/sdk';
import type { DimensionScore, Scenario } from '../types.js';

/**
 * DIMENSION 4 — Relevance: LLM-as-judge.
 *
 * Used only for the thing no string comparison can reach: whether the prose
 * actually speaks to THIS caller's situation. Everything the other three
 * dimensions cover is checked in code, because a judge that grades what a
 * substring match could grade is a slower, costlier, less reliable substring
 * match.
 *
 * Three rules this judge follows, all of which matter more than the prompt
 * wording:
 *
 *  1. It grades ONE narrow property. "Is this good?" produces a number that
 *     drifts with the weather; "does this address this member's problem?" does
 *     not.
 *  2. It is forced through a tool schema, so the output is a graded integer and
 *     a reason, never an essay you have to parse.
 *  3. It NEVER gates CI. It is non-deterministic, costs money, needs a key, and
 *     its agreement with human labels is itself only ~measured (see
 *     `npm run judge:calibrate`). It informs; it does not block.
 */

export const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? 'claude-opus-5';

let client: Anthropic | undefined;

export function judgeAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const JUDGE_SYSTEM = `
You grade ONE property of a roadside-assistance agent's response: RELEVANCE.

Relevance means: does the response engage with THIS caller's actual situation —
the specific problem, vehicle, member and circumstances described — in language
that would make sense to that caller, without generic filler or details that
belong to some other case?

Do NOT grade whether the coverage decision is correct, whether the citations are
real, or whether the tone is pleasant. Those are measured elsewhere. Grading
them here would double-count them and make this score impossible to interpret.

Scale:
5 — speaks precisely to this situation; every detail belongs to this case.
4 — on point, with a little generic padding.
3 — broadly related but vague, or omits the specific problem.
2 — mostly generic; could have been written for a different caller.
1 — off-topic, or describes a situation that is not this one.
`.trim();

export interface JudgeVerdict {
  /** Raw 1–5 grade, kept alongside the normalized score for calibration. */
  grade: number;
  reasoning: string;
}

export async function judgeRelevance(scenario: Scenario, res: unknown): Promise<JudgeVerdict> {
  const result = await getClient().messages.create({
    model: JUDGE_MODEL,
    max_tokens: 500,
    system: JUDGE_SYSTEM,
    tools: [
      {
        name: 'grade_relevance',
        description: 'Record the relevance grade for this response.',
        input_schema: {
          type: 'object',
          properties: {
            reasoning: {
              type: 'string',
              description: 'One or two sentences citing the specific detail that decided the grade.',
            },
            grade: { type: 'integer', description: 'Integer 1 to 5.' },
          },
          // reasoning BEFORE grade: the model fills fields in order, so it
          // commits to a justification before committing to a number.
          required: ['reasoning', 'grade'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'grade_relevance' },
    messages: [
      {
        role: 'user',
        content:
          `Scenario: ${scenario.description}\n` +
          `Caller input: ${JSON.stringify(scenario.input)}\n` +
          (scenario.notes ? `Context: ${scenario.notes}\n` : '') +
          `\nAgent response:\n${JSON.stringify(res, null, 2)}`,
      },
    ],
  });

  const block = result.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error('judge returned no grade');
  const { grade, reasoning } = block.input as JudgeVerdict;
  return { grade: Math.max(1, Math.min(5, Math.round(grade))), reasoning };
}

export async function scoreRelevance(scenario: Scenario, res: unknown): Promise<DimensionScore> {
  if (!judgeAvailable()) return { score: 0, detail: 'judge unavailable (no ANTHROPIC_API_KEY)' };
  try {
    const { grade, reasoning } = await judgeRelevance(scenario, res);
    // Normalized to [0,1] so it prints in the same column as the others — but a
    // 1-5 scale has a floor of 0.2, not 0. Never compare it to a 0-1 scorer.
    return { score: grade / 5, detail: `${grade}/5 — ${reasoning}` };
  } catch (err) {
    return { score: 0, detail: `judge error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
