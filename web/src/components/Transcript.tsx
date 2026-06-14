import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';

export function Transcript() {
  const transcript = useStore((s) => s.transcript);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  if (transcript.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
        The conversation will appear here.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
      {transcript.map((line) => (
        <div
          key={line.id}
          className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
            line.speaker === 'agent'
              ? 'self-start bg-slate-800 text-slate-100'
              : 'self-end bg-emerald-700 text-white'
          } ${line.final ? '' : 'opacity-70'}`}
        >
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide opacity-60">
            {line.speaker === 'agent' ? 'Mira' : 'Customer'}
          </span>
          {line.text || '…'}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
