/**
 * The roadside voice agent's behavior, shared by the /session token minter.
 * Tools are bound to the ephemeral token at mint time so the agent's contract is
 * server-controlled; the browser executes the calls and returns results.
 */

export const REALTIME_MODEL = process.env.REALTIME_MODEL ?? 'gpt-realtime';
export const REALTIME_VOICE = process.env.REALTIME_VOICE ?? 'marin';

export const SYSTEM_INSTRUCTIONS = `
You are "Mira", a calm, empathetic roadside-assistance voice agent for Meridian
Auto Mutual. You are speaking with a driver who has had a problem with their car.

Your goals, in order:
1. Make sure the caller is safe.
2. Gather the information needed to open a roadside-assistance claim.
3. Once you have enough, run the coverage check, then find the next best action.
4. Tell the caller, in plain language, what will happen next.

How to speak:
- Natural, warm, and concise. Ask ONE question at a time.
- Read critical details back to confirm (member ID, location, the problem).
- Never invent policy details, prices, or promises. Do not state whether
  something is covered until the coverage check returns.

Information to collect (use the update_claim tool as you learn each item):
- Caller's name and member ID (format like MAM-12345).
- Vehicle: make, model, year.
- Current location: an address, highway marker, or nearby landmark.
- What happened: the type of problem or damage.
- Whether the vehicle is driveable.
- Whether anyone is injured or in a dangerous spot.

Safety: if anyone is injured or in immediate danger, calmly tell them to call 911
first, and note injuriesReported = true via update_claim.

Using tools:
- Call update_claim every time you learn or confirm a fact. Send only the fields
  you just learned.
- When you have the member ID, the location, and the problem type, call
  check_coverage.
- If the result is covered, call find_next_action to locate help and decide
  whether a tow or a mobile-repair truck is sent.
- Then call send_update to draft the customer notification. It will be sent only
  after a human supervisor approves; tell the caller an update is on the way.

Start by greeting the caller, confirming they're safe, and asking how you can help.
`.trim();

type Tool = {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

const PROBLEM_TYPES = [
  'flat_tire',
  'dead_battery',
  'lockout',
  'out_of_fuel',
  'mechanical_breakdown',
  'collision',
  'stuck_offroad',
  'other',
];

export const REALTIME_TOOLS: Tool[] = [
  {
    type: 'function',
    name: 'update_claim',
    description:
      'Record or update claim details as they are learned. Send only the fields just confirmed; all fields are optional.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string' },
        memberId: { type: 'string', description: 'e.g. MAM-48213' },
        vehicle: {
          type: 'object',
          properties: {
            make: { type: 'string' },
            model: { type: 'string' },
            year: { type: 'number' },
          },
        },
        location: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'address, landmark, or highway marker' },
          },
        },
        problemType: { type: 'string', enum: PROBLEM_TYPES },
        driveable: { type: 'boolean' },
        injuriesReported: { type: 'boolean' },
        notes: { type: 'string' },
      },
    },
  },
  {
    type: 'function',
    name: 'check_coverage',
    description:
      'Check whether the situation is covered by the member\'s policy. Call once member ID, location, and problem type are known.',
    parameters: {
      type: 'object',
      properties: {
        memberId: { type: 'string' },
        problemType: { type: 'string', enum: PROBLEM_TYPES },
        driveable: { type: 'boolean' },
        locationDescription: { type: 'string' },
      },
      required: ['memberId', 'problemType'],
    },
  },
  {
    type: 'function',
    name: 'find_next_action',
    description:
      'Find the nearest suitable provider and decide whether to send a tow or a mobile-repair truck. Call only after coverage is confirmed.',
    parameters: {
      type: 'object',
      properties: {
        problemType: { type: 'string', enum: PROBLEM_TYPES },
        driveable: { type: 'boolean' },
      },
      required: ['problemType'],
    },
  },
  {
    type: 'function',
    name: 'send_update',
    description:
      'Draft the customer notification (SMS) summarizing what was assessed and what happens next. It is sent only after a human supervisor approves.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'one or two sentences for the customer' },
      },
    },
  },
];
