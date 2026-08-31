import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVALS_ROOT } from './paths.js';
import { runLocal } from './agent/local.js';
import { requestHash, type ModelClient, type ModelRequest, type ModelResult } from './model/client.js';
import { loadFixtures, saveFixtures } from './model/replay.js';
import type { Dataset } from './types.js';

/**
 * Re-stamp authored fixtures with the hash of the CURRENT prompt.
 *
 * Only meaningful for authored fixtures: a real recording's hash is set at the
 * moment it is captured, and re-stamping one would forge the very check that
 * tells you the recording is out of date. Running this after a prompt change
 * says "yes, I know the prompt moved, and I have re-read these answers and they
 * still stand" — a claim only a human can make.
 */
async function main() {
  const fixtures = loadFixtures();
  if (fixtures.provenance !== 'authored') {
    throw new Error(
      'refusing to re-stamp recorded fixtures — that would fake the staleness check.\n' +
        'Re-record them instead: ANTHROPIC_API_KEY=... npm run record',
    );
  }

  const dataset = JSON.parse(
    readFileSync(join(EVALS_ROOT, 'datasets', 'golden.json'), 'utf8'),
  ) as Dataset;

  let stamped = 0;
  for (const scenario of dataset.scenarios) {
    const entry = fixtures.entries[scenario.id];
    if (!entry) continue;

    // A client that answers from the fixture and reports back what was asked.
    let seen: ModelRequest | undefined;
    const capture: ModelClient = {
      async call<T>(_key: string, req: ModelRequest): Promise<ModelResult<T>> {
        seen = req;
        return {
          value: entry.value as T,
          call: {
            model: fixtures.model,
            source: 'replay',
            usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, estimated: true },
            latencyMs: 0,
          },
        };
      },
    };

    await runLocal(scenario, capture);
    if (!seen) continue;
    const next = requestHash(fixtures.model, seen);
    if (entry.requestHash !== next) stamped++;
    entry.requestHash = next;
  }

  saveFixtures(fixtures);
  console.log(`stamped ${stamped} fixture(s) against the current prompts.`);
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
