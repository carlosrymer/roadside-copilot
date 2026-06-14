import { useStore } from '../state/store';
import { useRealtime } from '../lib/useRealtime';
import { StatusBadge } from './StatusBadge';
import { Transcript } from './Transcript';

export function CustomerPanel() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const claimId = useStore((s) => s.claim.claimId);
  const { start, stop } = useRealtime();

  const live = status === 'live';
  const connecting = status === 'connecting';
  const active = live || connecting || status === 'ended';

  return (
    <section className="flex h-full flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Roadside Assistance</h2>
          <p className="text-sm text-slate-400">Talk to Mira, your assistance agent</p>
        </div>
        <StatusBadge status={status} />
      </header>

      {!active ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 rounded-xl border border-slate-800 bg-slate-900/60 p-8">
          <button
            onClick={start}
            className="flex h-28 w-28 items-center justify-center rounded-full bg-emerald-600 text-base font-semibold text-white shadow-lg transition hover:bg-emerald-500"
          >
            Start call
          </button>
          <p className="text-center text-sm text-slate-400">
            Press to start. You will be asked to allow microphone access.
          </p>
          {status === 'error' && error && (
            <p className="rounded-md bg-rose-950/60 px-3 py-2 text-center text-sm text-rose-300">{error}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <Transcript />
          <div className="flex items-center justify-between border-t border-slate-800 pt-3">
            <span className="text-xs text-slate-500">
              {claimId && (
                <>
                  Claim <span className="font-mono text-slate-300">{claimId}</span>
                </>
              )}
            </span>
            <button
              onClick={stop}
              disabled={connecting}
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500 disabled:opacity-60"
            >
              {connecting ? 'Connecting…' : live ? 'End call' : 'Closed'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
