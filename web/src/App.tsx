import { CustomerPanel } from './components/CustomerPanel';
import { SupervisorPanel } from './components/SupervisorPanel';

export default function App() {
  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col p-4 sm:p-6">
      <header className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand font-bold text-white shadow-sm">
          R
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Roadside Co-Pilot</h1>
          <p className="text-xs text-slate-500">Meridian Auto Mutual · AI assistance with a human in the loop</p>
        </div>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <CustomerPanel />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SupervisorPanel />
        </div>
      </main>
    </div>
  );
}
