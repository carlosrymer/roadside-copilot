import {
  COVERAGE_SCHEMA,
  COVERAGE_SYSTEM,
  COVERAGE_TOOL,
  buildCoveragePrompt,
  coverageContextBlock,
  unknownMemberDetermination,
  type CoverageDetermination,
} from '../../../infra/lambda/shared/tasks/coverage.js';
import {
  NEXT_ACTION_SCHEMA,
  NEXT_ACTION_SYSTEM,
  NEXT_ACTION_TOOL,
  buildNextActionPrompt,
  type ActionDecision,
} from '../../../infra/lambda/shared/tasks/next-action.js';
import { selectProvider } from '../../../infra/lambda/shared/geo.js';
import { garages, getMemberContext, toMemberFacts } from '../data.js';
import type { ModelClient } from '../model/client.js';
import type { AgentRun, Scenario } from '../types.js';

/**
 * Runs the agent IN-PROCESS, using the same prompts, schema and provider-ranking
 * code the Lambda ships.
 *
 * What this deliberately does NOT cover: API Gateway, CORS, Secrets Manager,
 * cold starts, the Lambda's own request parsing. Those are integration concerns.
 * Knowing precisely what your eval does not test is part of the eval.
 */
export async function runLocal(scenario: Scenario, model: ModelClient): Promise<AgentRun> {
  const started = Date.now();
  const { input } = scenario;

  if (scenario.target === 'coverage') {
    const ctx = getMemberContext(input.memberId);
    if (!ctx) {
      // No model call at all: an unknown member is an identity problem. Scoring
      // this path proves the guardrail fires without spending a token.
      return {
        response: { memberFound: false, determination: unknownMemberDetermination(input.memberId ?? '') },
        calls: [],
        wallMs: Date.now() - started,
      };
    }

    const { value, call } = await model.call<CoverageDetermination>(scenario.id, {
      system: COVERAGE_SYSTEM,
      cacheableContext: coverageContextBlock(ctx.policy.policyForm, ctx.policyDoc),
      prompt: buildCoveragePrompt(input, toMemberFacts(ctx)),
      toolName: COVERAGE_TOOL.name,
      toolDescription: COVERAGE_TOOL.description,
      schema: COVERAGE_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 1200,
    });

    return {
      response: {
        memberFound: true,
        member: {
          name: ctx.customer.name,
          memberId: ctx.customer.memberId,
          plan: ctx.policy.plan,
          policyForm: ctx.policy.policyForm,
          callsUsed: ctx.customer.serviceCallsUsedThisYear,
          callsAllowed: ctx.policy.summary.serviceCallsPerYear,
          towingDistanceMiles: ctx.policy.summary.towingDistanceMiles,
        },
        covered: value.decision === 'covered' || value.decision === 'partial',
        determination: value,
      },
      calls: [call],
      wallMs: Date.now() - started,
    };
  }

  const ctx = getMemberContext(input.memberId);
  if (!ctx) throw new Error(`next_action scenario "${scenario.id}" references unknown member`);

  const { value, call } = await model.call<ActionDecision>(scenario.id, {
    system: NEXT_ACTION_SYSTEM,
    prompt: buildNextActionPrompt(input),
    toolName: NEXT_ACTION_TOOL.name,
    toolDescription: NEXT_ACTION_TOOL.description,
    schema: NEXT_ACTION_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 600,
  });

  const origin = ctx.customer.homeBase;
  const [chosen, ...rest] = selectProvider(garages, origin, value.requiredCapability);

  return {
    response: {
      decision: value,
      origin: { label: origin.label },
      provider: chosen
        ? {
            id: chosen.id,
            name: chosen.name,
            address: chosen.address,
            phone: chosen.phone,
            distanceMiles: chosen.distanceMiles,
            etaMinutes: chosen.etaMinutes,
            rating: chosen.rating,
          }
        : null,
      alternatives: rest.slice(0, 2).map((g) => ({
        id: g.id,
        name: g.name,
        distanceMiles: g.distanceMiles,
        etaMinutes: g.etaMinutes,
      })),
    },
    calls: [call],
    wallMs: Date.now() - started,
  };
}
