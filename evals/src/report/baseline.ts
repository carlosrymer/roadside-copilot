import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BASELINE_PATH, REPORT_DIR } from '../paths.js';
import type { RunReport, ScenarioResult } from '../types.js';

/**
 * Baselines: comparing a run against the LAST run, not against an absolute bar.
 *
 * "85% pass rate" is almost meaningless on its own — you cannot tell whether
 * that is excellent or a catastrophe without knowing what it was yesterday. The
 * question a gate should answer is "did this change make anything worse?", and
 * that needs a committed record of what "before" looked like.
 *
 * The baseline lives in git on purpose. Every change to it shows up in code
 * review as a diff, so improving a score is a deliberate, visible act rather
 * than something that drifts.
 */

export interface BaselineEntry {
  ok: boolean;
  guidedOutcome: number;
  toolCall: number;
  hallucination: number;
}

export interface Baseline {
  updatedAt: string;
  dataset: string;
  modelSource: string;
  note?: string;
  /** Estimated cost of the baseline run, for spotting cost regressions. */
  costUsd?: number;
  scenarios: Record<string, BaselineEntry>;
}

export function toBaseline(report: RunReport, note?: string): Baseline {
  const scenarios: Record<string, BaselineEntry> = {};
  for (const r of report.results) {
    scenarios[r.id] = {
      ok: r.ok,
      guidedOutcome: round(r.scores.guidedOutcome.score),
      toolCall: round(r.scores.toolCall.score),
      hallucination: round(r.scores.hallucination.score),
    };
  }
  return {
    updatedAt: new Date().toISOString(),
    dataset: report.dataset,
    modelSource: report.modelSource,
    note,
    costUsd: report.totals.costUsd,
    scenarios,
  };
}

export function loadBaseline(path = BASELINE_PATH): Baseline | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as Baseline;
}

export function saveBaseline(baseline: Baseline, path = BASELINE_PATH): void {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
}

export interface Delta {
  id: string;
  kind: 'regressed' | 'fixed' | 'degraded' | 'improved' | 'new' | 'removed';
  detail: string;
}

/**
 * Diff a run against a baseline.
 *
 * `regressed` (pass → fail) is the only kind that should ever fail a build.
 * `degraded` is a partial-credit drop that has not yet crossed the line — it is
 * the early warning, and treating it as a hard failure trains people to ignore
 * the gate.
 */
export function diffAgainstBaseline(results: ScenarioResult[], baseline: Baseline): Delta[] {
  const deltas: Delta[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    seen.add(r.id);
    const before = baseline.scenarios[r.id];
    if (!before) {
      deltas.push({ id: r.id, kind: 'new', detail: `not in baseline (${r.ok ? 'passing' : 'FAILING'})` });
      continue;
    }
    if (before.ok && !r.ok) {
      deltas.push({ id: r.id, kind: 'regressed', detail: failureSummary(r) });
      continue;
    }
    if (!before.ok && r.ok) {
      deltas.push({ id: r.id, kind: 'fixed', detail: 'now passing' });
      continue;
    }
    for (const dim of ['guidedOutcome', 'toolCall', 'hallucination'] as const) {
      const now = round(r.scores[dim].score);
      const then = before[dim];
      if (now < then) {
        deltas.push({ id: r.id, kind: 'degraded', detail: `${dim} ${then} → ${now}` });
      } else if (now > then) {
        deltas.push({ id: r.id, kind: 'improved', detail: `${dim} ${then} → ${now}` });
      }
    }
  }

  for (const id of Object.keys(baseline.scenarios)) {
    if (!seen.has(id)) {
      deltas.push({ id, kind: 'removed', detail: 'in baseline but not in this run' });
    }
  }
  return deltas;
}

function failureSummary(r: ScenarioResult): string {
  const parts: string[] = [];
  if (r.scores.guidedOutcome.score < 1) parts.push(r.scores.guidedOutcome.detail);
  if (r.scores.toolCall.score < 1) parts.push(r.scores.toolCall.detail);
  if (r.scores.hallucination.score < 1) parts.push(r.scores.hallucination.detail);
  return parts.join(' | ') || r.error || 'failed';
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
