import type { CoverageDecision } from '../../infra/lambda/shared/tasks/coverage.js';
import type { Capability, ServiceType } from '../../infra/lambda/shared/tasks/next-action.js';

export type Target = 'coverage' | 'next_action';

/** How the agent is invoked. See LESSONS.md, Lesson 1. */
export type RunnerKind = 'local' | 'http';

/** Where model responses come from. See LESSONS.md, Lesson 2. */
export type ModelSource = 'replay' | 'live';

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export interface CoverageExpectation {
  /**
   * Decisions considered correct. A SET, not a single value: some scenarios are
   * genuinely borderline, and an eval that demands one answer where two are
   * defensible measures your opinion, not the agent.
   */
  acceptableDecisions: CoverageDecision[];
  /** Pin `requiresHumanReview` when the scenario is about the escalation rule. */
  requiresHumanReview?: boolean;
  /** Clause ids that SHOULD be cited (citation RECALL), e.g. "§5.3". */
  expectClauses?: string[];
  /** Pin the recommended service when the scenario is about service selection. */
  recommendedService?: string;
}

export interface NextActionExpectation {
  acceptableServiceTypes: ServiceType[];
  requiredCapability?: Capability;
  /** The chosen provider must actually advertise this capability. */
  providerMustHaveCapability?: Capability;
}

export type Expectation = CoverageExpectation | NextActionExpectation;

export interface Scenario {
  id: string;
  description: string;
  target: Target;
  /**
   * `critical` scenarios encode a safety or liability rule (injuries, denials,
   * unknown identity). The gate demands 100% on these and tolerates nothing —
   * an average hides exactly the failures you most need to see.
   */
  severity: 'critical' | 'normal';
  input: {
    memberId?: string;
    problemType?: string;
    driveable?: boolean;
    locationDescription?: string;
  };
  expected: Expectation;
  /** Context for the LLM judge, and for the next human reading the dataset. */
  notes?: string;
}

export interface Dataset {
  name: string;
  description: string;
  scenarios: Scenario[];
}

// ---------------------------------------------------------------------------
// Model accounting
// ---------------------------------------------------------------------------

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /**
   * True when the numbers were derived from the rendered prompt rather than
   * read off a real API response. Estimated cost is a planning number, never a
   * billing number — the report labels it so you never confuse the two.
   */
  estimated: boolean;
}

export interface ModelCall {
  model: string;
  source: ModelSource;
  usage: Usage;
  latencyMs: number;
  /** Set when replaying a fixture recorded against a since-changed prompt. */
  stale?: boolean;
}

/** What the agent produced, plus what it cost to produce. */
export interface AgentRun {
  response: unknown;
  calls: ModelCall[];
  wallMs: number;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

/** One rubric dimension: a score in [0,1], a human-readable line, and its parts. */
export interface DimensionScore {
  score: number;
  detail: string;
  checks?: Check[];
}

export type DimensionName = 'guidedOutcome' | 'toolCall' | 'hallucination' | 'relevance';

export interface ScenarioResult {
  id: string;
  target: Target;
  severity: Scenario['severity'];
  /** Passed every gating (deterministic) dimension. */
  ok: boolean;
  scores: {
    guidedOutcome: DimensionScore;
    toolCall: DimensionScore;
    hallucination: DimensionScore;
    /** Present only when the judge ran. Never gates — see LESSONS.md, Lesson 5. */
    relevance?: DimensionScore;
  };
  calls: ModelCall[];
  wallMs: number;
  costUsd?: number;
  stale: boolean;
  error?: string;
  raw: unknown;
}

export interface RunReport {
  dataset: string;
  runner: RunnerKind;
  modelSource: ModelSource;
  mutation?: string;
  judged: boolean;
  startedAt: string;
  results: ScenarioResult[];
  totals: {
    passed: number;
    total: number;
    costUsd?: number;
    costEstimated: boolean;
    wallMs: number;
    inputTokens: number;
    outputTokens: number;
  };
}
