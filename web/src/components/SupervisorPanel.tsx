import { useStore } from '../state/store';
import { IntakeCard } from './IntakeCard';
import { CoverageCard } from './CoverageCard';

/**
 * The human supervisor's console — the co-pilot observability surface. Shows the
 * live claim intake and coverage determination; next-best-action and the dispatch
 * approval gate are added in later commits.
 */
export function SupervisorPanel() {
  const status = useStore((s) => s.status);
  const started = status !== 'idle';

  return (
    <section className="flex h-full flex-col gap-4">
      <header>
        <h2 className="text-lg font-semibold text-white">Agent Console</h2>
        <p className="text-sm text-slate-400">Supervisor view — observe and approve</p>
      </header>

      {!started ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
          Live claim intake, coverage determination, and the dispatch approval gate
          appear here once a call is in progress.
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <IntakeCard />
          <CoverageCard />
        </div>
      )}
    </section>
  );
}
