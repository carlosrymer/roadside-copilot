import Anthropic from '@anthropic-ai/sdk';
import { getApiKeys } from './secrets.js';

export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8';

let client: Anthropic | undefined;

export async function getAnthropic(): Promise<Anthropic> {
  if (client) return client;
  const { ANTHROPIC_API_KEY } = await getApiKeys();
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'REPLACE_ME') {
    throw new Error('ANTHROPIC_API_KEY is not configured in the secret');
  }
  client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return client;
}

/**
 * Run a single-shot tool-forced call so the model must return a value matching
 * `schema`. Returns the parsed tool input. Optionally caches a large, reused
 * context block (e.g. the policy document) to cut latency/cost on warm calls.
 */
export async function structuredCall<T>(opts: {
  system: string;
  prompt: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  cacheableContext?: string;
  maxTokens?: number;
}): Promise<T> {
  const anthropic = await getAnthropic();

  const content: Anthropic.TextBlockParam[] = [];
  if (opts.cacheableContext) {
    content.push({
      type: 'text',
      text: opts.cacheableContext,
      cache_control: { type: 'ephemeral' },
    });
  }
  content.push({ type: 'text', text: opts.prompt });

  const res = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: opts.schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: opts.toolName },
    messages: [{ role: 'user', content }],
  });

  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new Error('Model did not return a structured result');
  }
  return block.input as T;
}
