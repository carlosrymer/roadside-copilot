import { useStore } from '../state/store';
import { apiUrl } from '../config';
import type { Notification } from '../types';

/**
 * The human-in-the-loop gate: a supervisor approves, overrides, or escalates the
 * recommended dispatch. On approval, the customer notification is composed and
 * "sent" (and the claim persisted) via the AWS API.
 */
export function useDispatch() {
  const setDispatch = useStore((s) => s.setDispatch);
  const logEvent = useStore((s) => s.logEvent);
  const addNotification = useStore((s) => s.addNotification);

  const approve = async () => {
    setDispatch('approved');
    logEvent('action', 'Supervisor approved dispatch');

    const { claim, coverage, nextAction, draftSummary } = useStore.getState();
    try {
      const res = await fetch(apiUrl('/tools/notify'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          claimId: claim.claimId,
          memberId: claim.memberId,
          draftSummary,
          context: {
            customerName: claim.customerName,
            problemType: claim.problemType,
            serviceType: nextAction?.decision.serviceType,
            providerName: nextAction?.provider?.name,
            etaMinutes: nextAction?.provider?.etaMinutes,
            coverageSummary: coverage?.determination.customerSummary,
          },
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { notification: Omit<Notification, 'id'> };
      addNotification({ id: crypto.randomUUID(), ...data.notification });
      logEvent('action', 'Customer SMS sent');
    } catch {
      logEvent('warning', 'Failed to send customer SMS');
    }
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
