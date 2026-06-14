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

export type CoverageDecision = 'covered' | 'not_covered' | 'partial' | 'needs_review';

export interface CitedClause {
  clause: string;
  quote: string;
}

export interface CoverageDetermination {
  decision: CoverageDecision;
  confidence: number;
  citedClauses: CitedClause[];
  rationale: string;
  recommendedService: string;
  customerSummary: string;
  requiresHumanReview: boolean;
}

export interface CoverageMember {
  name: string;
  memberId: string;
  plan: string;
  policyForm: string;
  callsUsed: number;
  callsAllowed: number;
  towingDistanceMiles: number;
}

export interface CoverageResult {
  memberFound: boolean;
  member?: CoverageMember;
  covered?: boolean;
  determination: CoverageDetermination;
}

export interface ActionDecision {
  serviceType: 'tow' | 'mobile_repair';
  requiredCapability: string;
  reasoning: string;
  customerSummary: string;
}

export interface NextActionProvider {
  id: string;
  name: string;
  address: string;
  phone: string;
  distanceMiles: number;
  etaMinutes: number;
  rating: number;
}

export interface NextActionResult {
  decision: ActionDecision;
  origin: { label: string };
  provider: NextActionProvider | null;
  alternatives: { id: string; name: string; distanceMiles: number; etaMinutes: number }[];
}

export type DispatchStatus = 'idle' | 'pending' | 'approved' | 'overridden' | 'escalated';

export type EventKind = 'info' | 'tool' | 'decision' | 'action' | 'warning';

export interface AuditEvent {
  id: string;
  at: string;
  kind: EventKind;
  message: string;
}
