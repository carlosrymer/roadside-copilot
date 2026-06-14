import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});
let cached: Record<string, string> | undefined;

/** Fetch the API-key secret as a parsed object, cached across warm invocations. */
export async function getApiKeys(): Promise<Record<string, string>> {
  if (cached) return cached;
  const arn = process.env.SECRET_ARN;
  if (!arn) throw new Error('SECRET_ARN is not set');
  const res = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!res.SecretString) throw new Error('Secret has no string value');
  cached = JSON.parse(res.SecretString) as Record<string, string>;
  return cached;
}
