import type { Usage } from '../types.js';

/**
 * Published Anthropic API list prices, USD per million tokens.
 * Source: https://www.anthropic.com/pricing — re-check before quoting a number
 * to anyone; a hard-coded price table is a snapshot, not a source of truth.
 */
export const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/** Prompt-cache multipliers against the base input price (5-minute TTL). */
export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = 1.25;

/**
 * Cost of one call in USD, or undefined when we have no price for the model.
 *
 * Note the cache arithmetic: `inputTokens` is the UNCACHED remainder only, so
 * the three token buckets are added, never overlapped. Getting this wrong is
 * the classic way an eval under-reports the cost of a cache-heavy prompt.
 */
export function callCostUsd(model: string, usage: Usage): number | undefined {
  const price = PRICING[model];
  if (!price) return undefined;
  const perInputToken = price.input / 1_000_000;
  const perOutputToken = price.output / 1_000_000;
  return (
    usage.inputTokens * perInputToken +
    usage.cacheReadTokens * perInputToken * CACHE_READ_MULTIPLIER +
    usage.cacheWriteTokens * perInputToken * CACHE_WRITE_MULTIPLIER +
    usage.outputTokens * perOutputToken
  );
}

/**
 * A crude token estimate for replayed calls, where no API reported real usage.
 * ~3.8 chars/token is close enough for English prose to plan with and far too
 * rough to bill with — which is why every estimate is flagged as one.
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 3.8));
}

export function formatUsd(n: number | undefined): string {
  if (n === undefined) return 'n/a';
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
