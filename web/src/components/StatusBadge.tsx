import type { ConnectionStatus } from '../types';

const LABELS: Record<ConnectionStatus, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  live: 'Live',
  ended: 'Call ended',
  error: 'Error',
};

const DOT: Record<ConnectionStatus, string> = {
  idle: 'bg-slate-400',
  connecting: 'bg-amber-500 animate-pulse',
  live: 'bg-emerald-500 animate-pulse',
  ended: 'bg-slate-400',
  error: 'bg-rose-500',
};

export function StatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-600">
      <span className={`h-2.5 w-2.5 rounded-full ${DOT[status]}`} />
      {LABELS[status]}
    </span>
  );
}
