import { useStore } from '../state/store';
import type { Claim } from '../types';

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

    default:
      // Implemented in later commits (coverage, next-action, notify).
      store.logEvent('tool', `Agent called ${name} (not yet available)`);
      return { status: 'pending', message: 'This step is being set up.' };
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
