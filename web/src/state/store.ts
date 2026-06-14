import { create } from 'zustand';
import type {
  AuditEvent,
  Claim,
  ConnectionStatus,
  CoverageResult,
  DispatchStatus,
  EventKind,
  NextActionResult,
  TranscriptLine,
} from '../types';

let seq = 0;
const nextId = () => `${Date.now()}-${seq++}`;

interface AppState {
  status: ConnectionStatus;
  error?: string;
  claim: Claim;
  coverage?: CoverageResult;
  nextAction?: NextActionResult;
  dispatch: DispatchStatus;
  transcript: TranscriptLine[];
  events: AuditEvent[];

  setStatus: (status: ConnectionStatus, error?: string) => void;
  mergeClaim: (patch: Partial<Claim>) => void;
  setCoverage: (coverage: CoverageResult) => void;
  setNextAction: (nextAction: NextActionResult) => void;
  setDispatch: (dispatch: DispatchStatus) => void;
  upsertTranscript: (line: TranscriptLine) => void;
  logEvent: (kind: EventKind, message: string) => void;
  reset: () => void;
}

export const useStore = create<AppState>((set) => ({
  status: 'idle',
  claim: {},
  dispatch: 'idle',
  transcript: [],
  events: [],

  setStatus: (status, error) => set({ status, error }),

  setCoverage: (coverage) => set({ coverage }),

  setNextAction: (nextAction) => set({ nextAction }),

  setDispatch: (dispatch) => set({ dispatch }),

  mergeClaim: (patch) =>
    set((s) => ({
      claim: {
        ...s.claim,
        ...patch,
        vehicle: { ...s.claim.vehicle, ...patch.vehicle },
        location: { ...s.claim.location, ...patch.location },
      },
    })),

  upsertTranscript: (line) =>
    set((s) => {
      const idx = s.transcript.findIndex((l) => l.id === line.id);
      if (idx === -1) return { transcript: [...s.transcript, line] };
      const next = s.transcript.slice();
      next[idx] = line;
      return { transcript: next };
    }),

  logEvent: (kind, message) =>
    set((s) => ({
      events: [...s.events, { id: nextId(), at: new Date().toISOString(), kind, message }],
    })),

  reset: () =>
    set({
      status: 'idle',
      error: undefined,
      claim: {},
      coverage: undefined,
      nextAction: undefined,
      dispatch: 'idle',
      transcript: [],
      events: [],
    }),
}));
