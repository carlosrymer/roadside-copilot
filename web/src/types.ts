export type ConnectionStatus = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

export type ProblemType =
  | 'flat_tire'
  | 'dead_battery'
  | 'lockout'
  | 'out_of_fuel'
  | 'mechanical_breakdown'
  | 'collision'
  | 'stuck_offroad'
  | 'other';

export interface Vehicle {
  make?: string;
  model?: string;
  year?: number;
}

export interface ClaimLocation {
  description?: string;
  lat?: number;
  lng?: number;
}

/** The structured claim the voice agent assembles, shown live in the console. */
export interface Claim {
  claimId?: string;
  customerName?: string;
  memberId?: string;
  vehicle?: Vehicle;
  location?: ClaimLocation;
  problemType?: ProblemType;
  driveable?: boolean;
  injuriesReported?: boolean;
  notes?: string;
}

export type Speaker = 'agent' | 'customer';

export interface TranscriptLine {
  id: string;
  speaker: Speaker;
  text: string;
  final: boolean;
}

export type EventKind = 'info' | 'tool' | 'decision' | 'action' | 'warning';

export interface AuditEvent {
  id: string;
  at: string;
  kind: EventKind;
  message: string;
}
