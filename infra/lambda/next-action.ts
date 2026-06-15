import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { ok, badRequest, serverError, parseBody } from './shared/http.js';
import { getMemberContext, rankGarages } from './shared/data.js';
import { structuredCall } from './shared/anthropic.js';

interface NextActionRequest {
  memberId?: string;
  problemType?: string;
  driveable?: boolean;
  locationDescription?: string;
}

interface ActionDecision {
  serviceType: 'tow' | 'mobile_repair';
  requiredCapability:
    | 'tow'
    | 'mobile_repair'
    | 'battery'
    | 'tire'
    | 'fuel'
    | 'lockout'
    | 'winch'
    | 'collision_recovery'
    | 'flatbed';
  reasoning: string;
  customerSummary: string;
}

const SCHEMA = {
  type: 'object',
  properties: {
    serviceType: {
      type: 'string',
      enum: ['tow', 'mobile_repair'],
      description: 'Whether to send a tow truck or a mobile-repair truck.',
    },
    requiredCapability: {
      type: 'string',
      enum: ['tow', 'mobile_repair', 'battery', 'tire', 'fuel', 'lockout', 'winch', 'collision_recovery', 'flatbed'],
      description: 'The specific provider capability needed to handle this case.',
    },
    reasoning: { type: 'string', description: 'Why this service was chosen (for the supervisor).' },
    customerSummary: {
      type: 'string',
      description:
        'Plain-language line for the customer, framed as help being ARRANGED and pending confirmation — never state a truck has been sent or is on the way.',
    },
  },
  required: ['serviceType', 'requiredCapability', 'reasoning', 'customerSummary'],
};

const SYSTEM = `
You RECOMMEND roadside assistance for a human supervisor to approve. Given the
problem and whether the vehicle is driveable, decide whether the recommended help
is a TOW truck or a MOBILE-REPAIR truck, and the specific capability required.

Guidance:
- Fixable on the spot (flat tire with spare, dead battery, lockout, out of fuel)
  and the vehicle is otherwise driveable → mobile_repair with the matching
  capability (tire, battery, lockout, fuel).
- Not driveable, a collision, or a mechanical failure that can't be fixed
  roadside → tow (use collision_recovery/flatbed for collisions, winch if stuck).

This is a RECOMMENDATION only — nothing is dispatched until a supervisor approves.
The customerSummary must NOT say a truck has been sent or is "on the way"; frame
it as the help being arranged and pending confirmation. Be concise and practical.
`.trim();

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const body = parseBody<NextActionRequest>(event.body, event.isBase64Encoded);
    if (!body.memberId || !body.problemType) {
      return badRequest('memberId and problemType are required');
    }

    const ctx = getMemberContext(body.memberId);
    if (!ctx) return badRequest(`Unknown member ${body.memberId}`);

    const decision = await structuredCall<ActionDecision>({
      system: SYSTEM,
      prompt: `Problem: ${body.problemType}\nDriveable: ${
        body.driveable === undefined ? 'unknown' : body.driveable ? 'yes' : 'no'
      }\nLocation: ${body.locationDescription ?? 'unknown'}`,
      toolName: 'decide_next_action',
      toolDescription: 'Decide the service type and required capability.',
      schema: SCHEMA,
      maxTokens: 600,
    });

    // Search from the member's home base as a stand-in for the breakdown location.
    const origin = ctx.customer.homeBase;
    let ranked = rankGarages(origin, decision.requiredCapability);
    if (ranked.length === 0) ranked = rankGarages(origin, 'tow'); // fallback
    if (ranked.length === 0) ranked = rankGarages(origin);

    const [chosen, ...rest] = ranked;

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
