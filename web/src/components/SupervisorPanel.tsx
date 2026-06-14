/**
 * The human supervisor's console — the co-pilot observability surface.
 * Live intake, coverage, next-best-action, and approval controls are added in
 * later commits; this establishes the layout.
 */
export function SupervisorPanel() {
  return (
    <section className="flex h-full flex-col gap-4">
      <header>
        <h2 className="text-lg font-semibold text-white">Agent Console</h2>
        <p className="text-sm text-slate-400">Supervisor view — observe and approve</p>
      </header>

      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
        Live claim intake, coverage determination, and the dispatch approval gate
        appear here once a call is in progress.
      </div>
    </section>
  );
}
