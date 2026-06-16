# Roadside Co-Pilot — Product Requirements Document

**Author:** Carlos Rymer · **Date:** June 2026 · **Status:** Prototype + v1 plan

## Vision

Make roadside assistance effortless and trustworthy. A stranded driver talks to an AI agent that
handles the whole moment — gathering the details, confirming coverage, getting the car to a repair
shop, and getting the driver safely on their way — with a human supervisor approving the decisions
that matter.

## Goals

**For the driver**

- Get help fast, by just talking — no hold queues, no forms, no repeating details.
- Know clearly and immediately what's covered and what happens next.
- Get the car to the right repair shop and get the driver to their logical next destination (home, or
  the shop to wait) — not just a tow and a goodbye.
- Feel safe and reassured at a stressful moment, with proactive updates.

**For the insurer**

- Cut handle time and cost per claim, and lift throughput (especially during demand spikes).
- Make coverage decisions consistent, explainable, and auditable.
- Shift human agents from data entry to judgment — supervising many AI-run calls at once.
- Strengthen retention and NPS at a decisive moment of truth.

## Key Features

- **Voice intake agent:** natural, interruptible conversation that gathers caller, vehicle, location,
  problem, driveability, and safety, confirming critical details as it goes.
- **Live supervisor console:** the structured claim fills in real time; the human sees exactly what
  the AI heard, decided, and why.
- **Grounded coverage check:** Claude Opus reads the member's policy and returns
  covered / not-covered / partial / needs-review, with cited clauses and a confidence score, rather
  than a black-box yes/no.
- **Next best action:** decides tow vs. mobile-repair and finds the nearest capable shop to repair the
  car, and arranges onward transport (taxi or rental) to get the driver to their next destination —
  home, or the shop to wait.
- **Human-in-the-loop approval gate:** dispatch requires supervisor Approve / Override / Escalate;
  nothing auto-dispatches.
- **Customer notification + audit trail:** approved updates are sent as SMS; every fact, decision, and
  action is logged and persisted.

## Prioritization

To showcase the promise of this solution, we focused on building trust with the customer. The
highest-stakes AI output — the coverage determination — is made explainable (cited clauses plus a
confidence score) and gated by a human before anything is dispatched. We built a believable
end-to-end happy path (voice → coverage → action → approve → notify) rather than chasing breadth,
because a credible core loop is what proves the vision in a demo and in production.

Deferred by design (described, not built): real telephony, live dispatch and onward-transport
(taxi/rental) integrations, damage-photo assessment, multilingual support, and analytics. Each adds
value, but none is required to validate the human↔AI workflow.

## Milestones

Leveraging coding agents plus AWS managed services (Anthropic/Bedrock, API Gateway, Lambda, DynamoDB)
means assembling, not plumbing — so the unit is days/weeks, not quarters.

| When | Milestone | Outcome |
|------|-----------|---------|
| **Days 1–2** | Spike | CDK baseline, end-to-end voice loop, Pages CI *(done in this prototype)* |
| **Week 1** | Core happy path | Real policy ingestion (RAG over actual policy docs), coverage + next-action + approval + notify on realistic data |
| **Week 2** | Trust & HITL hardening | Confidence thresholds + guardrails, escalation flows, full audit trail, coverage-accuracy eval harness |
| **Weeks 3–4** | Integrations | Live garage/tow dispatch, onward transport (taxi/rental), real telephony (Amazon Connect/Twilio), damage-photo assessment |
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
vision-language model (Claude Opus vision, or a fine-tuned CV ensemble):

1. checks image quality and coverage;
2. classifies damage type and affected components;
3. scores severity and infers driveability;
4. feeds the tow-vs-repair decision plus a preliminary repair-cost estimate.

High-value or ambiguous cases route to a human adjuster, whose corrections feed a continuous-learning
loop. This preserves the same pattern throughout the product: **AI assesses and recommends; humans
decide the consequential calls.**
