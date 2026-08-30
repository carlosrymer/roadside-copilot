import type { CoverageExpectation, DimensionScore, NextActionExpectation, Scenario } from '../types.js';

/**
 * DIMENSION 1 — Guided outcome: did the agent land on the right END STATE?
 *
 * The bluntest and most important dimension. It ignores wording, citations,
 * confidence and style, and asks only: is the decision one a competent adjuster
 * would defend? Binary on purpose — a coverage call is not 70% correct.
 *
 * Note `acceptableDecisions` is a SET. Where two answers are genuinely
 * defensible (a limit that MIGHT be exceeded is arguably `partial` or arguably
 * `needs_review`) accepting both keeps the eval measuring the agent rather than
 * the dataset author's taste.
 */
export function scoreGuidedOutcome(scenario: Scenario, res: any): DimensionScore {
  if (scenario.target === 'coverage') {
    const exp = scenario.expected as CoverageExpectation;
    const decision = res?.determination?.decision;
    const pass = exp.acceptableDecisions.includes(decision);
    return {
      score: pass ? 1 : 0,
      detail: `decision=${decision ?? 'missing'} expected one of [${exp.acceptableDecisions.join(', ')}]`,
    };
  }

  const exp = scenario.expected as NextActionExpectation;
  const serviceType = res?.decision?.serviceType;
  const pass = exp.acceptableServiceTypes.includes(serviceType);
  return {
    score: pass ? 1 : 0,
    detail: `serviceType=${serviceType ?? 'missing'} expected one of [${exp.acceptableServiceTypes.join(', ')}]`,
  };
}
