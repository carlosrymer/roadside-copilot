import { useStore } from '../state/store';
import type { EventKind } from '../types';

const ICON: Record<EventKind, string> = {
  info: '•',
  tool: '⚙',
  decision: '⚖',
  action: '✓',
  warning: '⚠',
};

const COLOR: Record<EventKind, string> = {
  info: 'text-slate-400',
  tool: 'text-brand',
  decision: 'text-violet-600',
  action: 'text-emerald-600',
  warning: 'text-amber-600',
};

/** Append-only trail of everything the agent and supervisor did — the audit record. */
export function AuditLog() {
  const events = useStore((s) => s.events);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Activity log</h3>
      {events.length === 0 ? (
        <p className="text-sm text-slate-500">No activity yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li key={e.id} className="flex items-baseline gap-2 text-xs">
              <span className={COLOR[e.kind]}>{ICON[e.kind]}</span>
              <span className="tabular-nums text-slate-400">
                {new Date(e.at).toLocaleTimeString()}
              </span>
              <span className="text-slate-700">{e.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
