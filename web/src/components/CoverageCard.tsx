import { useStore } from '../state/store';
import type { CoverageDecision } from '../types';

const DECISION_STYLES: Record<CoverageDecision, { label: string; cls: string }> = {
  covered: { label: 'Covered', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  partial: { label: 'Partial', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  needs_review: { label: 'Needs review', cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
  not_covered: { label: 'Not covered', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

export function CoverageCard() {
  const coverage = useStore((s) => s.coverage);

  if (!coverage) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Coverage</h3>
        <p className="text-sm text-slate-500">
          Runs automatically once the agent has the member ID, location, and problem.
        </p>
      </div>
    );
  }

  const d = coverage.determination;
  const style = DECISION_STYLES[d.decision];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Coverage determination</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${style.cls}`}>
          {style.label}
        </span>
      </div>

      {coverage.member && (
        <p className="mb-3 text-xs text-slate-500">
          {coverage.member.plan} plan ({coverage.member.policyForm}) · calls used{' '}
          {coverage.member.callsUsed}/{coverage.member.callsAllowed} · tow limit{' '}
          {coverage.member.towingDistanceMiles} mi
        </p>
      )}

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
          <span>Confidence</span>
          <span>{Math.round(d.confidence * 100)}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-200">
          <div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.round(d.confidence * 100)}%` }} />
        </div>
      </div>

      <p className="mb-3 text-sm text-slate-700">{d.rationale}</p>

      {d.citedClauses.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Cited clauses</p>
          <ul className="space-y-1.5">
            {d.citedClauses.map((c, i) => (
              <li key={i} className="rounded-md border-l-2 border-brand bg-brand-light px-2 py-1 text-xs">
                <span className="font-mono text-brand-dark">{c.clause}</span>
                <span className="text-slate-600"> — “{c.quote}”</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.requiresHumanReview && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          ⚠ Flagged for human review before any dispatch.
        </p>
      )}
    </div>
  );
}
