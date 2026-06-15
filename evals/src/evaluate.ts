import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import type { Dataset, ScenarioResult } from './types';
import { runAgent, API_BASE } from './runAgent';
import { scoreGuidedOutcome, scoreToolCall, scoreHallucination } from './scorers';
import { judgeAvailable, scoreRelevance } from './judge';

const here = dirname(fileURLToPath(import.meta.url));

interface Args {
  datasetPath: string;
  gate: boolean;
  judge: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const datasetPath = argv.find((a) => !a.startsWith('--')) ?? 'datasets/golden.json';
  return {
    datasetPath: resolve(process.cwd(), datasetPath),
    gate: argv.includes('--gate'),
    judge: argv.includes('--judge'),
  };
}

/** Run async tasks with a fixed concurrency cap, preserving order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

function bar(score: number): string {
  return score >= 0.999 ? '✓' : score === 0 ? '✗' : score.toFixed(2);
}

async function main() {
  const args = parseArgs();
  const dataset = JSON.parse(readFileSync(args.datasetPath, 'utf8')) as Dataset;
  const useJudge = args.judge && judgeAvailable();

  console.log(`\nEvaluating "${dataset.name}" — ${dataset.scenarios.length} scenarios`);
  console.log(`API: ${API_BASE}`);
  console.log(`Relevance judge: ${useJudge ? 'on' : args.judge ? 'requested but no key' : 'off'}\n`);

  const results = await mapLimit(dataset.scenarios, 4, async (scenario): Promise<ScenarioResult> => {
    try {
      const res = await runAgent(scenario);
      const guidedOutcome = scoreGuidedOutcome(scenario, res);
      const toolCall = scoreToolCall(scenario, res);
      const hallucination = scoreHallucination(scenario, res);
      const relevance = useJudge ? await scoreRelevance(scenario, res) : undefined;
      const ok =
        guidedOutcome.score >= 1 && toolCall.score >= 1 && hallucination.score >= 1;
      return { id: scenario.id, target: scenario.target, ok, scores: { guidedOutcome, toolCall, hallucination, relevance }, raw: res };
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'error';
      const fail = { score: 0, detail };
      return {
        id: scenario.id,
        target: scenario.target,
        ok: false,
        scores: { guidedOutcome: fail, toolCall: fail, hallucination: fail },
        raw: { error: detail },
      };
    }
  });

  // Per-scenario table.
  for (const r of results) {
    const s = r.scores;
    const rel = s.relevance ? ` REL ${bar(s.relevance.score)}` : '';
    console.log(
      `${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(28)} ` +
        `GO ${bar(s.guidedOutcome.score)}  TC ${bar(s.toolCall.score)}  HALL ${bar(s.hallucination.score)}${rel}`,
    );
    if (!r.ok) {
      if (s.guidedOutcome.score < 1) console.log(`        outcome: ${s.guidedOutcome.detail}`);
      if (s.toolCall.score < 1) console.log(`        toolcall: ${s.toolCall.detail}`);
      if (s.hallucination.score < 1) console.log(`        halluc:  ${s.hallucination.detail}`);
    }
  }

  // Summary.
  const avg = (pick: (r: ScenarioResult) => number | undefined) => {
    const xs = results.map(pick).filter((x): x is number => x !== undefined);
    return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3) : 'n/a';
  };
  const passed = results.filter((r) => r.ok).length;
  console.log('\n── Summary ───────────────────────────────');
  console.log(`Gate pass:      ${passed}/${results.length}`);
  console.log(`Guided outcome: ${avg((r) => r.scores.guidedOutcome.score)}`);
  console.log(`Tool call:      ${avg((r) => r.scores.toolCall.score)}`);
  console.log(`Hallucination:  ${avg((r) => r.scores.hallucination.score)}`);
  console.log(`Relevance:      ${avg((r) => r.scores.relevance?.score)}`);

  // Persist a machine-readable report.
  const reportDir = join(here, '..', 'report');
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    join(reportDir, 'last-run.json'),
    JSON.stringify({ dataset: dataset.name, api: API_BASE, results }, null, 2),
  );

  if (args.gate && passed < results.length) {
    console.error(`\n✗ Regression gate FAILED: ${results.length - passed} scenario(s) below threshold.\n`);
    process.exit(1);
  }
  console.log(`\n✓ Done.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
