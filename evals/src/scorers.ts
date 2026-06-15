import { normalize, policyTextForMember, providerHasCapability } from './data';
import type {
  CoverageExpectation,
  DimensionScore,
  NextActionExpectation,
  Scenario,
} from './types';

const COVERAGE_SERVICE_ENUM = [
  'tow',
  'mobile_repair',
  'jump_start',
  'tire_change',
  'fuel_delivery',
  'lockout',
  'none',
];

function clauseId(s: string): string {
  return s.replace(/\s/g, '').toLowerCase();
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1;
}

// ---- Guided outcome: did the agent reach the correct end state? ----

export function scoreGuidedOutcome(scenario: Scenario, res: any): DimensionScore {
  if (scenario.target === 'coverage') {
    const exp = scenario.expected as CoverageExpectation;
    const decision = res?.determination?.decision;
    const ok = exp.acceptableDecisions.includes(decision);
    return {
      score: ok ? 1 : 0,
      detail: `decision=${decision} expected∈[${exp.acceptableDecisions.join(',')}]`,
    };
  }
  const exp = scenario.expected as NextActionExpectation;
  const serviceType = res?.decision?.serviceType;
  const ok = exp.acceptableServiceTypes.includes(serviceType);
  return {
    score: ok ? 1 : 0,
    detail: `serviceType=${serviceType} expected∈[${exp.acceptableServiceTypes.join(',')}]`,
  };
}

// ---- Tool call: is the structured output well-formed and correct? ----

export function scoreToolCall(scenario: Scenario, res: any): DimensionScore {
  const checks: { name: string; pass: boolean }[] = [];

  if (scenario.target === 'coverage') {
    const exp = scenario.expected as CoverageExpectation;
    const d = res?.determination;
    const cited: { clause: string }[] = d?.citedClauses ?? [];

    checks.push({
      name: 'structured',
      pass:
        !!d &&
        Array.isArray(d.citedClauses) &&
        typeof d.recommendedService === 'string' &&
        COVERAGE_SERVICE_ENUM.includes(d.recommendedService),
    });
    if (exp.recommendedService !== undefined) {
      checks.push({ name: 'service', pass: d?.recommendedService === exp.recommendedService });
    }
    if (exp.requiresHumanReview !== undefined) {
      checks.push({ name: 'humanReview', pass: d?.requiresHumanReview === exp.requiresHumanReview });
    }
    if (exp.expectClauses?.length) {
      const citedIds = cited.map((c) => clauseId(c.clause));
      const allCited = exp.expectClauses.every((e) =>
        citedIds.some((id) => id.includes(clauseId(e))),
      );
      checks.push({ name: 'expectedClauses', pass: allCited });
    }
  } else {
    const exp = scenario.expected as NextActionExpectation;
    if (exp.requiredCapability !== undefined) {
      checks.push({ name: 'capability', pass: res?.decision?.requiredCapability === exp.requiredCapability });
    }
    checks.push({ name: 'providerPresent', pass: !!res?.provider?.id });
    if (exp.providerMustHaveCapability) {
      checks.push({
        name: 'providerCapable',
        pass: !!res?.provider?.id && providerHasCapability(res.provider.id, exp.providerMustHaveCapability),
      });
    }
  }

  const failed = checks.filter((c) => !c.pass).map((c) => c.name);
  return {
    score: mean(checks.map((c) => (c.pass ? 1 : 0))),
    detail: failed.length ? `failed: ${failed.join(', ')}` : 'all checks passed',
  };
}

// ---- Hallucination: are cited quotes verbatim from the policy? ----

export function scoreHallucination(scenario: Scenario, res: any): DimensionScore {
  if (scenario.target !== 'coverage') {
    return { score: 1, detail: 'n/a (structured next-action output)' };
  }
  const cited: { clause: string; quote: string }[] = res?.determination?.citedClauses ?? [];
  if (cited.length === 0) return { score: 1, detail: 'no citations' };

  const policy = policyTextForMember(scenario.input.memberId);
  if (!policy) {
    // Unknown member: there should be no citations to verify.
    return { score: 1, detail: 'no policy (unknown member)' };
  }

  const fabricated = cited.filter((c) => !policy.includes(normalize(c.quote))).map((c) => c.clause);
  const realCount = cited.length - fabricated.length;
  return {
    score: realCount / cited.length,
    detail: fabricated.length
      ? `fabricated quote(s) for: ${fabricated.join(', ')}`
      : `${cited.length}/${cited.length} quotes verbatim`,
  };
}
