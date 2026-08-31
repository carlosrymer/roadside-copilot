import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVALS_ROOT } from './paths.js';
import { JUDGE_MODEL, judgeAvailable, judgeRelevance } from './scorers/relevance.js';
import { paint, COLORS } from './report/console.js';
import type { Dataset, Scenario } from './types.js';

/**
 * JUDGE CALIBRATION — measuring whether the grader agrees with a human.
 *
 * An LLM judge produces a confident number for anything you hand it. That number
 * is worth exactly as much as its agreement with people who know the domain, and
 * you cannot know that agreement without measuring it. An uncalibrated judge is
 * not a weak signal; it is an unknown one, and teams routinely tune prompts
 * against judges nobody has ever checked.
 *
 * What this reports:
 *   exact       — % where judge grade == human grade. Harsh on a 5-point scale.
 *   within ±1   — % close enough to be useful. The number most worth watching.
 *   MAE         — mean absolute error, in grade points.
 *   bias        — signed mean error. Positive means the judge is a soft marker.
 *   kappa_w     — quadratic-weighted Cohen's kappa: agreement AFTER discounting
 *                 what chance alone would produce. 1 is perfect, 0 is chance,
 *                 below 0 is worse than chance. Raw agreement flatters a judge
 *                 that always answers 4; kappa does not.
 */

interface CalibrationItem {
  id: string;
  scenarioId: string;
  humanGrade: number;
  why: string;
  response: unknown;
}

interface CalibrationSet {
  name: string;
  labeller: string;
  items: CalibrationItem[];
}

/** Quadratic-weighted Cohen's kappa over an ordinal scale. */
export function quadraticWeightedKappa(human: number[], judge: number[], min = 1, max = 5): number {
  const k = max - min + 1;
  const idx = (v: number) => Math.min(max, Math.max(min, Math.round(v))) - min;
  const n = human.length;
  if (n === 0) return NaN;

  const observed = Array.from({ length: k }, () => new Array(k).fill(0));
  const humanHist = new Array(k).fill(0);
  const judgeHist = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    observed[idx(human[i])][idx(judge[i])]++;
    humanHist[idx(human[i])]++;
    judgeHist[idx(judge[i])]++;
  }

  let num = 0;
  let den = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const w = (i - j) ** 2 / (k - 1) ** 2;
      const expected = (humanHist[i] * judgeHist[j]) / n;
      num += w * observed[i][j];
      den += w * expected;
    }
  }
  return den === 0 ? 1 : 1 - num / den;
}

async function main() {
  if (!judgeAvailable()) {
    console.error(
      '\nCalibration needs ANTHROPIC_API_KEY — it is the one part of this harness that\n' +
        'cannot be replayed, because the whole point is to measure the live judge.\n',
    );
    process.exit(1);
  }

  const set = JSON.parse(
    readFileSync(join(EVALS_ROOT, 'datasets', 'judge-calibration.json'), 'utf8'),
  ) as CalibrationSet;
  const golden = JSON.parse(
    readFileSync(join(EVALS_ROOT, 'datasets', 'golden.json'), 'utf8'),
  ) as Dataset;
  const byId = new Map<string, Scenario>(golden.scenarios.map((s) => [s.id, s]));

  console.log(`\n${paint(COLORS.BOLD, set.name)}`);
  console.log(paint(COLORS.DIM, `judge=${JUDGE_MODEL}  ·  ${set.items.length} labelled items`));
  console.log(paint(COLORS.YELLOW, `\nLabels: ${set.labeller}\n`));

  const humans: number[] = [];
  const judges: number[] = [];

  console.log(paint(COLORS.DIM, `${'item'.padEnd(9)} human  judge  Δ   reasoning`));
  for (const item of set.items) {
    const scenario = byId.get(item.scenarioId);
    if (!scenario) throw new Error(`calibration item ${item.id} references unknown scenario`);
    const { grade, reasoning } = await judgeRelevance(scenario, item.response);
    humans.push(item.humanGrade);
    judges.push(grade);
    const delta = grade - item.humanGrade;
    const tone = delta === 0 ? COLORS.GREEN : Math.abs(delta) === 1 ? COLORS.YELLOW : COLORS.RED;
    console.log(
      `${item.id.padEnd(9)}   ${item.humanGrade}      ${grade}   ` +
        `${paint(tone, (delta > 0 ? `+${delta}` : `${delta}`).padEnd(3))} ${paint(COLORS.DIM, reasoning.slice(0, 90))}`,
    );
  }

  const n = humans.length;
  const errors = judges.map((j, i) => j - humans[i]);
  const exact = errors.filter((e) => e === 0).length / n;
  const within1 = errors.filter((e) => Math.abs(e) <= 1).length / n;
  const mae = errors.reduce((a, e) => a + Math.abs(e), 0) / n;
  const bias = errors.reduce((a, e) => a + e, 0) / n;
  const kappa = quadraticWeightedKappa(humans, judges);

  console.log('');
  console.log(paint(COLORS.BOLD, '── Agreement ' + '─'.repeat(46)));
  console.log(`  exact          ${(exact * 100).toFixed(0)}%`);
  console.log(`  within ±1      ${(within1 * 100).toFixed(0)}%`);
  console.log(`  MAE            ${mae.toFixed(2)} grade points`);
  console.log(`  bias           ${bias >= 0 ? '+' : ''}${bias.toFixed(2)}  ${bias > 0.25 ? '(judge marks softer than the human)' : bias < -0.25 ? '(judge marks harder than the human)' : '(no strong lean)'}`);
  console.log(`  kappa_w        ${kappa.toFixed(2)}  ${verdict(kappa)}`);
  console.log('');
  console.log(
    paint(
      COLORS.DIM,
      '  A judge below ~0.6 kappa is not measuring what you think it is. Fix it by\n' +
        '  narrowing what it grades or sharpening the scale descriptions — not by\n' +
        '  reaching for a bigger model, which usually moves this number very little.\n' +
        `  With n=${n} these figures are indicative only; a real calibration set wants\n` +
        '  50+ items and more than one human labeller.',
    ),
  );
  console.log('');
}

function verdict(kappa: number): string {
  if (Number.isNaN(kappa)) return '';
  if (kappa >= 0.8) return '(strong agreement)';
  if (kappa >= 0.6) return '(usable — treat as a soft signal)';
  if (kappa >= 0.4) return '(weak — do not make decisions on this alone)';
  return '(near chance — this judge is not measuring relevance)';
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
