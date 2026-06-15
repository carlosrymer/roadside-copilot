# Architecture

Roadside Co-Pilot is a static single-page app (GitHub Pages) talking to a thin serverless API on AWS
(provisioned with CDK). Voice runs directly between the browser and OpenAI Realtime; the AWS API mints
the session token and runs the reasoning tools on Claude Opus.

## Components

```mermaid
flowchart LR
  subgraph Browser["Browser — GitHub Pages SPA"]
    CP["Customer call panel<br/>(mic, transcript, SMS)"]
    SC["Supervisor console<br/>(intake, coverage, action, approve)"]
  end

  RT["OpenAI Realtime<br/>(gpt-realtime, WebRTC)"]
  AN["Anthropic API<br/>(Claude Opus)"]

  subgraph AWS["AWS — provisioned by CDK"]
    GW["API Gateway (HTTP)"]
    SESS["/session"]
    COV["/tools/coverage"]
    NEXT["/tools/next-action"]
    NOTE["/tools/notify"]
    DDB[("DynamoDB<br/>claims + audit")]
    SM[("Secrets Manager<br/>OpenAI + Anthropic keys")]
  end

  CP -- "audio (WebRTC)" --> RT
  RT -- "function calls" --> CP
  CP -- "POST /session" --> GW --> SESS --> SM
  SESS -- "mint ek_ token" --> RT
  CP -- "tool calls" --> GW
  GW --> COV --> AN
  GW --> NEXT --> AN
  GW --> NOTE --> AN
  COV --> SM
  NOTE --> DDB
  CP -. "shared state" .- SC
```

## Call flow

```mermaid
sequenceDiagram
  participant C as Customer
  participant B as Browser SPA
  participant O as OpenAI Realtime
  participant A as AWS API
  participant X as Claude Opus
  participant H as Supervisor

  C->>B: Start call (mic)
  B->>A: POST /session
  A-->>B: ephemeral token
  B->>O: WebRTC offer (token)
  O-->>B: answer (audio + events)
  C->>O: "My car broke down…"
  O->>B: update_claim(...)
  B->>H: live intake fills in
  O->>B: check_coverage(...)
  B->>A: POST /tools/coverage
  A->>X: policy + incident → determination
  X-->>A: decision + cited clauses
  A-->>B: coverage result
  O->>B: find_next_action(...)
  B->>A: POST /tools/next-action
  A->>X: tow vs repair?
  X-->>A: service + capability
  A-->>B: provider + ETA
  B->>H: recommendation (pending)
  H->>B: Approve
  B->>A: POST /tools/notify
  A->>X: compose SMS
  A->>A: persist claim + notification
  A-->>B: SMS → customer inbox
```

## Why this shape

- **Static UI + thin API.** GitHub Pages can't hold secrets, so all keys live in AWS Secrets Manager
  and the SPA only ever talks to our API (or, for audio, to OpenAI using a short-lived token). This
  also keeps the front end trivially cacheable and free to host.
- **OpenAI Realtime over WebRTC.** Best-in-class conversational voice with **low plumbing**: the heavy
  audio stream is browser↔OpenAI directly; AWS only mints an ephemeral `ek_` token, so the real key
  never reaches the client.
- **Claude Opus as the brain.** Coverage decisions must be auditable. Opus returns cited clauses +
  confidence via tool-forced structured output, and the policy document is sent as a
  prompt-cached block. *Voice and brain are decoupled and independently swappable.*
- **Per-route Lambdas behind one HTTP API.** Each tool is an isolated function; `addRoute()` wires a
  new one in a line. DynamoDB stores the claim snapshot + an append-only audit/notification trail.

## Quality & evals (planned fast-follow)

Out of scope for the day-one prototype, but the immediate next step. The plan is to score the reasoning
endpoints against a golden dataset on a four-dimension rubric — **guided outcome** (correct decision),
**tool call** (valid structured output + correct service/capability/provider), **hallucination** (every
cited clause quote verbatim in the source policy), and **relevance** (LLM-as-judge) — with the
deterministic dimensions forming a **CI regression gate** against the live API (keys stay server-side,
so CI needs no secrets). This makes coverage accuracy and citation-faithfulness measurable and
regression-proof, which is essential for an auditable insurance decision. A working spike lives on the
`spike/evals` branch.

## Production note

The prototype calls the Anthropic API directly for velocity. For an enterprise insurer, production
would likely run Opus on **Amazon Bedrock** for in-account data residency, IAM auth, and governance —
the same model behind a different transport, isolated to the `shared/anthropic` module.

See [PRD.md](./PRD.md) for product scope, milestones, and risks.
