# Evals — Roadside Co-Pilot agent

Measures the agent's two reasoning surfaces against a golden dataset on a
four-dimension rubric, and gates CI on the deterministic part.

**New to evals?** Read [LESSONS.md](./LESSONS.md) instead — same code, walked
through as eight hands-on lessons. This file is the design rationale.

```bash
cd evals && npm install
npm run eval          # 27 scenarios, offline, free, ~instant
npm run eval:broken   # prove the scorers actually catch bugs
npm test              # tests for the scorers themselves
```

---

## What is measured

| Surface | Decides |
|---|---|
| `coverage` | covered / not-covered / partial / needs-review, with cited clauses |
| `next_action` | tow vs. mobile repair, required capability, chosen provider |

## The rubric

| Dimension | Question it answers | Mechanism | Gates CI |
|---|---|---|---|
| **Guided outcome** | Did it reach the right end state? | decision ∈ acceptable set | ✅ |
| **Tool call** | Is the output well-formed *and* usable downstream? | enum validity, confidence range, escalation flag, citation recall, provider capability | ✅ |
| **Hallucination** | Is every quoted clause real? | verbatim match against the member's own policy | ✅ |
| **Relevance** | Does it address *this* caller? | LLM-as-judge (Claude Opus) | ❌ never |

Three deterministic dimensions form the gate. The judge is non-deterministic,
costs money and needs a key, so it enriches the report and never blocks a build.

**Precision and recall are split on purpose.** `hallucination` is citation
*precision* — everything cited is real. Citation *recall* — the governing clause
was cited at all — is a check inside `toolCall`. An agent that cites nothing
scores a perfect 1.0 on hallucination, which is a correct measurement of the
wrong thing. Both halves are needed.

---

## Design decisions

### The agent runs in-process by default

`infra/lambda/shared/tasks/*.ts` hold the prompts and schemas as pure modules —
no AWS imports, no data-file imports, no bundler-only `.md` imports. The Lambda
handler and the eval harness import the *same* constants, so they cannot drift.

That seam is what makes `--runner=local` possible: evals run with no deploy, no
credentials and no network. `--runner=http` still exists and exercises the whole
stack, at the cost of being the only mode that cannot report token usage.

### Model responses are replayed by default

`src/model/client.ts` defines a one-method `ModelClient`. Three implementations
plug into it: live Anthropic, fixture replay, and a mutating wrapper. Choosing
between them is a startup decision; nothing downstream knows the difference.

Replay makes the suite free, instant, keyless and perfectly repeatable — which
is what lets CI run it on every PR with no secrets.

**Staleness.** A recording is only valid for the prompt it was recorded against.
Every fixture stores a hash of its rendered request; when the prompt moves, the
result is flagged `[stale]` and the gate rejects it. Without this, changing a
system prompt leaves a replay suite passing green against an agent that no
longer exists — the most common silent failure in recorded evals.

### The fixtures shipped here are authored, not recorded

`fixtures/model-calls.json` was **hand-written** so every command runs with no
key and no spend. The policy quotes inside are genuine verbatim text, and the
harness exercises end to end — but the responses were composed, not observed.
They are not evidence about the real agent, and the tool prints that warning on
every replayed run.

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run record   # replace with real responses
```

### Expectations are sets, and severity is not averaged

`acceptableDecisions` is a list. Where two answers are genuinely defensible — a
benefit cap that *might* bind is arguably `partial` and arguably `needs_review` —
accepting both keeps the suite measuring the agent rather than the dataset
author's taste.

Scenarios encoding a safety or liability rule are marked `severity: "critical"`
and reported separately. Averaging "never auto-deny a claim" into a suite mean is
how a broken safety rule ships.

### Two datasets, on purpose

- `datasets/golden.json` — 27 scenarios: every plan, every problem type, both
  endpoints, plus safety and identity guardrails. Includes borderline cases, and
  two that fail today by design.
- `datasets/regression.json` — the same set minus three genuinely borderline
  judgement calls. This is what CI gates on.

A gate that goes red for defensible answers gets switched off, and a gate people
switch off protects nothing.

### Baselines, not absolute thresholds

`report/baseline.json` is committed. `npm run diff` reports `regressed`
(pass → fail, fails the build) separately from `degraded` (partial-credit drop,
a warning). Changing a score becomes a visible diff in code review instead of
drift nobody noticed.

### Cost is tracked from the first run

Per-call token usage rolls up into the report. `src/model/pricing.ts` accounts
for prompt caching correctly: `input_tokens` is the uncached remainder only, so
cache reads (0.1×) and cache writes (1.25×) are separate buckets. Getting that
wrong under-reports a cache-heavy prompt like this one, which ships an entire
policy document. Replayed runs label their figures `estimated` — derived from
character counts, never a bill.

---

## Commands

| Command | What it does |
|---|---|
| `npm run eval` | Golden set, replayed, offline |
| `npm run eval:gate` | Regression set, exits non-zero on failure — what CI runs |
| `npm run eval:broken` | Mutation matrix: which dimension catches which bug |
| `npm test` | Meta-eval — 19 tests for the scorers themselves |
| `npm run diff` | Compare against `report/baseline.json` |
| `npm run baseline:update` | Record a new baseline (commit the result) |
| `npm run eval:live` | Call the real model (needs `ANTHROPIC_API_KEY`) |
| `npm run eval:judge` | Add the relevance judge (needs a key) |
| `npm run record` | Capture real model responses into the fixtures |
| `npm run fixtures:rehash` | Re-stamp *authored* fixtures against current prompts |
| `npm run judge:calibrate` | Measure judge↔human agreement (needs a key) |
| `npm run typecheck` | `tsc --noEmit` |

Useful flags: `--runner=http`, `--model=live`, `--only=<substr>`,
`--mutate=<name>`, `--allow-stale`, `--concurrency=N`. `--help` lists them all.

---

## The mutation matrix

`npm run eval:broken` breaks the agent eight ways and reports which dimension
notices:

```
mutation              pass    OUT    TOOL   HALL   verdict
none (baseline)       25/27  0.93  0.98  1.00
hallucinate-citation  8/27   0.93  0.98  0.37  caught by hallucination
drop-citations        9/27   0.93  0.78  1.00  caught by toolCall
flip-decision         11/27  0.41  0.98  1.00  caught by guidedOutcome
never-escalate        18/27  0.93  0.89  1.00  caught by toolCall
invalid-enum          8/27   0.93  0.65  1.00  caught by toolCall
always-tow            19/27  0.78  0.86  1.00  caught by guidedOutcome + toolCall
wrong-capability      19/27  0.93  0.86  1.00  caught by toolCall
overpromise           25/27  0.93  0.98  1.00  UNCAUGHT
```

Every dimension drops on something, so none is dead weight. `overpromise` — the
agent telling a customer a truck is en route before a supervisor approved it —
passes clean, and that is left in deliberately: it is a real bug the rubric
cannot see. LESSONS.md Exercise 4b walks through closing it.

---

## CI

The workflow runs typecheck, the scorer meta-tests, then `npm run eval:gate` on
PRs touching `evals/`, `infra/lambda/` or `data/`. No secrets: replay needs no
key.

> **Not yet active.** The workflow is parked at [`ci/eval.yml`](./ci/eval.yml)
> because the token that pushed this branch lacked GitHub's `workflow` scope.
> Activate it with:
> ```bash
> git mv evals/ci/eval.yml .github/workflows/eval.yml && git commit -m "ci(evals): add the eval regression gate workflow"
> ```

That also bounds what CI catches. It gates prompts, scorers, datasets and
plumbing — not the model. Model-version drift and real non-determinism only show
up in a live run, which costs money and cannot gate a PR.

## Known limits

- Fixtures are authored, not recorded (above).
- No repeat-runs, pass^k, or confidence intervals — replay is perfectly
  repeatable, which hides the non-determinism a live suite has to handle.
- 27 scenarios catches gross regressions, not percentage points.
- The judge calibration set is 12 items from one labeller; treat its kappa as
  indicative only.
- `coverage` and `next_action` are graded in isolation; nothing tests them as a
  chain, so "should this dispatch have been blocked by the coverage result?" is
  unmeasured.
- No adversarial or prompt-injection scenarios.
