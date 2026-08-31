/**
 * The next-best-action TASK: tow vs. mobile repair, and the capability the
 * provider must have. Pure, for the same reason as `coverage.ts` — the eval
 * harness imports this exact prompt rather than a copy that can drift.
 */

export const SERVICE_TYPES = ['tow', 'mobile_repair'] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const CAPABILITIES = [
  'tow',
  'mobile_repair',
  'battery',
  'tire',
  'fuel',
  'lockout',
  'winch',
  'collision_recovery',
  'flatbed',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export interface ActionDecision {
  serviceType: ServiceType;
  requiredCapability: Capability;
  reasoning: string;
  customerSummary: string;
}

export interface NextActionInput {
  memberId?: string;
  problemType?: string;
  driveable?: boolean;
  locationDescription?: string;
}

export const NEXT_ACTION_SCHEMA = {
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
} as const;

export const NEXT_ACTION_SYSTEM = `
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

export const NEXT_ACTION_TOOL = {
  name: 'decide_next_action',
  description: 'Decide the service type and required capability.',
} as const;

export function buildNextActionPrompt(input: NextActionInput): string {
  return `Problem: ${input.problemType}\nDriveable: ${
    input.driveable === undefined ? 'unknown' : input.driveable ? 'yes' : 'no'
  }\nLocation: ${input.locationDescription ?? 'unknown'}`;
}
