import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { ok } from './shared/http.js';

export const handler: APIGatewayProxyHandlerV2 = async () => {
  return ok({ status: 'ok', service: 'roadside-copilot', time: new Date().toISOString() });
};
