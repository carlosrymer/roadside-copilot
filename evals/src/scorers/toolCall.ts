import { COVERAGE_SERVICES } from '../../../infra/lambda/shared/tasks/coverage.js';
import { providerHasCapability } from '../data.js';
import type { Check, CoverageExpectation, DimensionScore, NextActionExpectation, Scenario } from '../types.js';

/**
 * DIMENSION 2 — Tool call: is the structured output well-formed AND usable by
 * the code downstream of it?
 *
 * "Valid JSON" is a low bar that tool-forced output already clears. The checks
 * that earn their keep are the semantic ones — does the enum value exist, does
 * the escalation flag match the rule, is the chosen garage physically able to do
 * the job. This dimension is a MEAN of its checks rather than all-or-nothing, so
 * a response that gets four of five things right scores 0.8 and tells you which
 * one broke.
 */

function clauseId(s: string): string {
  return s.replace(/\s/g, '').toLowerCase();
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1;
}

export function scoreToolCall(scenario: Scenario, res: any): DimensionScore {
  const checks: Check[] = [];

  if (scenario.target === 'coverage') {
    const exp = scenario.expected as CoverageExpectation;
    const d = res?.determination;
    const cited: { clause: string; quote: string }[] = d?.citedClauses ?? [];

    const wellFormed =
      !!d &&
      Array.isArray(d.citedClauses) &&
      typeof d.recommendedService === 'string' &&
      (COVERAGE_SERVICES as readonly string[]).includes(d.recommendedService) &&
      typeof d.confidence === 'number' &&
      d.confidence >= 0 &&
      d.confidence <= 1 &&
      typeof d.requiresHumanReview === 'boolean';
    checks.push({
      name: 'structured',
      pass: wellFormed,
      detail: wellFormed ? undefined : `recommendedService=${d?.recommendedService}, confidence=${d?.confidence}`,
    });

    if (exp.recommendedService !== undefined) {
      checks.push({
        name: 'service',
        pass: d?.recommendedService === exp.recommendedService,
        detail: `got ${d?.recommendedService}, want ${exp.recommendedService}`,
      });
    }

    if (exp.requiresHumanReview !== undefined) {
      checks.push({
        name: 'humanReview',
        pass: d?.requiresHumanReview === exp.requiresHumanReview,
        detail: `got ${d?.requiresHumanReview}, want ${exp.requiresHumanReview}`,
      });
    }

    if (exp.expectClauses?.length) {
      // Citation RECALL: did it cite the clause that actually governs? This is
      // the mirror of the hallucination dimension, which measures PRECISION —
      // that everything cited is real. You need both: citing nothing is
      // perfectly non-hallucinatory and completely useless.
      const citedIds = cited.map((c) => clauseId(c.clause));
      const missing = exp.expectClauses.filter((e) => !citedIds.some((id) => id.includes(clauseId(e))));
      checks.push({
        name: 'expectedClauses',
        pass: missing.length === 0,
        detail: missing.length ? `missing ${missing.join(', ')} (cited: ${cited.map((c) => c.clause).join(', ') || 'none'})` : undefined,
      });
    }
  } else {
    const exp = scenario.expected as NextActionExpectation;
    const providerId = res?.provider?.id;

    if (exp.requiredCapability !== undefined) {
      checks.push({
        name: 'capability',
        pass: res?.decision?.requiredCapability === exp.requiredCapability,
        detail: `got ${res?.decision?.requiredCapability}, want ${exp.requiredCapability}`,
      });
    }

    checks.push({ name: 'providerPresent', pass: !!providerId });

    if (exp.providerMustHaveCapability) {
      // The end-to-end check that matters to a stranded driver: the truck that
      // gets dispatched can actually do the job.
      checks.push({
        name: 'providerCapable',
        pass: !!providerId && providerHasCapability(providerId, exp.providerMustHaveCapability),
        detail: `${providerId ?? 'none'} must offer ${exp.providerMustHaveCapability}`,
      });
    }
  }

  const failed = checks.filter((c) => !c.pass);
  return {
    score: mean(checks.map((c) => (c.pass ? 1 : 0))),
    detail: failed.length
      ? failed.map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ''}`).join('; ')
      : `${checks.length}/${checks.length} checks passed`,
    checks,
  };
}
