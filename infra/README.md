# Infra — Roadside Co-Pilot API (AWS CDK)

A single HTTP API (API Gateway v2) fronting per-route Node.js Lambdas, with a
DynamoDB claims table and a Secrets Manager secret holding the OpenAI + Anthropic
keys. Routes are added in `lib/roadside-copilot-stack.ts` via `addRoute`.

## Layout

```
bin/app.ts                     CDK app entry
lib/roadside-copilot-stack.ts  the stack (API, DynamoDB, Secret, route wiring)
lambda/                        one handler per route (+ shared/ helpers)
```

## Deploy

```bash
npm install
export CDK_DEFAULT_REGION=us-east-1            # or your preferred region
npx cdk bootstrap                              # first time per account/region
npx cdk deploy -c allowedOrigin=https://<you>.github.io
```

After deploy, set the real API keys on the secret (its ARN is a stack output):

```bash
aws secretsmanager put-secret-value \
  --secret-id roadside-copilot/api-keys \
  --secret-string '{"OPENAI_API_KEY":"sk-...","ANTHROPIC_API_KEY":"sk-ant-..."}'
```

The stack outputs `ApiUrl` (set it as `VITE_API_BASE_URL` for the web app),
`SecretArn`, and `TableName`.

## Notes

- AWS SDK v3 is provided by the Node 20 runtime, so it's marked external in
  bundling. Markdown policy docs are bundled as strings (esbuild `.md` text loader)
  so the coverage check can cite them.
- The claims table and log groups use `DESTROY` removal — this is a prototype;
  `cdk destroy` tears everything down cleanly.
