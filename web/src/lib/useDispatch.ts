import { useStore } from '../state/store';

/**
 * The human-in-the-loop gate: a supervisor approves, overrides, or escalates the
 * recommended dispatch. Sending the customer notification on approval is wired in
 * the notify commit.
 */
export function useDispatch() {
  const setDispatch = useStore((s) => s.setDispatch);
  const logEvent = useStore((s) => s.logEvent);

  const approve = () => {
    setDispatch('approved');
    logEvent('action', 'Supervisor approved dispatch');
  };

  const override = () => {
    setDispatch('overridden');
    logEvent('action', 'Supervisor overrode the recommendation');
  };

  const escalate = () => {
    setDispatch('escalated');
    logEvent('warning', 'Supervisor escalated to a human specialist');
  };

  return { approve, override, escalate };
}
