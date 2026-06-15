import type { Scenario } from './types';

const API_BASE =
  process.env.EVAL_API_BASE_URL ?? 'https://g6kv2bs4m2.execute-api.us-east-1.amazonaws.com';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Call the deployed agent endpoint for a scenario and return its JSON response.
 * Retries transient failures (429/5xx, network) with backoff so cold starts and
 * throttling don't make the regression gate flaky.
 */
export async function runAgent(scenario: Scenario, attempts = 4): Promise<any> {
  const path = scenario.target === 'coverage' ? '/tools/coverage' : '/tools/next-action';
  let lastErr = '';
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(scenario.input),
      });
      if (res.ok) return await res.json();
      lastErr = `${res.status}: ${(await res.text()).slice(0, 150)}`;
      if (res.status < 500 && res.status !== 429) break; // non-transient
    } catch (e) {
      lastErr = e instanceof Error ? e.message : 'network error';
    }
    if (i < attempts - 1) await sleep(800 * (i + 1));
  }
  throw new Error(`${scenario.target} failed after ${attempts} attempts — ${lastErr}`);
}

export { API_BASE };
