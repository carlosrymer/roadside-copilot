import { useStore } from '../state/store';

/** The customer's phone — fake SMS updates pushed after supervisor approval. */
export function SmsInbox() {
  const notifications = useStore((s) => s.notifications);
  if (notifications.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Text messages
      </h3>
      <div className="space-y-2">
        {notifications.map((n) => (
          <div key={n.id} className="rounded-2xl bg-slate-800 px-3 py-2">
            <div className="mb-0.5 flex items-center justify-between text-[10px] text-slate-500">
              <span>Meridian Auto Mutual → {n.to}</span>
              <span>{new Date(n.sentAt).toLocaleTimeString()}</span>
            </div>
            <p className="text-sm text-slate-100">{n.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
