import { useStore } from '../state/store';
import { useRealtime } from '../lib/useRealtime';
import { StatusBadge } from './StatusBadge';

export function CustomerPanel() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const claimId = useStore((s) => s.claim.claimId);
  const { start, stop } = useRealtime();

  const live = status === 'live';
  const connecting = status === 'connecting';

  return (
    <section className="flex h-full flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Roadside Assistance</h2>
          <p className="text-sm text-slate-400">Talk to Mira, your assistance agent</p>
        </div>
        <StatusBadge status={status} />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 rounded-xl border border-slate-800 bg-slate-900/60 p-8">
        <button
          onClick={live || connecting ? stop : start}
          disabled={connecting}
          className={`flex h-28 w-28 items-center justify-center rounded-full text-base font-semibold transition
            ${live ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}
            ${connecting ? 'cursor-wait opacity-70' : ''} text-white shadow-lg`}
        >
          {live ? 'End call' : connecting ? '…' : 'Start call'}
        </button>

        <p className="text-center text-sm text-slate-400">
          {live
            ? 'Listening — describe what happened with your vehicle.'
            : connecting
              ? 'Connecting you to the assistance agent…'
              : 'Press to start. You will be asked to allow microphone access.'}
        </p>

        {claimId && (
          <p className="text-xs text-slate-500">
            Claim reference: <span className="font-mono text-slate-300">{claimId}</span>
          </p>
        )}

        {status === 'error' && error && (
          <p className="rounded-md bg-rose-950/60 px-3 py-2 text-center text-sm text-rose-300">{error}</p>
        )}
      </div>
    </section>
  );
}
