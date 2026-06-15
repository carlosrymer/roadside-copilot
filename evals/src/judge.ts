import Anthropic from '@anthropic-ai/sdk';
import type { DimensionScore, Scenario } from './types';

const MODEL = process.env.EVAL_JUDGE_MODEL ?? 'claude-opus-4-8';

let client: Anthropic | undefined;
function getClient(): Anthropic | undefined {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return undefined;
  client ??= new Anthropic({ apiKey: key });
  return client;
}

export function judgeAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * LLM-as-judge relevance: does the agent's response actually address THIS
 * scenario — the right problem, member, and situation — in clear, on-point
 * language? Returns a normalized [0,1] score. Non-deterministic, so it informs
 * the report but does not gate CI.
 */
export async function scoreRelevance(scenario: Scenario, res: any): Promise<DimensionScore> {
  const anthropic = getClient();
  if (!anthropic) return { score: 0, detail: 'judge unavailable (no ANTHROPIC_API_KEY)' };

  const result = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system:
      'You grade whether a roadside-assistance agent response is RELEVANT to the scenario: does it ' +
      'address the actual problem, the right member/vehicle, and the situation, in clear and on-point ' +
      'language? Grade relevance only — not correctness of the coverage decision. Score 1 (off-topic) ' +
      'to 5 (precisely on-point).',
    tools: [
      {
        name: 'grade_relevance',
        description: 'Record the relevance grade.',
        input_schema: {
          type: 'object',
          properties: {
            score: { type: 'integer', description: '1 to 5' },
            reasoning: { type: 'string' },
          },
          required: ['score', 'reasoning'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'grade_relevance' },
    messages: [
      {
        role: 'user',
        content:
          `Scenario: ${scenario.description}\n` +
          `Input: ${JSON.stringify(scenario.input)}\n` +
          (scenario.notes ? `Notes: ${scenario.notes}\n` : '') +
          `\nAgent response:\n${JSON.stringify(res, null, 2)}`,
      },
    ],
  });

  const block = result.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') return { score: 0, detail: 'judge returned no grade' };
  const { score, reasoning } = block.input as { score: number; reasoning: string };
  return { score: Math.max(0, Math.min(5, score)) / 5, detail: `${score}/5 — ${reasoning}` };
}
