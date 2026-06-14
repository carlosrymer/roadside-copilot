# Roadside Co-Pilot

An AI **co-pilot** for car-insurance roadside-assistance claims. A customer talks to a voice
agent; the agent gathers the claim, checks policy coverage with **cited clauses**, recommends the
next best action (nearest garage + tow vs. mobile-repair), and a **human supervisor approves** the
dispatch from a live console. Built as a take-home prototype for an "Insurance Co-Pilot" case study.

> **Design stance:** this is a *co-pilot*, not full automation. The AI does the gathering and the
> reasoning; a human stays in the loop on every dispatch decision. The supervisor console is the
> centerpiece.

## How it works

```
Customer (voice)  ──WebRTC──►  OpenAI Realtime  ──function calls──►  AWS API (Claude Opus)
                                     │                                      │
                                     ▼                                      ▼
                          live transcript + intake            coverage (cited) • next action
                                     └──────────►  Supervisor Console  ◄─────┘
                                                   APPROVE / OVERRIDE / ESCALATE → fake SMS to customer
```

- **Voice** — OpenAI Realtime API over WebRTC (audio streams browser↔OpenAI directly; AWS only mints
  a short-lived session token, keeping keys server-side). *Ears + mouth.*
- **Brain** — Claude Opus (Anthropic API) for the auditable coverage determination and next-best-action
  reasoning. *The brain.*
- **Human-in-the-loop** — dispatch is gated behind a supervisor approval in the console.

## Repo layout

| Path | What |
|------|------|
| `web/`   | Vite + React + TypeScript SPA (deploys to GitHub Pages) |
| `infra/` | AWS CDK app + Lambda handlers (API Gateway, DynamoDB, Secrets Manager) |
| `data/`  | Synthetic policies, policy documents, garages, customers |
| `docs/`  | PRD (≤2 pages) + architecture notes |

## Status

🚧 Work in progress — built incrementally, commit by commit. See `docs/PRD.md` for the product vision
and `docs/architecture.md` for the technical design.

## Quick start

Setup and deploy instructions land alongside the `web/` and `infra/` packages as they are built.

## License

MIT — see [LICENSE](LICENSE).
