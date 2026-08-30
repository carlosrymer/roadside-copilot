import Anthropic from '@anthropic-ai/sdk';
import type { ModelClient, ModelRequest, ModelResult } from './client.js';
import { requestHash } from './client.js';

/**
 * The model the AGENT runs on. Defaults to the same id the Lambda uses, because
 * an eval is only evidence about the configuration you actually ship — scoring
 * a cheaper model than production is measuring a system nobody runs.
 */
export const AGENT_MODEL =
  process.env.EVAL_AGENT_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8';

export interface Recorder {
  (key: string, entry: { requestHash: string; value: unknown; usage: unknown; latencyMs: number }): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls the real Anthropic API with a forced tool call, so the model must return
 * something shaped like the schema. Structured output removes an entire class of
 * eval noise: you are grading the decision, not the model's JSON punctuation.
 */
export function createLiveClient(opts: { record?: Recorder; attempts?: number } = {}): ModelClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Live mode needs ANTHROPIC_API_KEY. Run without --model=live to replay recorded fixtures.',
    );
  }
  const anthropic = new Anthropic({ apiKey });
  const attempts = opts.attempts ?? 3;

  return {
    async call<T>(key: string, req: ModelRequest): Promise<ModelResult<T>> {
      const content: Anthropic.TextBlockParam[] = [];
      if (req.cacheableContext) {
        content.push({
          type: 'text',
          text: req.cacheableContext,
          cache_control: { type: 'ephemeral' },
        });
      }
      content.push({ type: 'text', text: req.prompt });

      let lastErr: unknown;
      for (let i = 0; i < attempts; i++) {
        const started = Date.now();
        try {
          const res = await anthropic.messages.create({
            model: AGENT_MODEL,
            max_tokens: req.maxTokens,
            system: req.system,
            tools: [
              {
                name: req.toolName,
                description: req.toolDescription,
                input_schema: req.schema as Anthropic.Tool.InputSchema,
              },
            ],
            tool_choice: { type: 'tool', name: req.toolName },
            messages: [{ role: 'user', content }],
          });
          const latencyMs = Date.now() - started;

          const block = res.content.find((b) => b.type === 'tool_use');
          if (!block || block.type !== 'tool_use') {
            throw new Error('model returned no tool_use block');
          }

          const usage = {
            inputTokens: res.usage.input_tokens,
            outputTokens: res.usage.output_tokens,
            cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
            cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
            estimated: false,
          };

          opts.record?.(key, {
            requestHash: requestHash(AGENT_MODEL, req),
            value: block.input,
            usage,
            latencyMs,
          });

          return {
            value: block.input as T,
            call: { model: AGENT_MODEL, source: 'live', usage, latencyMs },
          };
        } catch (err) {
          lastErr = err;
          const retryable =
            err instanceof Anthropic.APIError &&
            (err.status === 429 || err.status === undefined || (err.status ?? 0) >= 500);
          if (!retryable || i === attempts - 1) break;
          await sleep(1000 * 2 ** i);
        }
      }
      throw new Error(
        `live model call failed for "${key}": ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
      );
    },
  };
}
