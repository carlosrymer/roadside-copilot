import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const EVALS_ROOT = join(here, '..');
export const REPO_ROOT = join(EVALS_ROOT, '..');
export const DATA_DIR = join(REPO_ROOT, 'data');
export const FIXTURES_PATH = join(EVALS_ROOT, 'fixtures', 'model-calls.json');
export const REPORT_DIR = join(EVALS_ROOT, 'report');
export const BASELINE_PATH = join(REPORT_DIR, 'baseline.json');
