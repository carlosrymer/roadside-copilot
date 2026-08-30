import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { ok, badRequest, serverError, parseBody } from './shared/http.js';
import { getMemberContext, selectGarage } from './shared/data.js';
import { structuredCall } from './shared/anthropic.js';
import {
  NEXT_ACTION_SCHEMA,
  NEXT_ACTION_SYSTEM,
  NEXT_ACTION_TOOL,
  buildNextActionPrompt,
  type ActionDecision,
  type NextActionInput,
} from './shared/tasks/next-action.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const body = parseBody<NextActionInput>(event.body, event.isBase64Encoded);
    if (!body.memberId || !body.problemType) {
      return badRequest('memberId and problemType are required');
    }

    const ctx = getMemberContext(body.memberId);
    if (!ctx) return badRequest(`Unknown member ${body.memberId}`);

    const decision = await structuredCall<ActionDecision>({
      system: NEXT_ACTION_SYSTEM,
      prompt: buildNextActionPrompt(body),
      toolName: NEXT_ACTION_TOOL.name,
      toolDescription: NEXT_ACTION_TOOL.description,
      schema: NEXT_ACTION_SCHEMA,
      maxTokens: 600,
    });

    // Search from the member's home base as a stand-in for the breakdown location.
    const origin = ctx.customer.homeBase;
    const [chosen, ...rest] = selectGarage(origin, decision.requiredCapability);

    return ok({
      decision,
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
    });
  } catch (err) {
    console.error(err);
    return serverError(err instanceof Error ? err.message : 'Next-action failed');
  }
};
