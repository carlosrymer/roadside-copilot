import type { APIGatewayProxyResultV2 } from 'aws-lambda';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';

const corsHeaders = {
  'content-type': 'application/json',
  'access-control-allow-origin': ALLOWED_ORIGIN,
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

export function ok(body: unknown): APIGatewayProxyResultV2 {
  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(body) };
}

export function badRequest(message: string): APIGatewayProxyResultV2 {
  return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: message }) };
}

export function serverError(message: string): APIGatewayProxyResultV2 {
  return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: message }) };
}

/** Parse a JSON request body, tolerating base64-encoded API Gateway payloads. */
export function parseBody<T = Record<string, unknown>>(raw?: string, isBase64?: boolean): T {
  if (!raw) return {} as T;
  const text = isBase64 ? Buffer.from(raw, 'base64').toString('utf8') : raw;
  return JSON.parse(text) as T;
}
