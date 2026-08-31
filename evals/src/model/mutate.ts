import type { ModelClient, ModelRequest, ModelResult } from './client.js';

/**
 * Deliberately broken agents.
 *
 * An eval suite that has never failed is not evidence that the agent is good —
 * it is an untested smoke alarm. Each mutation below corrupts the model's answer
 * in one specific, realistic way. Running the suite against a mutation tells you
 * which rubric dimension notices, and, more usefully, which mutations slip
 * through untouched. Those are your blind spots. See LESSONS.md, Lesson 4.
 */

type Value = Record<string, unknown>;

export interface Mutation {
  name: string;
  /** What real-world failure this imitates. */
  imitates: string;
  /** The dimension you would EXPECT to catch it — verify, don't assume. */
  expectedCatch: string;
  apply(value: Value): Value;
}

const isCoverage = (v: Value) => 'decision' in v;

export const MUTATIONS: Mutation[] = [
  {
    name: 'hallucinate-citation',
    imitates: 'the model paraphrases the policy but presents it as a direct quote',
    expectedCatch: 'hallucination',
    apply(v) {
      if (!isCoverage(v)) return v;
      const cited = (v.citedClauses as { clause: string; quote: string }[]) ?? [];
      return {
        ...v,
        citedClauses: cited.map((c, i) =>
          i === 0
            ? { ...c, quote: 'This plan provides unlimited roadside coverage in all circumstances.' }
            : c,
        ),
      };
    },
  },
  {
    name: 'drop-citations',
    imitates: 'the model reaches the right answer but shows no work — an unauditable decision',
    expectedCatch: 'toolCall (expectedClauses recall), NOT hallucination',
    apply(v) {
      if (!isCoverage(v)) return v;
      return { ...v, citedClauses: [] };
    },
  },
  {
    name: 'flip-decision',
    imitates: 'a prompt regression that inverts covered and not-covered',
    expectedCatch: 'guidedOutcome',
    apply(v) {
      if (!isCoverage(v)) return v;
      const flip: Record<string, string> = { covered: 'not_covered', not_covered: 'covered' };
      return { ...v, decision: flip[v.decision as string] ?? v.decision };
    },
  },
  {
    name: 'never-escalate',
    imitates: 'the safety rule silently stops firing — the highest-severity failure in this product',
    expectedCatch: 'toolCall (humanReview check) on critical scenarios',
    apply(v) {
      if (!isCoverage(v)) return v;
      return { ...v, requiresHumanReview: false };
    },
  },
  {
    name: 'invalid-enum',
    imitates: 'structured output drifting off-schema, e.g. after a schema edit',
    expectedCatch: 'toolCall (structured check)',
    apply(v) {
      if (!isCoverage(v)) return v;
      return { ...v, recommendedService: 'helicopter_airlift' };
    },
  },
  {
    name: 'always-tow',
    imitates: 'the tow-vs-repair judgment collapsing to a constant — expensive and slow for the member',
    expectedCatch: 'guidedOutcome on next_action',
    apply(v) {
      if (isCoverage(v)) return v;
      return { ...v, serviceType: 'tow', requiredCapability: 'tow' };
    },
  },
  {
    name: 'wrong-capability',
    imitates: 'the right service type paired with a capability the provider cannot deliver',
    expectedCatch: 'toolCall (capability + providerCapable checks)',
    apply(v) {
      if (isCoverage(v)) return v;
      return { ...v, requiredCapability: 'fuel' };
    },
  },
  {
    name: 'overpromise',
    imitates: 'the agent telling the customer a truck is en route BEFORE a supervisor approved it',
    expectedCatch:
      'nothing — this is a deliberate blind spot in the four-dimension rubric (LESSONS.md, Exercise 4b)',
    apply(v) {
      if (isCoverage(v)) {
        return { ...v, customerSummary: 'Good news — a tow truck has been dispatched and is on the way now.' };
      }
      return { ...v, customerSummary: "You're all set, a truck has been sent and will arrive shortly." };
    },
  },
];

export function findMutation(name: string): Mutation {
  const m = MUTATIONS.find((x) => x.name === name);
  if (!m) {
    throw new Error(`unknown mutation "${name}". Available: ${MUTATIONS.map((x) => x.name).join(', ')}`);
  }
  return m;
}

/** Wrap any client so its answers are corrupted on the way out. */
export function withMutation(inner: ModelClient, mutation: Mutation): ModelClient {
  return {
    async call<T>(key: string, req: ModelRequest): Promise<ModelResult<T>> {
      const result = await inner.call<T>(key, req);
      return { ...result, value: mutation.apply(result.value as Value) as T };
    },
  };
}
