import { readFileSync, writeFileSync } from 'node:fs';
import type { ModelClient, ModelRequest, ModelResult } from './client.js';
import { requestChars, requestHash } from './client.js';
import { estimateTokens } from './pricing.js';
import { FIXTURES_PATH } from '../paths.js';
import type { Usage } from '../types.js';

export interface FixtureEntry {
  /** Hash of the request this answer was recorded against. */
  requestHash: string;
  value: unknown;
  /** Real API usage when recorded live; null for authored fixtures. */
  usage: Usage | null;
  latencyMs: number | null;
}

export interface FixtureFile {
  /**
   * `recorded` — captured from real API responses via `npm run record`.
   * `authored` — hand-written so the harness is runnable with no key and no
   *              spend. Authored answers are plausible, not observed: they are
   *              a teaching stand-in, and cost/latency from them is estimated.
   */
  provenance: 'recorded' | 'authored';
  note?: string;
  model: string;
  recordedAt: string | null;
  entries: Record<string, FixtureEntry>;
}

export function loadFixtures(path = FIXTURES_PATH): FixtureFile {
  return JSON.parse(readFileSync(path, 'utf8')) as FixtureFile;
}

export function saveFixtures(file: FixtureFile, path = FIXTURES_PATH): void {
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
}

/**
 * Replays recorded model answers instead of calling the API.
 *
 * This is what makes the eval free, instantaneous, deterministic, and runnable
 * in CI with no secrets — and it is also the mode that can quietly lie to you,
 * because a recording is frozen at the moment it was taken. Hence the staleness
 * check: if the prompt has changed since the recording, the result is marked
 * stale and the gate refuses it. See LESSONS.md, Lesson 2.
 */
export function createReplayClient(file: FixtureFile): ModelClient {
  return {
    async call<T>(key: string, req: ModelRequest): Promise<ModelResult<T>> {
      const entry = file.entries[key];
      if (!entry) {
        throw new Error(
          `no fixture for "${key}". Record one with:\n` +
            `  ANTHROPIC_API_KEY=... npm run record\n` +
            `or add an entry to evals/fixtures/model-calls.json.`,
        );
      }

      const expected = requestHash(file.model, req);
      const stale = entry.requestHash !== expected;

      const usage: Usage = entry.usage ?? {
        // No recorded usage: estimate from what the model would have read and
        // written. Marked estimated so the report never presents it as billing.
        inputTokens: estimateTokens(req.prompt) + estimateTokens(req.system),
        cacheReadTokens: req.cacheableContext ? estimateTokens(req.cacheableContext) : 0,
        cacheWriteTokens: 0,
        outputTokens: estimateTokens(JSON.stringify(entry.value)),
        estimated: true,
      };
      void requestChars;

      return {
        value: structuredClone(entry.value) as T,
        call: {
          model: file.model,
          source: 'replay',
          usage,
          latencyMs: entry.latencyMs ?? 0,
          stale,
        },
      };
    },
  };
}
