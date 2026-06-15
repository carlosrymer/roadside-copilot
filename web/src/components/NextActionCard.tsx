import { useStore } from '../state/store';
import { useDispatch } from '../lib/useDispatch';
import type { DispatchStatus } from '../types';

const STATUS_BANNER: Record<Exclude<DispatchStatus, 'idle' | 'pending'>, { text: string; cls: string }> = {
  approved: { text: '✓ Dispatch approved — provider notified, customer updated.', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  overridden: { text: '↺ Recommendation overridden by supervisor.', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  escalated: { text: '⤴ Escalated to a human specialist.', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
};

export function NextActionCard() {
  const nextAction = useStore((s) => s.nextAction);
  const dispatch = useStore((s) => s.dispatch);
  const { approve, override, escalate } = useDispatch();

  if (!nextAction) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Next best action</h3>
        <p className="text-sm text-slate-500">Recommended once coverage is confirmed.</p>
      </div>
    );
  }

  const { decision, provider, alternatives } = nextAction;
  const serviceLabel = decision.serviceType === 'tow' ? 'Tow truck' : 'Mobile-repair truck';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Next best action</h3>
        <span className="rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-medium text-brand-dark ring-1 ring-blue-200">
          {serviceLabel}
        </span>
      </div>

      {provider ? (
        <div className="mb-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="text-sm font-medium text-slate-900">{provider.name}</p>
          <p className="text-xs text-slate-500">{provider.address}</p>
          <p className="mt-1 text-xs text-slate-600">
            ~{provider.etaMinutes} min · {provider.distanceMiles} mi · ★ {provider.rating}
          </p>
        </div>
      ) : (
        <p className="mb-3 text-sm text-amber-700">No suitable provider found nearby.</p>
      )}

      <p className="mb-3 text-sm text-slate-700">{decision.reasoning}</p>

      {alternatives.length > 0 && (
        <p className="mb-3 text-xs text-slate-500">
          Alternatives: {alternatives.map((a) => `${a.name} (~${a.etaMinutes} min)`).join(', ')}
        </p>
      )}

      {dispatch === 'pending' ? (
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">Supervisor decision required</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={approve}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
              Approve
            </button>
            <button
              onClick={override}
              className="rounded-md bg-slate-200 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-300"
            >
              Override
            </button>
            <button
              onClick={escalate}
              className="rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
            >
              Escalate
            </button>
          </div>
        </div>
      ) : (
        dispatch !== 'idle' && (
          <p className={`rounded-md px-3 py-2 text-xs ring-1 ${STATUS_BANNER[dispatch].cls}`}>
            {STATUS_BANNER[dispatch].text}
          </p>
        )
      )}
    </div>
  );
}
