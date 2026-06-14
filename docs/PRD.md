# Roadside Co-Pilot — Product Requirements Document

**Author:** Carlos Rymer · **Date:** June 2026 · **Status:** Prototype + v1 plan

## Vision

Roadside assistance is a high-stress, human-intensive workflow: a driver in distress waits on hold
while an agent manually gathers details, looks up coverage, and finds a garage. **Roadside Co-Pilot**
turns this into an instant, self-serve voice experience backed by AI — while keeping a human in the
loop where it matters. The customer talks to a natural voice agent; AI gathers the claim, determines
coverage **with cited policy clauses**, and recommends the next best action; a human supervisor
approves dispatch from a live console. The goal: cut handle time and cost, improve consistency and
auditability, and shift human agents from data entry to judgment — supervising many AI-run calls
instead of running one at a time.

## Key Features

- **Voice intake agent** — natural, interruptible conversation that gathers caller, vehicle, location,
  problem, driveability, and safety, confirming critical details as it goes.
- **Live supervisor console** — the structured claim fills in real time; the human sees exactly what
  the AI heard, decided, and why.
- **Grounded coverage check** — Claude Opus reads the member's policy and returns
  covered / not-covered / partial / needs-review with **cited clauses + confidence** — not a
  black-box yes/no.
- **Next best action** — AI decides tow vs. mobile-repair and selects the nearest capable provider
  with ETA and alternatives.
- **Human-in-the-loop approval gate** — dispatch requires supervisor **Approve / Override / Escalate**;
  nothing auto-dispatches.
- **Customer notification + audit trail** — approved updates are sent as SMS; every fact, decision,
  and action is logged and persisted.

## Prioritization

Built **trust-first and volume-first**. The riskiest, highest-value AI output — the coverage
determination — is made explainable (citations + confidence) and gated by a human before anything is
dispatched. We prioritized a believable **end-to-end happy path** (voice → coverage → action →
approve → notify) over feature breadth, because a credible core loop is what proves the vision in a
demo and in production. Deferred by design (described, not built): real telephony, live dispatch
integrations, damage-photo assessment, multilingual support, and analytics — each adds value, but
none is required to validate the human↔AI workflow.

## Milestones (days/weeks — agent- and managed-service-accelerated)

Leveraging coding agents plus AWS managed services (Anthropic/Bedrock, API Gateway, Lambda, DynamoDB)
means **assembling, not plumbing** — so the unit is days/weeks, not quarters.

| When | Milestone | Outcome |
|------|-----------|---------|
| **Days 1–2** | Spike | CDK baseline, end-to-end voice loop, Pages CI *(done in this prototype)* |
| **Week 1** | Core happy path | Real policy ingestion (RAG over actual policy docs), coverage + next-action + approval + notify on realistic data |
| **Week 2** | Trust & HITL hardening | Confidence thresholds + guardrails, escalation flows, full audit trail, coverage-accuracy eval harness |
| **Weeks 3–4** | Integrations | Live garage/tow dispatch, taxi/rental, real telephony (Amazon Connect/Twilio), damage-photo assessment |
| **Weeks 5–6** | Productionize | Bedrock migration (in-account governance/data residency), PII + compliance, observability, latency tuning, pilot |

## Technical Risks

- **Coverage accuracy / citation hallucination** — ground strictly on retrieved policy text, verify
  quoted clauses against source, gate low-confidence results and *all* denials behind humans, run
  continuous evals.
- **Voice in the wild** — noise, accents, multilingual, poor connectivity; mitigate with robust turn
  detection, spoken confirmations, and graceful fallback to a human.
- **Customer safety** — injuries or danger must short-circuit to 911 + a human; safety detection is
  first-class, not an afterthought.
- **Liability of automated denial** — never auto-deny; humans own negative and edge decisions.
- **PII & data residency** — location and personal data are sensitive; production likely runs Opus on
  **Bedrock** for in-account processing, encryption, and retention control.
- **Voice-vendor dependency** — abstract the voice layer so OpenAI Realtime can be swapped for Amazon
  Nova Sonic or a cascading Transcribe→LLM→Polly stack.
- **Integration reliability** — dispatch and telephony systems are legacy; need idempotency, retries,
  and human fallback.

## AI Integration — Damage Assessment (future)

For accident cases, add multimodal damage assessment. The customer submits photos or short video; a
vision-language model (Claude Opus vision, or a fine-tuned CV ensemble) (1) checks image
quality/coverage, (2) classifies damage type and affected components, (3) scores severity and infers
driveability, and (4) feeds the tow-vs-repair decision plus a preliminary repair-cost estimate.
High-value or ambiguous cases route to a human adjuster, whose corrections feed a continuous-learning
loop. This preserves the same pattern throughout the product: **AI assesses and recommends; humans
decide the consequential calls.**
