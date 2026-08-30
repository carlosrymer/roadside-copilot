import { formatUsd } from '../model/pricing.js';
import type { Delta } from './baseline.js';
import type { DimensionName, RunReport, ScenarioResult } from '../types.js';

const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const OFF = '\x1b[0m';

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string, s: string) => (color ? `${code}${s}${OFF}` : s);

export function cell(score: number | undefined): string {
  if (score === undefined) return c(DIM, '  – ');
  if (score >= 0.999) return c(GREEN, '  ✓ ');
  if (score === 0) return c(RED, '  ✗ ');
  return c(YELLOW, score.toFixed(2));
}

export function header(report: Pick<RunReport, 'dataset' | 'runner' | 'modelSource' | 'mutation' | 'judged'>, extra: string[] = []): void {
  console.log('');
  console.log(c(BOLD, report.dataset));
  const bits = [`runner=${report.runner}`, `model=${report.modelSource}`, `judge=${report.judged ? 'on' : 'off'}`];
  if (report.mutation) bits.push(c(YELLOW, `mutation=${report.mutation}`));
  console.log(c(DIM, bits.concat(extra).join('  ·  ')));
  console.log('');
}

export function scenarioTable(results: ScenarioResult[]): void {
  const w = Math.max(8, ...results.map((r) => r.id.length)) + 2;
  console.log(c(DIM, `${''.padEnd(6)}${'scenario'.padEnd(w)} OUT  TOOL HALL REL`));
  for (const r of results) {
    const s = r.scores;
    const status = r.ok ? c(GREEN, 'PASS ') : c(RED, 'FAIL ');
    const flag = r.stale ? c(YELLOW, ' [stale]') : '';
    const crit = r.severity === 'critical' ? c(DIM, ' !') : '';
    console.log(
      `${status} ${r.id.padEnd(w)}${cell(s.guidedOutcome.score)} ${cell(s.toolCall.score)} ${cell(
        s.hallucination.score,
      )} ${cell(s.relevance?.score)}${crit}${flag}`,
    );
    if (!r.ok) {
      for (const [name, dim] of Object.entries(s) as [DimensionName, { score: number; detail: string }][]) {
        if (name === 'relevance' || !dim || dim.score >= 1) continue;
        console.log(c(DIM, `${' '.repeat(w - 14)}${name.padEnd(16)} ${dim.detail}`));
      }
      if (r.error) console.log(c(DIM, `${' '.repeat(w - 14)}${'error'.padEnd(16)} ${r.error}`));
    }
  }
}

export function summary(report: RunReport): void {
  const { totals, results } = report;
  const avg = (pick: (r: ScenarioResult) => number | undefined) => {
    const xs = results.map(pick).filter((x): x is number => x !== undefined);
    return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3) : '  n/a';
  };
  const critical = results.filter((r) => r.severity === 'critical');
  const criticalPassed = critical.filter((r) => r.ok).length;

  console.log('');
  console.log(c(BOLD, '── Summary ' + '─'.repeat(48)));
  console.log(`  gate pass        ${totals.passed}/${totals.total}`);
  console.log(
    `  critical pass    ${criticalPassed}/${critical.length}` +
      (criticalPassed < critical.length ? c(RED, '   ← safety/liability rules are failing') : ''),
  );
  console.log(`  guided outcome   ${avg((r) => r.scores.guidedOutcome.score)}`);
  console.log(`  tool call        ${avg((r) => r.scores.toolCall.score)}`);
  console.log(`  hallucination    ${avg((r) => r.scores.hallucination.score)}`);
  console.log(`  relevance        ${avg((r) => r.scores.relevance?.score)}` + c(DIM, '   (report only — never gates)'));
  console.log('');
  const costLabel = totals.costUsd === undefined
    ? 'n/a (HTTP runner reports no token usage)'
    : `${formatUsd(totals.costUsd)}${totals.costEstimated ? c(DIM, '  (estimated from replayed fixtures)') : ''}`;
  console.log(`  cost             ${costLabel}`);
  console.log(`  tokens           ${totals.inputTokens.toLocaleString()} in / ${totals.outputTokens.toLocaleString()} out`);
  console.log(`  wall time        ${(totals.wallMs / 1000).toFixed(1)}s`);
}

export function deltaReport(deltas: Delta[]): void {
  console.log('');
  console.log(c(BOLD, '── vs. baseline ' + '─'.repeat(43)));
  if (deltas.length === 0) {
    console.log(c(GREEN, '  no change'));
    return;
  }
  const order: Delta['kind'][] = ['regressed', 'degraded', 'fixed', 'improved', 'new', 'removed'];
  const tone: Record<Delta['kind'], string> = {
    regressed: RED,
    degraded: YELLOW,
    fixed: GREEN,
    improved: GREEN,
    new: DIM,
    removed: DIM,
  };
  for (const kind of order) {
    for (const d of deltas.filter((x) => x.kind === kind)) {
      console.log(`  ${c(tone[kind], kind.toUpperCase().padEnd(10))} ${d.id.padEnd(30)} ${c(DIM, d.detail)}`);
    }
  }
}

export const paint = c;
export const COLORS = { DIM, RED, GREEN, YELLOW, BOLD };
