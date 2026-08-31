import { resolve } from 'node:path';
import type { ModelSource, RunnerKind } from './types.js';

export interface Config {
  datasetPath: string;
  runner: RunnerKind;
  modelSource: ModelSource;
  /** Fail the process on any gating failure. */
  gate: boolean;
  judge: boolean;
  record: boolean;
  /** '' means "run every mutation and print the matrix". */
  mutate?: string;
  diff: boolean;
  updateBaseline: boolean;
  allowStale: boolean;
  only?: string;
  concurrency: number;
}

const USAGE = `
Usage: tsx src/evaluate.ts [dataset.json] [options]

  --runner=local|http     local (default): run the agent in-process.
                          http: call the deployed API end to end.
  --model=replay|live     replay (default): use recorded fixtures — free,
                          deterministic, no key. live: call the real API.
  --gate                  exit non-zero on any gating failure. For CI.
  --judge                 also run the LLM relevance judge (needs a key).
  --record                write live responses back into the fixtures file.
  --mutate[=name]         corrupt the agent's answers. Bare --mutate runs every
                          mutation and prints the which-scorer-catches-what matrix.
  --diff                  compare this run against report/baseline.json.
  --update-baseline       overwrite the baseline with this run.
  --allow-stale           replay fixtures even when the prompt has changed.
  --only=<substr>         run only scenarios whose id contains <substr>.
  --concurrency=<n>       parallel scenarios (default 6; 1 when recording).
`.trim();

export function parseArgs(argv = process.argv.slice(2)): Config {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }

  const flag = (name: string): string | undefined => {
    const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (hit === undefined) return undefined;
    const eq = hit.indexOf('=');
    return eq === -1 ? '' : hit.slice(eq + 1);
  };
  const has = (name: string) => flag(name) !== undefined;

  const runner = (flag('runner') || 'local') as RunnerKind;
  const modelSource = (flag('model') || 'replay') as ModelSource;
  if (runner !== 'local' && runner !== 'http') throw new Error(`--runner must be local or http`);
  if (modelSource !== 'replay' && modelSource !== 'live') throw new Error(`--model must be replay or live`);

  const record = has('record');
  if (record && modelSource !== 'live') {
    throw new Error('--record needs --model=live: there is nothing to record from a replay.');
  }
  if (runner === 'http' && (modelSource === 'live' || record)) {
    // The deployed API owns its own model client; the harness cannot swap it.
    throw new Error('--runner=http controls neither the model nor recording. Drop --model/--record.');
  }

  return {
    datasetPath: resolve(process.cwd(), argv.find((a) => !a.startsWith('--')) ?? 'datasets/golden.json'),
    runner,
    modelSource,
    gate: has('gate'),
    judge: has('judge'),
    record,
    mutate: flag('mutate'),
    diff: has('diff'),
    updateBaseline: has('update-baseline'),
    allowStale: has('allow-stale'),
    only: flag('only') || undefined,
    concurrency: Number(flag('concurrency')) || (record ? 1 : 6),
  };
}
