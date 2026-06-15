export type Target = 'coverage' | 'next_action';

export type CoverageDecision = 'covered' | 'not_covered' | 'partial' | 'needs_review';

/** Expected outcomes for a coverage scenario. */
export interface CoverageExpectation {
  /** Decisions considered correct (allows tolerance for genuinely borderline cases). */
  acceptableDecisions: CoverageDecision[];
  /** Exact requiresHumanReview value, if the scenario should pin it. */
  requiresHumanReview?: boolean;
  /** Clause ids that SHOULD appear in the citations (recall check), e.g. "§3.7". */
  expectClauses?: string[];
  /** Expected recommended service, if the scenario should pin it. */
  recommendedService?: string;
}

/** Expected outcomes for a next-action scenario. */
export interface NextActionExpectation {
  acceptableServiceTypes: ('tow' | 'mobile_repair')[];
  requiredCapability?: string;
  /** The chosen provider must advertise this capability. */
  providerMustHaveCapability?: string;
}

export interface Scenario {
  id: string;
  description: string;
  target: Target;
  input: {
    memberId?: string;
    problemType?: string;
    driveable?: boolean;
    locationDescription?: string;
  };
  expected: CoverageExpectation | NextActionExpectation;
  /** Free-text relevance hints for the LLM judge. */
  notes?: string;
}

export interface Dataset {
  name: string;
  description: string;
  scenarios: Scenario[];
}

/** One rubric dimension's score in [0,1] plus a human-readable detail. */
export interface DimensionScore {
  score: number;
  detail: string;
}

export interface ScenarioResult {
  id: string;
  target: Target;
  ok: boolean; // passed the deterministic gate
  scores: {
    guidedOutcome: DimensionScore;
    toolCall: DimensionScore;
    hallucination: DimensionScore;
    relevance?: DimensionScore; // present only when judged
  };
  raw: unknown; // the agent's response, for debugging
}
