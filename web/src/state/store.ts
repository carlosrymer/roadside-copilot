import { create } from 'zustand';
import type { AuditEvent, Claim, ConnectionStatus, EventKind, TranscriptLine } from '../types';

let seq = 0;
const nextId = () => `${Date.now()}-${seq++}`;

interface AppState {
  status: ConnectionStatus;
  error?: string;
  claim: Claim;
  transcript: TranscriptLine[];
  events: AuditEvent[];

  setStatus: (status: ConnectionStatus, error?: string) => void;
  mergeClaim: (patch: Partial<Claim>) => void;
  addTranscript: (line: TranscriptLine) => void;
  logEvent: (kind: EventKind, message: string) => void;
  reset: () => void;
}

export const useStore = create<AppState>((set) => ({
  status: 'idle',
  claim: {},
  transcript: [],
  events: [],

  setStatus: (status, error) => set({ status, error }),

  mergeClaim: (patch) =>
    set((s) => ({
      claim: {
        ...s.claim,
        ...patch,
        vehicle: { ...s.claim.vehicle, ...patch.vehicle },
        location: { ...s.claim.location, ...patch.location },
      },
    })),

  addTranscript: (line) => set((s) => ({ transcript: [...s.transcript, line] })),

  logEvent: (kind, message) =>
    set((s) => ({
      events: [...s.events, { id: nextId(), at: new Date().toISOString(), kind, message }],
    })),

  reset: () => set({ status: 'idle', error: undefined, claim: {}, transcript: [], events: [] }),
}));
