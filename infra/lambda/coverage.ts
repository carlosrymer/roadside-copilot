import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { ok, badRequest, serverError, parseBody } from './shared/http.js';
import { getMemberContext, toMemberFacts } from './shared/data.js';
import { structuredCall } from './shared/anthropic.js';
import {
  COVERAGE_SCHEMA,
  COVERAGE_SYSTEM,
  COVERAGE_TOOL,
  buildCoveragePrompt,
  coverageContextBlock,
  unknownMemberDetermination,
  type CoverageDetermination,
  type CoverageInput,
} from './shared/tasks/coverage.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const body = parseBody<CoverageInput>(event.body, event.isBase64Encoded);
    if (!body.memberId || !body.problemType) {
      return badRequest('memberId and problemType are required');
    }

    const ctx = getMemberContext(body.memberId);
    if (!ctx) {
      return ok({ memberFound: false, determination: unknownMemberDetermination(body.memberId) });
    }

    const { customer, policy, policyDoc } = ctx;

    const determination = await structuredCall<CoverageDetermination>({
      system: COVERAGE_SYSTEM,
      cacheableContext: coverageContextBlock(policy.policyForm, policyDoc),
      prompt: buildCoveragePrompt(body, toMemberFacts(ctx)),
      toolName: COVERAGE_TOOL.name,
      toolDescription: COVERAGE_TOOL.description,
      schema: COVERAGE_SCHEMA,
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
