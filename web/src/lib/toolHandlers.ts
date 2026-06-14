import { useStore } from '../state/store';
import { apiUrl } from '../config';
import type { Claim, CoverageResult, NextActionResult } from '../types';

/**
 * Executes a tool the voice agent invoked and returns a JSON-able result that is
 * sent back into the conversation. update_claim updates the live claim here in
 * the client; check_coverage / find_next_action / send_update call the AWS API
 * and are wired in their own commits.
 */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const store = useStore.getState();

  switch (name) {
    case 'update_claim': {
      const patch = args as Partial<Claim>;
      store.mergeClaim(patch);
      store.logEvent('tool', summarizeUpdate(patch));
      if (patch.injuriesReported) {
        store.logEvent('warning', 'Injuries reported — safety escalation may be required');
      }
      return { ok: true };
    }

    case 'check_coverage': {
      store.logEvent('tool', 'Checking policy coverage…');
      try {
        const res = await fetch(apiUrl('/tools/coverage'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(args),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as CoverageResult;
        store.setCoverage(data);
        const d = data.determination;
        store.logEvent(
          'decision',
          `Coverage: ${d.decision.replace(/_/g, ' ')} (${Math.round(d.confidence * 100)}% confidence)`,
        );
        if (d.requiresHumanReview) store.logEvent('warning', 'Flagged for human review');
        // Compact result the agent can speak from; full detail is in the console.
        return {
          decision: d.decision,
          covered: data.covered ?? false,
          recommendedService: d.recommendedService,
          customerSummary: d.customerSummary,
          requiresHumanReview: d.requiresHumanReview,
        };
      } catch (e) {
        store.logEvent('warning', 'Coverage check failed');
        return { error: e instanceof Error ? e.message : 'coverage check failed' };
      }
    }

    case 'find_next_action': {
      const { claim } = store;
      store.logEvent('tool', 'Finding nearest provider…');
      try {
        const res = await fetch(apiUrl('/tools/next-action'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            memberId: claim.memberId,
            problemType: (args.problemType as string) ?? claim.problemType,
            driveable: (args.driveable as boolean) ?? claim.driveable,
            locationDescription: claim.location?.description,
          }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as NextActionResult;
        store.setNextAction(data);
        store.setDispatch('pending');
        store.logEvent(
          'decision',
          `Recommended ${data.decision.serviceType.replace(/_/g, ' ')}${
            data.provider ? ` via ${data.provider.name} (~${data.provider.etaMinutes} min)` : ''
          } — awaiting approval`,
        );
        return {
          serviceType: data.decision.serviceType,
          provider: data.provider?.name,
          etaMinutes: data.provider?.etaMinutes,
          customerSummary: data.decision.customerSummary,
          awaitingHumanApproval: true,
        };
      } catch (e) {
        store.logEvent('warning', 'Could not find a provider');
        return { error: e instanceof Error ? e.message : 'next-action failed' };
      }
    }

    case 'send_update': {
      const summary = (args.summary as string) ?? '';
      store.setDraftSummary(summary);
      store.logEvent('tool', 'Agent drafted customer update — pending supervisor approval');
      return { status: 'staged', message: 'Update staged. It will be sent once a supervisor approves.' };
    }

    default:
      store.logEvent('tool', `Agent called ${name} (no handler)`);
      return { status: 'pending', message: 'This step is not available.' };
  }
}

function summarizeUpdate(patch: Partial<Claim>): string {
  const parts: string[] = [];
  if (patch.customerName) parts.push(`name: ${patch.customerName}`);
  if (patch.memberId) parts.push(`member: ${patch.memberId}`);
  if (patch.vehicle) {
    const v = patch.vehicle;
    parts.push(`vehicle: ${[v.year, v.make, v.model].filter(Boolean).join(' ')}`);
  }
  if (patch.location?.description) parts.push(`location: ${patch.location.description}`);
  if (patch.problemType) parts.push(`problem: ${patch.problemType.replace(/_/g, ' ')}`);
  if (patch.driveable !== undefined) parts.push(`driveable: ${patch.driveable ? 'yes' : 'no'}`);
  return parts.length ? `Captured ${parts.join(', ')}` : 'Updated claim';
}
