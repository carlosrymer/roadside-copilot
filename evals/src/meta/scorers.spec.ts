import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { scoreGuidedOutcome } from '../scorers/guidedOutcome.js';
import { scoreToolCall } from '../scorers/toolCall.js';
import { scoreHallucination } from '../scorers/hallucination.js';
import { normalize } from '../data.js';
import type { Scenario } from '../types.js';

/**
 * META-EVAL: tests for the graders themselves.
 *
 * A scorer is ordinary code with an extraordinary amount of trust placed in it.
 * When it has a bug you do not get a red build — you get a green one, forever,
 * and a suite that has quietly stopped measuring anything. The classic version
 * is a hallucination checker whose normalization is so aggressive that every
 * quote matches: 100% faithful citations, always, including the invented ones.
 *
 * So each scorer gets the same treatment any other logic would: a case it must
 * pass, a case it must fail, and the edges in between.
 */

const coverageScenario = (over: Partial<Scenario> = {}): Scenario => ({
  id: 'test',
  description: 'test scenario',
  target: 'coverage',
  severity: 'normal',
  input: { memberId: 'MAM-33057', problemType: 'collision', driveable: false },
  expected: { acceptableDecisions: ['not_covered'], requiresHumanReview: true, expectClauses: ['§5.3'] },
  ...over,
});

const determination = (over: Record<string, unknown> = {}) => ({
  determination: {
    decision: 'not_covered',
    confidence: 0.9,
    citedClauses: [
      {
        clause: '§5.3',
        quote:
          'Collision recovery and towing of a vehicle damaged in a collision.\nAccident-related towing is covered under the vehicle’s collision coverage, not\nthis roadside plan.',
      },
    ],
    rationale: 'excluded on Basic',
    recommendedService: 'none',
    customerSummary: 'a specialist will help',
    requiresHumanReview: true,
    ...over,
  },
});

describe('scoreGuidedOutcome', () => {
  it('accepts a decision in the acceptable set', () => {
    assert.equal(scoreGuidedOutcome(coverageScenario(), determination()).score, 1);
  });

  it('rejects a decision outside the set', () => {
    assert.equal(scoreGuidedOutcome(coverageScenario(), determination({ decision: 'covered' })).score, 0);
  });

  it('rejects a missing decision rather than crashing', () => {
    // A malformed response must SCORE ZERO, not throw. A scorer that throws on
    // bad input turns a product failure into a harness failure, and the harness
    // failure is the one that gets triaged.
    assert.equal(scoreGuidedOutcome(coverageScenario(), {}).score, 0);
  });

  it('accepts either of two defensible decisions when the expectation is a set', () => {
    const s = coverageScenario({ expected: { acceptableDecisions: ['not_covered', 'needs_review'] } });
    assert.equal(scoreGuidedOutcome(s, determination({ decision: 'needs_review' })).score, 1);
  });
});

describe('scoreToolCall', () => {
  it('passes a well-formed, correct response', () => {
    assert.equal(scoreToolCall(coverageScenario(), determination()).score, 1);
  });

  it('catches an off-schema enum value', () => {
    const r = scoreToolCall(coverageScenario(), determination({ recommendedService: 'helicopter_airlift' }));
    assert.ok(r.score < 1);
    assert.ok(r.checks?.find((c) => c.name === 'structured' && !c.pass));
  });

  it('catches a confidence outside [0,1]', () => {
    assert.ok(scoreToolCall(coverageScenario(), determination({ confidence: 42 })).score < 1);
  });

  it('catches the escalation flag being wrong', () => {
    const r = scoreToolCall(coverageScenario(), determination({ requiresHumanReview: false }));
    assert.ok(r.checks?.find((c) => c.name === 'humanReview' && !c.pass));
  });

  it('catches a missing expected clause (citation recall)', () => {
    const r = scoreToolCall(coverageScenario(), determination({ citedClauses: [] }));
    assert.ok(r.checks?.find((c) => c.name === 'expectedClauses' && !c.pass));
  });

  it('scores partial credit rather than collapsing to zero', () => {
    // Four checks apply here; exactly one fails. Partial credit is the point:
    // it distinguishes "nearly right" from "entirely wrong" in the report.
    const r = scoreToolCall(coverageScenario(), determination({ requiresHumanReview: false }));
    assert.ok(r.score > 0 && r.score < 1, `expected partial credit, got ${r.score}`);
  });

  it('verifies the chosen provider can actually do the job', () => {
    const s: Scenario = {
      id: 'act',
      description: 'collision tow',
      target: 'next_action',
      severity: 'normal',
      input: { memberId: 'MAM-48213', problemType: 'collision', driveable: false },
      expected: {
        acceptableServiceTypes: ['tow'],
        requiredCapability: 'collision_recovery',
        providerMustHaveCapability: 'collision_recovery',
      },
    };
    // G-002 is a mobile-repair shop; it cannot recover a wrecked car.
    const wrong = scoreToolCall(s, {
      decision: { serviceType: 'tow', requiredCapability: 'collision_recovery' },
      provider: { id: 'G-002' },
    });
    assert.ok(wrong.checks?.find((c) => c.name === 'providerCapable' && !c.pass));

    // G-004 does collision recovery.
    const right = scoreToolCall(s, {
      decision: { serviceType: 'tow', requiredCapability: 'collision_recovery' },
      provider: { id: 'G-004' },
    });
    assert.equal(right.score, 1);
  });
});

describe('scoreHallucination', () => {
  it('accepts a verbatim quote', () => {
    assert.equal(scoreHallucination(coverageScenario(), determination()).score, 1);
  });

  it('accepts a quote whose whitespace and smart quotes differ from the source', () => {
    const q = determination({
      citedClauses: [
        {
          clause: '§5.3',
          quote: "Collision recovery and towing of a vehicle damaged in a collision.   Accident-related towing is covered under the vehicle's collision coverage, not this roadside plan.",
        },
      ],
    });
    assert.equal(scoreHallucination(coverageScenario(), q).score, 1);
  });

  it('REJECTS a plausible paraphrase — the failure mode that matters', () => {
    const q = determination({
      citedClauses: [{ clause: '§5.3', quote: 'Collisions are not covered under the Basic roadside plan.' }],
    });
    assert.equal(scoreHallucination(coverageScenario(), q).score, 0);
  });

  it('REJECTS a quote lifted from a DIFFERENT plan than the member holds', () => {
    // Real text, wrong document. A checker that searched all policies at once
    // would wave this through — which is why it searches only the member's own.
    const q = determination({
      citedClauses: [
        { clause: '§3.6', quote: 'Extraction when the Covered Vehicle is stuck within 100 feet of a paved or maintained road.' },
      ],
    });
    assert.equal(scoreHallucination(coverageScenario(), q).score, 0);
  });

  it('scores the fraction when only some quotes are fabricated', () => {
    const q = determination({
      citedClauses: [
        determination().determination.citedClauses[0],
        { clause: '§9.9', quote: 'Unlimited coverage applies in all circumstances.' },
      ],
    });
    assert.equal(scoreHallucination(coverageScenario(), q).score, 0.5);
  });

  it('does not silently pass an unknown member that cited something', () => {
    const s = coverageScenario({ input: { memberId: 'MAM-00000', problemType: 'flat_tire' } });
    assert.equal(scoreHallucination(s, determination()).score, 0);
  });
});

describe('normalize', () => {
  it('folds the differences that do not change meaning', () => {
    assert.equal(normalize('  **Towing.**  the   nearest\nfacility '), 'Towing. the nearest facility');
    assert.equal(normalize('the member’s spare'), "the member's spare");
  });

  it('does NOT fold differences that do change meaning', () => {
    // The guard against an over-eager normalizer. If these ever collapse into
    // each other, the hallucination scorer has stopped working and every quote
    // will match everything.
    assert.notEqual(normalize('up to 15 miles'), normalize('up to 50 miles'));
    assert.notEqual(normalize('is covered'), normalize('is not covered'));
    assert.notEqual(normalize('Winching or extraction'), normalize('Winching and extraction'));
  });
});
