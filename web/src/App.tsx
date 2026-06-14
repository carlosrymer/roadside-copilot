import { CustomerPanel } from './components/CustomerPanel';
import { SupervisorPanel } from './components/SupervisorPanel';

export default function App() {
  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col p-4 sm:p-6">
      <header className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white">
          R
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Roadside Co-Pilot</h1>
          <p className="text-xs text-slate-400">Meridian Auto Mutual · AI assistance with a human in the loop</p>
        </div>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <CustomerPanel />
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <SupervisorPanel />
        </div>
      </main>
    </div>
  );
}
