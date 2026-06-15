import { useStore } from '../state/store';
import type { Claim } from '../types';

function humanizeProblem(p?: string) {
  return p ? p.replace(/_/g, ' ') : undefined;
}

function vehicleLabel(v?: Claim['vehicle']) {
  if (!v) return undefined;
  const s = [v.year, v.make, v.model].filter(Boolean).join(' ');
  return s || undefined;
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={value ? 'text-sm text-slate-800' : 'text-sm italic text-slate-400'}>
        {value ?? 'listening…'}
      </dd>
    </div>
  );
}

export function IntakeCard() {
  const claim = useStore((s) => s.claim);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Claim intake</h3>
        {claim.injuriesReported && (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-rose-200">
            Injuries reported
          </span>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Customer" value={claim.customerName} />
        <Field label="Member ID" value={claim.memberId} />
        <Field label="Vehicle" value={vehicleLabel(claim.vehicle)} />
        <Field label="Location" value={claim.location?.description} />
        <Field label="Problem" value={humanizeProblem(claim.problemType)} />
        <Field
          label="Driveable"
          value={claim.driveable === undefined ? undefined : claim.driveable ? 'Yes' : 'No'}
        />
      </dl>
    </div>
  );
}
