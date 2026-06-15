# Evals — Roadside Co-Pilot agent

A golden-dataset harness that scores the agent's reasoning endpoints against a rubric, plus a curated
regression gate that runs in CI to catch quality regressions.

## What's evaluated

The agent's two reasoning surfaces, called over HTTP against the deployed API:

- **`/tools/coverage`** — the coverage determination (decision + cited clauses).
- **`/tools/next-action`** — tow vs. mobile-repair + provider selection.

## Rubric (four dimensions, each scored 0–1)

| Dimension | How it's scored | Gates CI? |
|---|---|---|
| **Guided outcome** | Decision / service type matches the expected set for the scenario | ✅ |
| **Tool call** | Structured output is valid; service/capability correct; chosen provider can do the job | ✅ |
| **Hallucination** | Every cited policy quote is **verbatim** in the source policy (markdown/quotes normalized) | ✅ |
| **Relevance** | LLM-as-judge (Claude Opus): does the response address *this* scenario, clearly and on-point | report-only |

Guided outcome, tool call, and hallucination are **deterministic** — they form the CI gate. Relevance
uses an LLM judge (non-deterministic, needs a key), so it enriches the report but does not gate.

> Note on citation recall: the *golden* set asserts which clause should be cited (`expectClauses`);
> the *regression* set drops that assertion because which clause the model cites for the same correct
> outcome legitimately varies. Hallucination still guarantees anything cited is real.

## Datasets

- **`datasets/golden.json`** — broad coverage (25 scenarios): clean approvals, exclusions (off-road,
  DUI, plan gaps), limit edges, safety/injury, unknown member, and all dispatch types. For development
  and richer reporting.
- **`datasets/regression.json`** — curated stable subset (20) for the CI gate; borderline judgment
  calls are intentionally excluded.

## Run it

```bash
npm install
# Defaults to the deployed API; override with EVAL_API_BASE_URL.
npm run eval                 # full golden set, deterministic dimensions
npm run eval:judge           # also run the relevance judge (needs ANTHROPIC_API_KEY)
npm run eval:regression      # regression gate; exits non-zero on any failure
```

A machine-readable report is written to `report/last-run.json`.

## CI

`.github/workflows/eval.yml` runs `npm run eval:regression` on PRs and pushes that touch the agent
(`evals/`, `infra/lambda/`, `data/`). It reads the API URL from the `VITE_API_BASE_URL` repo variable
and hits the live endpoints — no secrets in CI, since the model keys live server-side in Lambda. The
job fails (red) if any regression scenario drops below the gate.
