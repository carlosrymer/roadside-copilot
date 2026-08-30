export { scoreGuidedOutcome } from './guidedOutcome.js';
export { scoreToolCall } from './toolCall.js';
export { scoreHallucination } from './hallucination.js';
export { scoreRelevance, judgeRelevance, judgeAvailable, JUDGE_MODEL } from './relevance.js';

/**
 * The gating dimensions. Deterministic, free, and reproducible: the same input
 * always produces the same score, which is the only property that makes a CI
 * gate meaningful. `relevance` is deliberately absent.
 */
export const GATING_DIMENSIONS = ['guidedOutcome', 'toolCall', 'hallucination'] as const;
