import { useCallback, useRef } from 'react';
import { RealtimeClient } from './realtime';
import { useStore } from '../state/store';

/** React glue around RealtimeClient: starts/stops a session and routes events into the store. */
export function useRealtime() {
  const ref = useRef<RealtimeClient | null>(null);
  const setStatus = useStore((s) => s.setStatus);
  const logEvent = useStore((s) => s.logEvent);
  const mergeClaim = useStore((s) => s.mergeClaim);
  const reset = useStore((s) => s.reset);

  const start = useCallback(async () => {
    reset();
    const client = new RealtimeClient({
      onStatus: (status, error) => {
        setStatus(status, error);
        if (status === 'live') logEvent('info', 'Voice session connected');
        if (status === 'error' && error) logEvent('warning', error);
      },
      onSessionInfo: ({ claimId }) => mergeClaim({ claimId }),
      onServerEvent: () => {
        // Transcript + tool-call handling is wired in the next commit.
      },
    });
    ref.current = client;
    try {
      await client.start();
    } catch (e) {
      setStatus('error', e instanceof Error ? e.message : 'Failed to connect');
    }
  }, [reset, setStatus, logEvent, mergeClaim]);

  const stop = useCallback(() => {
    ref.current?.stop();
    ref.current = null;
  }, []);

  return { start, stop };
}
