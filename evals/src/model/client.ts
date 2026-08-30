import { createHash } from 'node:crypto';
import type { ModelCall } from '../types.js';

/**
 * A single tool-forced model call, described independently of who serves it.
 *
 * This interface is the seam that makes the whole harness work. The agent code
 * asks for "a structured answer to this request"; whether that comes from the
 * Anthropic API, a recorded fixture, or a deliberately corrupted wrapper is a
 * decision made once, at startup. See LESSONS.md, Lesson 2.
 */
export interface ModelRequest {
  system: string;
  /** Large reusable prefix (the policy document) — prompt-cached when live. */
  cacheableContext?: string;
  prompt: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}

export interface ModelResult<T> {
  value: T;
  call: ModelCall;
}

export interface ModelClient {
  /**
   * @param key   Stable cassette key — the scenario id. Identifies WHICH call
   *              this is, so a fixture can be looked up by name.
   * @param req   The rendered request. Its hash detects when a recorded fixture
   *              no longer matches the prompt it was recorded against.
   */
  call<T>(key: string, req: ModelRequest): Promise<ModelResult<T>>;
}

/**
 * Fingerprint of everything that could change the model's answer. If this moves,
 * a recording made before the change is grading a prompt that no longer exists.
 */
export function requestHash(model: string, req: ModelRequest): string {
  const material = JSON.stringify([
    model,
    req.system,
    req.cacheableContext ?? '',
    req.prompt,
    req.toolName,
    req.toolDescription,
    req.schema,
    req.maxTokens,
  ]);
  return `sha256:${createHash('sha256').update(material).digest('hex').slice(0, 16)}`;
}

/** Total characters the model would read — the basis for estimated input cost. */
export function requestChars(req: ModelRequest): number {
  return (
    req.system.length +
    (req.cacheableContext?.length ?? 0) +
    req.prompt.length +
    JSON.stringify(req.schema).length
  );
}
