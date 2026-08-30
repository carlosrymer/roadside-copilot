import type { AgentRun, Scenario } from '../types.js';

/**
 * Runs the agent against the DEPLOYED API — the whole stack, exactly as the
 * browser hits it.
 *
 * The trade-off against the local runner, in one line: this is the only mode
 * that can catch a broken deploy, and the only mode that cannot tell you what
 * anything cost, because the HTTP response carries no token usage. Fidelity and
 * observability pull in opposite directions. See LESSONS.md, Lesson 1.
 */

export const API_BASE =
  process.env.EVAL_API_BASE_URL ?? 'https://g6kv2bs4m2.execute-api.us-east-1.amazonaws.com';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runHttp(scenario: Scenario, attempts = 4): Promise<AgentRun> {
  const path = scenario.target === 'coverage' ? '/tools/coverage' : '/tools/next-action';
  const started = Date.now();
  let lastErr = '';

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(scenario.input),
      });
      if (res.ok) {
        return { response: await res.json(), calls: [], wallMs: Date.now() - started };
      }
      lastErr = `${res.status}: ${(await res.text()).slice(0, 150)}`;
      // 4xx other than throttling is our bug, not the network's — stop retrying.
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : 'network error';
    }
    if (i < attempts - 1) await sleep(800 * (i + 1));
  }
  throw new Error(`${scenario.target} failed after ${attempts} attempts — ${lastErr}`);
}
