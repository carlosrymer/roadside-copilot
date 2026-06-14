import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { ok, badRequest, serverError, parseBody } from './shared/http.js';
import { getMemberContext } from './shared/data.js';
import { putRecord } from './shared/db.js';
import { structuredCall } from './shared/anthropic.js';

interface NotifyContext {
  customerName?: string;
  problemType?: string;
  serviceType?: string;
  providerName?: string;
  etaMinutes?: number;
  coverageSummary?: string;
}

interface NotifyRequest {
  claimId?: string;
  memberId?: string;
  context?: NotifyContext;
  draftSummary?: string;
}

const SYSTEM = `
You write short, reassuring SMS updates from a car-insurance roadside assistance
service. One to three sentences, plain language, no emojis, under 320 characters.
Confirm what was assessed and what happens next, including the provider and ETA
if given. Sign off as "Meridian Auto Mutual".
`.trim();

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const body = parseBody<NotifyRequest>(event.body, event.isBase64Encoded);
    if (!body.memberId) return badRequest('memberId is required');

    const ctx = getMemberContext(body.memberId);
    const to = ctx?.customer.phone ?? 'unknown';
    const c = body.context ?? {};

    const { message } = await structuredCall<{ message: string }>({
      system: SYSTEM,
      prompt: `Compose the SMS.
Customer: ${c.customerName ?? ctx?.customer.name ?? 'there'}
Problem: ${c.problemType ?? 'roadside issue'}
Coverage: ${c.coverageSummary ?? 'assessed'}
Service dispatched: ${c.serviceType ?? 'assistance'}${c.providerName ? ` (${c.providerName})` : ''}
ETA: ${c.etaMinutes ? `${c.etaMinutes} minutes` : 'shortly'}
${body.draftSummary ? `Agent's draft: ${body.draftSummary}` : ''}`,
      toolName: 'write_sms',
      toolDescription: 'Write the customer SMS message.',
      schema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
      maxTokens: 300,
    });

    const sentAt = new Date().toISOString();
    const notification = { to, message, sentAt, channel: 'sms' as const };

    // Persist the claim snapshot + this notification for the audit trail.
    if (body.claimId) {
      await putRecord(body.claimId, 'claim', {
        memberId: body.memberId,
        customerName: c.customerName ?? ctx?.customer.name,
        problemType: c.problemType,
        serviceType: c.serviceType,
        providerName: c.providerName,
        coverageSummary: c.coverageSummary,
        status: 'dispatched',
      });
      await putRecord(body.claimId, `notification#${sentAt}`, notification);
    }

    return ok({ notification, persisted: Boolean(body.claimId) });
  } catch (err) {
    console.error(err);
    return serverError(err instanceof Error ? err.message : 'Notify failed');
  }
};
