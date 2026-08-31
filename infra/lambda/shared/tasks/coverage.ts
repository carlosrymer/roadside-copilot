/**
 * The coverage-determination TASK: system prompt, output schema, and prompt
 * builder — and nothing else.
 *
 * This module is deliberately PURE: no AWS imports, no data-file imports, no
 * bundler-only `.md` imports. That is what lets the eval harness import the
 * exact prompt the Lambda ships and run it in-process, instead of only being
 * able to test a deployed URL. If the thing you want to evaluate can only be
 * reached over HTTP, your evals can only run after a deploy — see
 * `evals/LESSONS.md`, Lesson 1.
 */

export type CoverageDecision = 'covered' | 'not_covered' | 'partial' | 'needs_review';

export const COVERAGE_SERVICES = [
  'tow',
  'mobile_repair',
  'jump_start',
  'tire_change',
  'fuel_delivery',
  'lockout',
  'none',
] as const;

export type CoverageService = (typeof COVERAGE_SERVICES)[number];

export interface CoverageDetermination {
  decision: CoverageDecision;
  confidence: number;
  citedClauses: { clause: string; quote: string }[];
  rationale: string;
  recommendedService: CoverageService;
  customerSummary: string;
  requiresHumanReview: boolean;
}

export interface CoverageInput {
  memberId?: string;
  problemType?: string;
  driveable?: boolean;
  locationDescription?: string;
}

/**
 * The member/policy facts the prompt renders. Declared here rather than
 * imported from `shared/data` so this module stays free of the data layer —
 * callers map their own records onto it at the boundary.
 */
export interface MemberFacts {
  name: string;
  memberId: string;
  policyStatus: string;
  plan: string;
  policyForm: string;
  vehicle: { year: number; make: string; model: string; registered: boolean; use: string };
  serviceCallsUsedThisYear: number;
  serviceCallsPerYear: number;
}

export const COVERAGE_SCHEMA = {
  type: 'object',
  properties: {
    decision: {
      type: 'string',
      enum: ['covered', 'not_covered', 'partial', 'needs_review'],
      description:
        'covered = clearly covered; not_covered = clearly excluded; partial = covered but a limit/cap may be exceeded; needs_review = ambiguous or safety-related.',
    },
    confidence: { type: 'number', description: '0 to 1 confidence in the decision.' },
    citedClauses: {
      type: 'array',
      description: 'The specific policy clauses that drive the decision. Cite at least one.',
      items: {
        type: 'object',
        properties: {
          clause: { type: 'string', description: 'Clause id, e.g. "§3.7" or "§5.3".' },
          quote: { type: 'string', description: 'Exact quoted text from the policy.' },
        },
        required: ['clause', 'quote'],
      },
    },
    rationale: { type: 'string', description: 'Concise explanation for the human supervisor.' },
    recommendedService: {
      type: 'string',
      enum: ['tow', 'mobile_repair', 'jump_start', 'tire_change', 'fuel_delivery', 'lockout', 'none'],
    },
    customerSummary: { type: 'string', description: 'Plain-language summary for the customer.' },
    requiresHumanReview: { type: 'boolean' },
  },
  required: [
    'decision',
    'confidence',
    'citedClauses',
    'rationale',
    'recommendedService',
    'customerSummary',
    'requiresHumanReview',
  ],
} as const;

export const COVERAGE_SYSTEM = `
You are a roadside-assistance coverage adjuster for Meridian Auto Mutual. Given a
member's policy document and an incident, decide whether the requested roadside
service is covered.

Rules:
- Cite the SPECIFIC clause numbers and quote the exact policy text. Never invent
  clauses or wording.
- If a usage limit, towing-distance limit, or benefit cap may be exceeded, use
  decision "partial" and set requiresHumanReview true.
- If the situation is ambiguous, or injuries/safety are involved, use
  "needs_review" and set requiresHumanReview true.
- Be precise and conservative. Always cite at least one clause.
`.trim();

export const COVERAGE_TOOL = {
  name: 'record_coverage_determination',
  description: 'Record the coverage determination with cited clauses.',
} as const;

/** The large, reusable prefix worth prompt-caching: the full policy document. */
export function coverageContextBlock(policyForm: string, policyDoc: string): string {
  return `POLICY DOCUMENT (${policyForm}):\n\n${policyDoc}`;
}

/** The per-request tail: the incident and the member's standing. */
export function buildCoveragePrompt(input: CoverageInput, facts: MemberFacts): string {
  return `
Incident:
- Problem type: ${input.problemType}
- Vehicle driveable: ${input.driveable === undefined ? 'unknown' : input.driveable ? 'yes' : 'no'}
- Location: ${input.locationDescription ?? 'unknown'}

Member & policy:
- Member: ${facts.name} (${facts.memberId}), policy status: ${facts.policyStatus}
- Plan: ${facts.plan} (${facts.policyForm})
- Vehicle: ${facts.vehicle.year} ${facts.vehicle.make} ${facts.vehicle.model}, registered: ${facts.vehicle.registered}, use: ${facts.vehicle.use}
- Service calls used this policy year: ${facts.serviceCallsUsedThisYear} of ${facts.serviceCallsPerYear} allowed

Decide coverage and cite the governing clauses from the policy document above.
`.trim();
}

/**
 * The deterministic answer for a member we cannot find. No model call: an
 * unknown member is an identity problem, not a coverage judgment.
 */
export function unknownMemberDetermination(memberId: string): CoverageDetermination {
  return {
    decision: 'needs_review',
    confidence: 0,
    citedClauses: [],
    rationale: `No member found for ID "${memberId}". A human must verify identity.`,
    recommendedService: 'none',
    customerSummary: "We couldn't find your membership — let me connect you to a specialist.",
    requiresHumanReview: true,
  };
}
