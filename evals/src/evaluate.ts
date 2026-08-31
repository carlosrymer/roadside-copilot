import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, type Config } from './config.js';
import { REPORT_DIR } from './paths.js';
import { runLocal } from './agent/local.js';
import { runHttp } from './agent/http.js';
import type { ModelClient } from './model/client.js';
import { createLiveClient, AGENT_MODEL } from './model/live.js';
import { createReplayClient, loadFixtures, saveFixtures, type FixtureFile } from './model/replay.js';
import { MUTATIONS, findMutation, withMutation, type Mutation } from './model/mutate.js';
import { callCostUsd, formatUsd } from './model/pricing.js';
import { GATING_DIMENSIONS, scoreGuidedOutcome, scoreHallucination, scoreRelevance, scoreToolCall, judgeAvailable } from './scorers/index.js';
import { diffAgainstBaseline, loadBaseline, saveBaseline, toBaseline } from './report/baseline.js';
import * as out from './report/console.js';
import type { Dataset, RunReport, Scenario, ScenarioResult } from './types.js';

// ---------------------------------------------------------------------------
// Scenario execution
// ---------------------------------------------------------------------------

async function evaluateScenario(
  scenario: Scenario,
  cfg: Config,
  model: ModelClient | undefined,
  judge: boolean,
): Promise<ScenarioResult> {
  const base = { id: scenario.id, target: scenario.target, severity: scenario.severity };

  let run;
  try {
    run = cfg.runner === 'http' ? await runHttp(scenario) : await runLocal(scenario, model!);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const zero = { score: 0, detail };
    // A scenario that could not run is a FAILING scenario, never a skipped one.
    // Silently dropping errors is how a suite ends up reporting 100% while
    // testing nothing.
    return {
      ...base,
      ok: false,
      scores: { guidedOutcome: zero, toolCall: zero, hallucination: zero },
      calls: [],
      wallMs: 0,
      stale: false,
      error: detail,
      raw: null,
    };
  }

  const res = run.response;
  const scores = {
    guidedOutcome: scoreGuidedOutcome(scenario, res),
    toolCall: scoreToolCall(scenario, res),
    hallucination: scoreHallucination(scenario, res),
    relevance: judge ? await scoreRelevance(scenario, res) : undefined,
  };

  const stale = run.calls.some((c) => c.stale);
  const gatingPass = GATING_DIMENSIONS.every((d) => scores[d].score >= 1);
  // A stale fixture means we graded a prompt that no longer exists. That is not
  // a pass, whatever the scores say.
  const ok = gatingPass && (!stale || cfg.allowStale);

  const costs = run.calls.map((c) => callCostUsd(c.model, c.usage));
  const costUsd = costs.every((x) => x !== undefined)
    ? costs.reduce((a, b) => a! + b!, 0)
    : undefined;

  return { ...base, ok, scores, calls: run.calls, wallMs: run.wallMs, costUsd, stale, raw: res };
}

/** Run with a fixed concurrency cap, preserving input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

function buildReport(
  dataset: Dataset,
  cfg: Config,
  results: ScenarioResult[],
  judged: boolean,
  mutation?: string,
): RunReport {
  const costs = results.map((r) => r.costUsd);
  return {
    dataset: dataset.name,
    runner: cfg.runner,
    modelSource: cfg.modelSource,
    mutation,
    judged,
    startedAt: new Date().toISOString(),
    results,
    totals: {
      passed: results.filter((r) => r.ok).length,
      total: results.length,
      costUsd: costs.every((c) => c !== undefined) ? costs.reduce((a, b) => a! + b!, 0) : undefined,
      costEstimated: results.some((r) => r.calls.some((c) => c.usage.estimated)),
      wallMs: results.reduce((a, r) => a + r.wallMs, 0),
      inputTokens: results.reduce(
        (a, r) => a + r.calls.reduce((x, c) => x + c.usage.inputTokens + c.usage.cacheReadTokens + c.usage.cacheWriteTokens, 0),
        0,
      ),
      outputTokens: results.reduce((a, r) => a + r.calls.reduce((x, c) => x + c.usage.outputTokens, 0), 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Model wiring
// ---------------------------------------------------------------------------

function buildModel(cfg: Config, fixtures: FixtureFile | undefined, recorded: FixtureFile | undefined): ModelClient | undefined {
  if (cfg.runner === 'http') return undefined; // the deployment owns its model
  if (cfg.modelSource === 'live') {
    return createLiveClient({
      record: recorded
        ? (key, entry) => {
            recorded.entries[key] = {
              requestHash: entry.requestHash,
              value: entry.value,
              usage: entry.usage as never,
              latencyMs: entry.latencyMs,
            };
          }
        : undefined,
    });
  }
  return createReplayClient(fixtures!);
}

// ---------------------------------------------------------------------------
// Mutation matrix — "which scorer catches which bug?"
// ---------------------------------------------------------------------------

async function runMutationMatrix(dataset: Dataset, cfg: Config, fixtures: FixtureFile): Promise<void> {
  console.log('');
  console.log(out.paint(out.COLORS.BOLD, 'Mutation matrix'));
  console.log(
    out.paint(
      out.COLORS.DIM,
      'Each row breaks the agent one way, then runs the whole suite.\n' +
        'A dimension that never drops is a dimension that is not doing any work —\n' +
        'and a row where NOTHING drops is a bug your rubric cannot see.',
    ),
  );
  console.log('');

  const clean = await mapLimit(dataset.scenarios, cfg.concurrency, (s) =>
    evaluateScenario(s, cfg, createReplayClient(fixtures), false),
  );
  const rows: { label: string; pass: string; go: string; tc: string; hall: string; note: string }[] = [
    {
      label: 'none (baseline)',
      pass: `${clean.filter((r) => r.ok).length}/${clean.length}`,
      go: avg(clean, 'guidedOutcome'),
      tc: avg(clean, 'toolCall'),
      hall: avg(clean, 'hallucination'),
      note: '',
    },
  ];

  for (const m of MUTATIONS) {
    const results = await mapLimit(dataset.scenarios, cfg.concurrency, (s) =>
      evaluateScenario(s, cfg, withMutation(createReplayClient(fixtures), m), false),
    );
    const caughtBy = (['guidedOutcome', 'toolCall', 'hallucination'] as const).filter(
      (d) => Number(avg(results, d)) < Number(avg(clean, d)) - 1e-9,
    );
    rows.push({
      label: m.name,
      pass: `${results.filter((r) => r.ok).length}/${results.length}`,
      go: avg(results, 'guidedOutcome'),
      tc: avg(results, 'toolCall'),
      hall: avg(results, 'hallucination'),
      note: caughtBy.length ? `caught by ${caughtBy.join(' + ')}` : 'UNCAUGHT',
    });
  }

  const w = Math.max(...rows.map((r) => r.label.length));
  console.log(out.paint(out.COLORS.DIM, `${'mutation'.padEnd(w)}  pass    OUT    TOOL   HALL   verdict`));
  for (const r of rows) {
    const uncaught = r.note === 'UNCAUGHT';
    console.log(
      `${r.label.padEnd(w)}  ${r.pass.padEnd(6)} ${r.go}  ${r.tc}  ${r.hall}  ` +
        (uncaught ? out.paint(out.COLORS.RED, r.note) : out.paint(out.COLORS.DIM, r.note)),
    );
  }
  console.log('');
  for (const m of MUTATIONS) {
    console.log(out.paint(out.COLORS.DIM, `  ${m.name}: ${m.imitates}`));
  }
  console.log('');
}

function avg(results: ScenarioResult[], dim: 'guidedOutcome' | 'toolCall' | 'hallucination'): string {
  const xs = results.map((r) => r.scores[dim].score);
  return (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const cfg = parseArgs();
  const dataset = JSON.parse(readFileSync(cfg.datasetPath, 'utf8')) as Dataset;
  if (cfg.only) {
    dataset.scenarios = dataset.scenarios.filter((s) => s.id.includes(cfg.only!));
    if (dataset.scenarios.length === 0) throw new Error(`--only=${cfg.only} matched no scenarios`);
  }

  const needFixtures = cfg.runner === 'local' && cfg.modelSource === 'replay';
  const fixtures = needFixtures || cfg.mutate !== undefined ? loadFixtures() : undefined;

  // Bare `--mutate` is the teaching mode: every mutation, one table.
  if (cfg.mutate === '') {
    await runMutationMatrix(dataset, cfg, fixtures!);
    return;
  }

  const mutation: Mutation | undefined = cfg.mutate ? findMutation(cfg.mutate) : undefined;
  const recorded: FixtureFile | undefined = cfg.record
    ? { ...loadFixtures(), provenance: 'recorded', model: AGENT_MODEL, recordedAt: new Date().toISOString() }
    : undefined;

  let model = buildModel(cfg, fixtures, recorded);
  if (model && mutation) model = withMutation(model, mutation);

  const judged = cfg.judge && judgeAvailable();
  if (cfg.judge && !judged) {
    console.warn('\n⚠  --judge requested but ANTHROPIC_API_KEY is unset; relevance will be skipped.');
  }

  const extra: string[] = [];
  if (fixtures && cfg.modelSource === 'replay') {
    extra.push(`fixtures=${fixtures.provenance}`);
  }
  out.header({ dataset: dataset.name, runner: cfg.runner, modelSource: cfg.modelSource, mutation: mutation?.name, judged }, extra);

  if (fixtures?.provenance === 'authored' && cfg.modelSource === 'replay') {
    console.log(
      out.paint(
        out.COLORS.YELLOW,
        'Note: these fixtures are AUTHORED, not recorded from the live model.\n' +
          '      They exercise the harness end to end with no key and no spend, but\n' +
          '      they are not evidence about the real agent. Run `npm run record`\n' +
          '      with a key to replace them with genuine responses.\n',
      ),
    );
  }

  const results = await mapLimit(dataset.scenarios, cfg.concurrency, (s) =>
    evaluateScenario(s, cfg, model, judged),
  );

  out.scenarioTable(results);
  const report = buildReport(dataset, cfg, results, judged, mutation?.name);
  out.summary(report);

  if (mutation) {
    console.log('');
    console.log(out.paint(out.COLORS.DIM, `  mutation "${mutation.name}" imitates: ${mutation.imitates}`));
    console.log(out.paint(out.COLORS.DIM, `  expected to be caught by: ${mutation.expectedCatch}`));
  }

  // Persist the machine-readable run, always.
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, 'last-run.json'), `${JSON.stringify(report, null, 2)}\n`);

  if (recorded) {
    saveFixtures(recorded);
    console.log(`\n  recorded ${Object.keys(recorded.entries).length} fixture(s) → evals/fixtures/model-calls.json`);
  }

  const stale = results.filter((r) => r.stale);
  if (stale.length && !cfg.allowStale) {
    console.log('');
    console.log(
      out.paint(
        out.COLORS.YELLOW,
        `  ${stale.length} fixture(s) are STALE — the prompt changed since they were recorded,\n` +
          `  so these scores describe an agent that no longer exists. Re-record with\n` +
          `  \`npm run record\`, or re-stamp authored fixtures with \`npm run fixtures:rehash\`.`,
      ),
    );
  }

  let regressed = 0;
  if (cfg.diff || cfg.updateBaseline) {
    const baseline = loadBaseline();
    if (!baseline) {
      console.log('\n  no baseline yet — run `npm run baseline:update` to record one.');
    } else {
      const deltas = diffAgainstBaseline(results, baseline);
      out.deltaReport(deltas);
      regressed = deltas.filter((d) => d.kind === 'regressed').length;
    }
  }

  if (cfg.updateBaseline) {
    saveBaseline(toBaseline(report, `${cfg.runner}/${cfg.modelSource}`));
    console.log('\n  baseline updated → evals/report/baseline.json (commit this)');
  }

  console.log('');
  if (cfg.gate) {
    const failed = report.totals.total - report.totals.passed;
    if (failed > 0 || regressed > 0) {
      console.error(
        out.paint(
          out.COLORS.RED,
          `✗ gate FAILED — ${failed} scenario(s) below threshold` +
            (regressed ? `, ${regressed} regression(s) vs. baseline` : '') +
            `.`,
        ),
      );
      process.exit(1);
    }
    console.log(out.paint(out.COLORS.GREEN, `✓ gate passed — ${report.totals.passed}/${report.totals.total}, ${formatUsd(report.totals.costUsd)}`));
  }
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
