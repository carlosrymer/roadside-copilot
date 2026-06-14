import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { ok, serverError } from './shared/http.js';
import { getApiKeys } from './shared/secrets.js';
import { REALTIME_MODEL, REALTIME_VOICE, SYSTEM_INSTRUCTIONS, REALTIME_TOOLS } from './shared/agent.js';

/**
 * Mints a short-lived OpenAI Realtime ephemeral token bound to the roadside
 * agent's instructions + tools, so the browser can open a WebRTC voice session
 * directly with OpenAI without ever seeing the real API key.
 */
export const handler: APIGatewayProxyHandlerV2 = async () => {
  try {
    const { OPENAI_API_KEY } = await getApiKeys();
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'REPLACE_ME') {
      return serverError('OPENAI_API_KEY is not configured in the secret');
    }

    const claimId = `RC-${randomUUID().slice(0, 8).toUpperCase()}`;

    const session = {
      type: 'realtime',
      model: REALTIME_MODEL,
      instructions: SYSTEM_INSTRUCTIONS,
      tools: REALTIME_TOOLS,
      tool_choice: 'auto',
      audio: {
        input: {
          transcription: { model: 'gpt-4o-mini-transcribe' },
          turn_detection: { type: 'server_vad' },
        },
        output: { voice: REALTIME_VOICE },
      },
    };

    const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': `roadside-copilot:${claimId}`,
      },
      body: JSON.stringify({ session }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('client_secrets failed', res.status, detail);
      return serverError(`Failed to mint Realtime token (${res.status})`);
    }

    const data = (await res.json()) as { value: string; expires_at?: number };

    return ok({
      clientSecret: data.value,
      expiresAt: data.expires_at,
      model: REALTIME_MODEL,
      voice: REALTIME_VOICE,
      claimId,
    });
  } catch (err) {
    console.error(err);
    return serverError(err instanceof Error ? err.message : 'Unknown error');
  }
};
