# Roadside Co-Pilot

An AI **co-pilot** for car-insurance roadside-assistance claims. A customer talks to a voice agent;
the agent gathers the claim, checks policy coverage with **cited clauses**, recommends the next best
action (nearest garage + tow vs. mobile-repair), and a **human supervisor approves** the dispatch from
a live console. A reference prototype for an AI-assisted insurance claims workflow.

> **Design stance:** this is a *co-pilot*, not full automation. The AI does the gathering and the
> reasoning; a human stays in the loop on every dispatch decision. The supervisor console is the
> centerpiece, and the focus is on UX (how it works) over UI polish.

📄 [Product Requirements Document](docs/PRD.md) · 🏗 [Architecture](docs/architecture.md)

## How it works

```
Customer (voice)  ──WebRTC──►  OpenAI Realtime  ──function calls──►  AWS API ──► Claude Opus
                                     │                                  │
                                     ▼                                  ▼
                          live transcript + intake        coverage (cited) • next action • SMS
                                     └────────►  Supervisor Console  ◄────┘
                                          APPROVE / OVERRIDE / ESCALATE  →  fake SMS to customer
```

- **Voice** — OpenAI Realtime API over WebRTC. Audio streams browser↔OpenAI directly; AWS only mints a
  short-lived session token, so keys never reach the client. *Ears + mouth.*
- **Brain** — Claude Opus (Anthropic API) for the auditable coverage determination (cited clauses +
  confidence) and the tow-vs-repair decision. *The brain.* Voice and brain are decoupled and swappable.
- **Human-in-the-loop** — dispatch is gated behind a supervisor approval; nothing auto-dispatches.

## Repo layout

| Path | What |
|------|------|
| `web/`   | Vite + React + TypeScript SPA (deploys to GitHub Pages) |
| `infra/` | AWS CDK app + Lambda handlers (API Gateway, DynamoDB, Secrets Manager) |
| `data/`  | Synthetic policies, policy documents, garages, customers |
| `evals/` | Golden-dataset eval harness + CI regression gate (rubric: relevance, tool-call, hallucination, guided outcome) |
| `docs/`  | PRD (≤2 pages) + architecture |

## Run it

### 1. Deploy the API (AWS)

```bash
cd infra
npm install
export CDK_DEFAULT_REGION=us-east-1
npx cdk bootstrap                 # first time per account/region
npx cdk deploy -c allowedOrigin=https://<your-gh-user>.github.io
```

Then set the API keys on the secret (ARN is a stack output):

```bash
aws secretsmanager put-secret-value \
  --secret-id roadside-copilot/api-keys \
  --secret-string '{"OPENAI_API_KEY":"sk-...","ANTHROPIC_API_KEY":"sk-ant-..."}'
```

Note the `ApiUrl` stack output.

### 2. Run the web app (local)

```bash
cd web
npm install
echo "VITE_API_BASE_URL=<ApiUrl from the stack>" > .env.local
npm run dev      # http://localhost:5173 (Chrome; allow microphone)
```

Click **Start call**, describe a breakdown (e.g. *"I'm Maria Gonzalez, member MAM-48213, my Camry was
in a collision and won't start"*), and watch the supervisor console fill in, the coverage decision
appear with cited clauses, the recommended dispatch, and — after you **Approve** — the SMS land in the
customer's inbox. Try member `MAM-33057` (Basic plan) with a collision to see a coverage gap flagged
for human review.

### 3. Publish the UI (GitHub Pages)

- Repo **Settings → Pages → Source: GitHub Actions**.
- Add a repo **variable** `VITE_API_BASE_URL` = your `ApiUrl`.
- Push to `main` (or run the workflow) — `.github/workflows/deploy-pages.yml` builds and deploys.

## Models

| Layer | Choice | Why |
|-------|--------|-----|
| Voice | OpenAI Realtime (`gpt-realtime`, WebRTC) | Best conversational quality; low plumbing via ephemeral tokens |
| Reasoning / vision | Claude Opus (Anthropic API) | Strongest, auditable reasoning with cited clauses; global default |

Model names are env-overridable (`REALTIME_MODEL`, `REALTIME_VOICE`, `ANTHROPIC_MODEL`).

## Evaluating the agent

The agent's reasoning is scored against a golden dataset on a four-dimension rubric — **guided outcome,
tool call, hallucination** (cited clauses must be verbatim in the policy), and **relevance** (LLM judge).
A curated regression gate runs in CI on every PR/push that touches the agent.

```bash
cd evals && npm install
npm run eval             # full golden set
npm run eval:regression  # CI gate (exits non-zero on any failure)
```

See [evals/README.md](evals/README.md) for the rubric and datasets.

## Limitations (prototype)

- Chrome recommended (WebRTC + mic).
- Breakdown location uses the member's home base as a stand-in for a geocoder.
- Synthetic data only; SMS is simulated in the web app.
- Single-browser demo (customer + supervisor side by side); a real deployment would split these across
  devices with live sync.

## License

MIT — see [LICENSE](LICENSE).
