import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { ok, badRequest, serverError, parseBody } from './shared/http.js';
import { getMemberContext } from './shared/data.js';
import { structuredCall } from './shared/anthropic.js';

interface CoverageRequest {
  memberId?: string;
  problemType?: string;
  driveable?: boolean;
  locationDescription?: string;
}

interface CoverageDetermination {
  decision: 'covered' | 'not_covered' | 'partial' | 'needs_review';
  confidence: number;
  citedClauses: { clause: string; quote: string }[];
  rationale: string;
  recommendedService:
    | 'tow'
    | 'mobile_repair'
    | 'jump_start'
    | 'tire_change'
    | 'fuel_delivery'
    | 'lockout'
    | 'none';
  customerSummary: string;
  requiresHumanReview: boolean;
}

const SCHEMA = {
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
  required: ['decision', 'confidence', 'citedClauses', 'rationale', 'recommendedService', 'customerSummary', 'requiresHumanReview'],
};

const SYSTEM = `
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

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const body = parseBody<CoverageRequest>(event.body, event.isBase64Encoded);
    if (!body.memberId || !body.problemType) {
      return badRequest('memberId and problemType are required');
    }

    const ctx = getMemberContext(body.memberId);
    if (!ctx) {
      return ok({
        memberFound: false,
        determination: {
          decision: 'needs_review',
          confidence: 0,
          citedClauses: [],
          rationale: `No member found for ID "${body.memberId}". A human must verify identity.`,
          recommendedService: 'none',
          customerSummary: "We couldn't find your membership — let me connect you to a specialist.",
          requiresHumanReview: true,
        },
      });
    }

    const { customer, policy, policyDoc } = ctx;

    const prompt = `
Incident:
- Problem type: ${body.problemType}
- Vehicle driveable: ${body.driveable === undefined ? 'unknown' : body.driveable ? 'yes' : 'no'}
- Location: ${body.locationDescription ?? 'unknown'}

Member & policy:
- Member: ${customer.name} (${customer.memberId}), policy status: ${customer.policyStatus}
- Plan: ${policy.plan} (${policy.policyForm})
- Vehicle: ${customer.vehicle.year} ${customer.vehicle.make} ${customer.vehicle.model}, registered: ${customer.vehicle.registered}, use: ${customer.vehicle.use}
- Service calls used this policy year: ${customer.serviceCallsUsedThisYear} of ${policy.summary.serviceCallsPerYear} allowed

Decide coverage and cite the governing clauses from the policy document above.
`.trim();

    const determination = await structuredCall<CoverageDetermination>({
      system: SYSTEM,
      cacheableContext: `POLICY DOCUMENT (${policy.policyForm}):\n\n${policyDoc}`,
      prompt,
      toolName: 'record_coverage_determination',
      toolDescription: 'Record the coverage determination with cited clauses.',
      schema: SCHEMA,
      maxTokens: 1200,
    });

    return ok({
      memberFound: true,
      member: {
        name: customer.name,
        memberId: customer.memberId,
        plan: policy.plan,
        policyForm: policy.policyForm,
        callsUsed: customer.serviceCallsUsedThisYear,
        callsAllowed: policy.summary.serviceCallsPerYear,
        towingDistanceMiles: policy.summary.towingDistanceMiles,
      },
      covered: determination.decision === 'covered' || determination.decision === 'partial',
      determination,
    });
  } catch (err) {
    console.error(err);
    return serverError(err instanceof Error ? err.message : 'Coverage check failed');
  }
};
