import { normalize, policyTextForMember } from '../data.js';
import type { DimensionScore, Scenario } from '../types.js';

/**
 * DIMENSION 3 — Hallucination: is every quoted clause VERBATIM in the source
 * policy?
 *
 * This is the dimension that makes the product defensible. A coverage denial
 * that quotes a clause the policy does not contain is not a bad answer, it is a
 * fabricated legal justification — and it is invisible to any grader that only
 * looks at the decision.
 *
 * The check is deliberately mechanical: normalize both sides, then substring.
 * No model, no judgement, no flakiness. When a scorer CAN be a string
 * comparison, it should be — you will trust it more at 3am than any judge.
 *
 * Scored as a fraction (real citations / total citations) rather than a boolean,
 * so "one of four quotes is invented" reads differently from "all four are".
 * The gate still demands 1.0.
 */
export function scoreHallucination(scenario: Scenario, res: any): DimensionScore {
  if (scenario.target !== 'coverage') {
    // The next-action output quotes nothing, so there is nothing to fabricate.
    // Recording that as 1.0 rather than "n/a" would quietly inflate the suite
    // average, so the detail line says plainly that this was not measured.
    return { score: 1, detail: 'not applicable — next-action output contains no quotes' };
  }

  const cited: { clause: string; quote: string }[] = res?.determination?.citedClauses ?? [];
  if (cited.length === 0) {
    // Nothing cited means nothing fabricated. Citing NOTHING is still a defect —
    // it is caught by the expectedClauses recall check in the toolCall
    // dimension, not here. Two dimensions, two distinct failure modes.
    return { score: 1, detail: 'no citations to verify' };
  }

  const policy = policyTextForMember(scenario.input.memberId);
  if (!policy) {
    return {
      score: cited.length === 0 ? 1 : 0,
      detail: `unknown member cited ${cited.length} clause(s) — nothing to cite from`,
    };
  }

  const fabricated = cited.filter((c) => !policy.includes(normalize(c.quote ?? '')));
  return {
    score: (cited.length - fabricated.length) / cited.length,
    detail: fabricated.length
      ? `not found in policy: ${fabricated.map((c) => `${c.clause} "${(c.quote ?? '').slice(0, 60)}…"`).join('; ')}`
      : `${cited.length}/${cited.length} quotes verbatim`,
  };
}
