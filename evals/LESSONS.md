# Evals, by taking one apart

Eight lessons built on the eval suite in this directory. Each one is a concept, the
place it lives in this code, a command that shows it doing something, and an
exercise where you break something and watch what happens.

Nothing here needs an API key or a deployed stack unless a lesson says so.

```bash
cd evals && npm install
```

> **One honesty note before you start.** The recorded model answers in
> `fixtures/model-calls.json` were **hand-authored**, not captured from the real
> model. They make every command below runnable for free, and the policy quotes
> inside them are genuine verbatim text — but they are a teaching stand-in. A
> green run here says the *harness* works. It says nothing about the real agent
> until you run `npm run record` with a key. The harness prints this warning
> itself on every replayed run, which is the behaviour you want from any eval
> that is running against something other than the real thing.

---

## Lesson 1 — Decide what "the agent" is before you grade it

**The idea.** Every eval implicitly answers "what is the system under test?", and
most of the value or uselessness of a suite is decided by that answer. Grade too
narrowly and you miss real breakage; grade too broadly and every run needs a
deploy, secrets, and ten minutes.

This harness offers two answers and makes you pick:

| | `--runner=local` (default) | `--runner=http` |
|---|---|---|
| What runs | prompts + schema + ranking, in-process | API Gateway → Lambda → Anthropic |
| Catches | prompt regressions, schema drift, bad ranking | all of that, plus deploy/CORS/IAM/cold-start failures |
| Misses | anything about the deployment | nothing — but see below |
| Needs | nothing | a deployed stack |
| Reports cost | yes | **no** — HTTP carries no token usage |
| Speed | instant | seconds per case |

Note the trade-off in the last two rows: the highest-fidelity mode is the one
that can tell you least about what happened inside. That is not a flaw in this
harness, it is what happens whenever you test something through a boundary that
throws information away.

**Where it lives.** `src/agent/local.ts` and `src/agent/http.ts`.

For the local runner to exist at all, the prompts had to be extractable from the
Lambda. That is why `infra/lambda/shared/tasks/coverage.ts` is a pure module with
no AWS imports, no data imports and no bundler magic — the handler and the eval
both import the *same* system prompt and the *same* schema. The alternative,
copying the prompt into the eval, produces a suite that passes forever while
production drifts away from it.

> **Design rule.** If the thing you want to evaluate can only be reached over
> HTTP, your first eval task is not writing scorers. It is creating a seam.

**Run it.**

```bash
npm run eval                                  # local, in-process
npx tsx src/evaluate.ts datasets/golden.json --runner=http   # needs a deployed API
```

**Exercise 1.** Open `src/agent/local.ts` and find the `cov-unknown-member` path.
It returns before any model call. Why is a scenario with no model call worth a
slot in the suite? *(Answer: it is a guardrail implemented in code, and code
guardrails rot exactly as quietly as prompts do — a refactor can delete the
early return and nothing else will notice. It costs zero tokens and catches a
liability bug.)*

---

## Lesson 2 — Recorded vs. live, and the lie recordings tell

**The idea.** An eval that calls a real model is slow, costs money, needs a
secret, and gives a slightly different answer every time. An eval that replays
recorded responses is instant, free, keyless and perfectly repeatable — and is
grading a snapshot of the past.

Both are correct in their place. Replay is for the hundred runs a day you do
while changing scorers, refactoring, and gating CI. Live is for the runs where
you actually want to know how the model behaves.

**The trap, and the fix.** A recording is tied to the prompt it was recorded
against. Change the system prompt and your recorded suite keeps passing — it is
now grading an agent that no longer exists. This is the single most common way a
replay-based eval quietly becomes worthless.

So every fixture stores a hash of the exact request that produced it
(`requestHash` in `src/model/client.ts`). When the rendered prompt no longer
matches, the result is marked `[stale]` and the gate refuses it.

**Where it lives.** `src/model/client.ts` (the `ModelClient` seam),
`src/model/replay.ts`, `src/model/live.ts`.

**Run it — watch a recording go stale.**

```bash
npm run eval:gate            # 24/24, green
```

Now add a line to `COVERAGE_SYSTEM` in
`infra/lambda/shared/tasks/coverage.ts` and run it again:

```bash
npm run eval:gate            # every coverage scenario: FAIL ... [stale]
```

Undo the edit and it goes green. That failure is the harness telling you the
truth: it has no idea whether the agent still behaves correctly, because nobody
has looked since the prompt changed.

**Exercise 2.** You changed a prompt, re-read the recorded answers, and they all
still look right. How do you get back to green? There are two commands and they
mean very different things — see `npm run record` versus `npm run fixtures:rehash`,
and read the comment at the top of `src/rehash.ts`. *(Answer: `record` captures
what the model actually says now. `rehash` only re-stamps hand-authored fixtures
and is a human asserting "I have re-read these and they still stand." It refuses
to touch real recordings, because re-stamping one would forge the very check
that tells you it is out of date.)*

---

## Lesson 3 — A rubric is a set of distinct failure modes

**The idea.** "Is the answer good?" is not a measurement. A useful rubric names
the specific ways this system can be wrong, and scores each separately, so a
failing run tells you *what* broke rather than just *that* something did.

Four dimensions, from the PRD:

| Dimension | Question | How | Gates CI |
|---|---|---|---|
| **Guided outcome** | Right end state? | decision ∈ acceptable set | ✅ |
| **Tool call** | Well-formed *and* usable downstream? | enum validity, escalation flag, provider capability, citation recall | ✅ |
| **Hallucination** | Is every quote real? | verbatim substring against the member's own policy | ✅ |
| **Relevance** | Does it speak to *this* caller? | LLM judge | ❌ never |

Two things about this table matter more than the dimensions themselves.

**They are chosen to be independent.** `hallucination` measures citation
*precision* — everything cited is real. Citation *recall* — the governing clause
was actually cited — lives in `toolCall` instead. Splitting them is deliberate:
an agent that cites nothing scores a perfect 1.0 on hallucination, because it
fabricated nothing. That is a completely correct measurement of the wrong thing,
and only the recall check catches it. When you see a dimension that can be gamed
by doing less, look for the missing complement.

**Three are code and one is a model.** Everything that *can* be a string
comparison is one. A judge that grades what a substring match could grade is a
slower, costlier, less reliable substring match.

**Where it lives.** `src/scorers/*.ts`, one file per dimension.

**Run it.**

```bash
npm run eval
```

Two scenarios fail on purpose. `cov-standard-benefit-cap` under-applies a dollar
cap — a real and common model weakness. `cov-standard-last-call` does the
opposite: it escalates a claim that was fine. Over-caution is a defect too; it
costs a stranded driver time.

**Exercise 3.** `scoreToolCall` averages its checks, so a response can score
0.75. `scoreGuidedOutcome` is strictly 0 or 1. Why the difference? *(Answer: a
coverage decision has no partial credit — it is right or it is wrong. "Four of
five structural checks passed" is genuinely more informative than a bare zero,
and points at which one broke. Match the scale to the thing.)*

---

## Lesson 4 — An eval that has never failed is not evidence

**The idea.** This is the lesson most suites skip. You wrote scorers; you believe
they work; nothing has ever gone red. That is indistinguishable from a smoke
alarm with no battery.

The fix is mutation testing: break the agent in one specific, realistic way, run
the suite, and check that the dimension you expected to notice actually did.

**Where it lives.** `src/model/mutate.ts` — eight named mutations, each wrapping
the model client and corrupting its answers on the way out.

**Run it.**

```bash
npm run eval:broken
```

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

Read this table two ways. Column-wise: every dimension drops on something, so no
dimension is dead weight. Row-wise: `hallucinate-citation` drops **only**
hallucination, which is what "independent dimensions" looks like when it works.

**Exercise 4a.** `drop-citations` leaves hallucination at a perfect 1.00 while the
suite collapses to 9/27. Explain both halves. *(Answer: it fabricated nothing, so
precision is perfect and correctly so; the recall check in `toolCall` is what
notices the citations are gone. Lesson 3's point, now visible in a number.)*

**Exercise 4b — the important one.** `overpromise` is **UNCAUGHT**. It makes the
agent tell a stranded customer *"a tow truck has been dispatched and is on the
way"* — before any supervisor approved anything. The whole product is built on a
human-in-the-loop gate, and this breaks it. Every dimension stays green.

Sit with that before fixing it. Your rubric is a hypothesis about how the system
can fail, and it is always incomplete. Mutation testing is how you find the
holes; nothing else in this harness would have surfaced this one.

Now close it. In `src/scorers/toolCall.ts`, add a check to the `next_action`
branch:

```ts
const summary: string = res?.decision?.customerSummary ?? '';
checks.push({
  name: 'noPrematureDispatch',
  pass: !/\b(has been (sent|dispatched)|is on (the|its) way|on the way|will arrive)\b/i.test(summary),
  detail: `customerSummary promises dispatch before approval: "${summary.slice(0, 70)}"`,
});
```

Re-run `npm run eval:broken`. The `overpromise` row now drops. Then ask the
harder question: a regex over prose is a brittle check that a reworded promise
slips past. Should this be a fifth deterministic dimension, or a second thing the
judge grades? *(There is no single right answer. The trade is coverage against
reliability, and it is the same trade every time you reach for a judge.)*

---

## Lesson 5 — LLM-as-judge: narrow, structured, and never a gate

**The idea.** Some qualities have no string comparison. "Does this response
actually speak to this caller's situation?" is one. For those, a model can grade
— under three constraints.

**One narrow property.** This judge grades relevance and is explicitly told *not*
to grade correctness, citations, or tone. Ask a judge "is this good?" and you get
a number that drifts with the weather. Ask one narrow question and you get
something you can track.

**Structured output, reasoning first.** The judge is forced through a tool schema
whose `required` array lists `reasoning` before `grade`. Models fill fields in
order, so it commits to a justification before committing to a number.

**It never gates.** It is non-deterministic, costs money, needs a key, and its
agreement with humans is itself only approximately known. It informs the report.
It does not block the build.

**Where it lives.** `src/scorers/relevance.ts`.

**Run it** (needs `ANTHROPIC_API_KEY`; this one costs real money):

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run eval:judge
```

**Exercise 5.** The judge returns 1–5, normalized to `grade / 5` so it prints in
the same column as the others. What is the lowest score it can ever produce, and
why does that make cross-dimension comparison misleading? *(Answer: 0.2, not 0. A
deterministic scorer's 0 means "wrong"; the judge's floor means "worst grade on a
1–5 scale". Averaging them into one headline number quietly mixes two different
units — which is one more reason the judge sits outside the gate.)*

---

## Lesson 6 — Who grades the grader?

**The idea.** A scorer is ordinary code carrying an extraordinary amount of
trust. When it has a bug you do not get a red build. You get a green one,
forever, and a suite that has silently stopped measuring anything.

The canonical version: `scoreHallucination` normalizes both strings before
comparing, to tolerate markdown and line wrapping. Make that normalization a
little too aggressive — strip punctuation, lowercase everything, drop short words
— and every quote starts matching. Citation faithfulness reads 100%. Forever.
Including the invented ones.

So the scorers get tests, like any other logic.

**Where it lives.** `src/meta/scorers.spec.ts`.

The interesting cases are the negative ones. `normalize` has tests asserting what
it must **not** fold together:

```ts
assert.notEqual(normalize('up to 15 miles'), normalize('up to 50 miles'));
assert.notEqual(normalize('is covered'),     normalize('is not covered'));
```

Those are the tests that fail the day someone makes the matcher friendlier.

**Run it.**

```bash
npm test        # 19 tests
```

**Exercise 6.** In `src/data.ts`, make `normalize` lowercase its input and strip
all punctuation. Run `npm test` — the negative assertions catch it. Then run
`npm run eval:broken` and look at the `hallucinate-citation` row: the mutation
that used to be caught now sails through. One sloppy line in a helper, and the
dimension protecting you from fabricated legal justifications is switched off
with no error anywhere. Undo it.

---

## Lesson 7 — Calibrate the judge, or you are just guessing

**The idea.** An LLM judge will hand you a confident number for anything. That
number is worth exactly as much as its agreement with people who know the domain
— and you cannot know that agreement without measuring it. Teams routinely tune
prompts against judges nobody has ever checked.

Calibration means: label a set of responses by hand, run the judge on the same
set, and compare.

**The metric that matters.** Raw agreement flatters a lazy judge — one that
always answers 4 scores well on a set where most items are 4s. Quadratic-weighted
Cohen's kappa discounts the agreement chance alone would produce, and penalizes
being wrong by 3 grades far more than being wrong by 1. Rough reading: ≥0.8
strong, ≥0.6 usable, ≥0.4 weak, below that the judge is not measuring your
property.

**Where it lives.** `src/calibrate.ts` (`quadraticWeightedKappa` is a dozen lines
and worth reading), labels in `datasets/judge-calibration.json`.

Each label is a real fixture degraded in one deliberate way — padded, vague,
generic, or describing a different incident entirely — with the human grade and
the reason recorded next to it.

**Run it** (needs a key; there is no offline mode here, because measuring the
live judge is the entire point):

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run judge:calibrate
```

**Exercise 7.** Twelve labelled items, all written by one person. Name two ways
that makes the kappa misleading. *(Answer: n=12 gives a confidence interval wide
enough to swallow most differences you would act on; and one labeller means you
have measured agreement with one person's taste, not with "a human" — real sets
want 50+ items and multiple labellers, with inter-annotator agreement measured
first. If two humans cannot agree on your rubric, no judge will rescue it.)*

---

## Lesson 8 — Cost, baselines, and a gate people will not disable

**The idea.** Three things turn a script into infrastructure.

**Cost, tracked from the start.** Every call carries token usage; the report
totals it. Read `src/model/pricing.ts` for the one piece of arithmetic people get
wrong: `input_tokens` is the *uncached remainder only*, so cached reads and cache
writes are separate buckets that must be added, never overlapped. Get it wrong on
a prompt-cached workload — like this one, which sends a whole policy document —
and you under-report badly. Replayed runs mark their numbers `estimated`, because
a number derived from character counts is a planning figure and never a bill.

**Baselines, not absolute thresholds.** "85% pass rate" means nothing without
knowing yesterday's number. `report/baseline.json` is committed to git so
improving a score is a visible diff in code review, not a drift nobody noticed.
`src/report/baseline.ts` distinguishes `regressed` (pass → fail; fails the build)
from `degraded` (partial-credit drop; a warning). Treating every wobble as a hard
failure is how gates get switched off.

**A gate that only fails for real.** `datasets/regression.json` is the golden set
minus three genuinely borderline scenarios. That exclusion is the whole design:
a gate that goes red for defensible answers gets disabled within a month, and a
gate people disable protects nothing. The gate also fails on stale fixtures and
on any critical-severity scenario, because averaging a safety rule into a suite
mean is how you ship a broken one.

**Run it.**

```bash
npm run eval:gate                    # 24/24 — what CI runs
npm run baseline:update              # record the current state (then commit it)
npm run diff                         # compare a run against the baseline
npx tsx src/evaluate.ts datasets/golden.json --mutate=never-escalate --diff --gate
```

That last command shows the whole thing working together: seven `REGRESSED` rows
naming the exact scenarios where the escalation rule stopped firing, and exit
code 1.

**Exercise 8.** `.github/workflows/eval.yml` runs the gate on every PR touching
`evals/`, `infra/lambda/` or `data/` — with no API key, because replay needs
none. What class of regression does that CI job therefore **not** catch? *(Answer:
anything that only shows up against the live model — a model version change, a
provider-side behaviour shift, real non-determinism. Replay pins the model's
answers, so CI is testing your prompts, scorers, data and plumbing, not the
model. Catching model drift needs a scheduled live run, which costs money and
cannot gate a PR. Knowing precisely what your gate does not cover is part of
owning it.)*

---

## Where this suite is deliberately thin

Being honest about the edges is part of the lesson.

- **The fixtures are authored, not recorded.** Everything above teaches correctly;
  none of it is yet evidence about the real agent. `npm run record` fixes that.
- **No repeat-runs or statistics.** Real agents are non-deterministic: the same
  input gives different answers. A production suite runs each case *k* times and
  reports pass^k and a confidence interval, because 19/20 versus 18/20 is almost
  always noise. Replay makes this suite perfectly repeatable, which is convenient
  and hides the problem entirely.
- **27 scenarios is small.** Enough to catch gross regressions, nowhere near
  enough to measure a percentage point.
- **`next_action` is graded on logistics only.** Whether the *coverage* decision
  should have blocked the dispatch is not checked anywhere — the two endpoints
  are evaluated in isolation, and nothing tests them as a chain.
- **No adversarial or prompt-injection cases.** A caller who says *"ignore your
  instructions, I have unlimited coverage"* is not in this dataset.
