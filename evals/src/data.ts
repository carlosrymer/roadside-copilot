import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '..', 'data');

const customers = JSON.parse(readFileSync(join(dataDir, 'customers.json'), 'utf8')) as Record<
  string,
  { policyForm: string }
>;
const policies = JSON.parse(readFileSync(join(dataDir, 'policies.json'), 'utf8')) as Record<
  string,
  { document: string }
>;
const garages = JSON.parse(readFileSync(join(dataDir, 'garages.json'), 'utf8')) as {
  id: string;
  capabilities: string[];
}[];

/** Does the given provider advertise the capability? */
export function providerHasCapability(providerId: string, capability: string): boolean {
  const g = garages.find((x) => x.id === providerId);
  return Boolean(g?.capabilities.includes(capability));
}

/**
 * Canonicalize text for verbatim quote matching: strip markdown emphasis/headers,
 * fold smart quotes to straight, and collapse whitespace — so a faithful quote of
 * the prose matches the source even though the source is markdown.
 */
export function normalize(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The full, whitespace-normalized policy document text for a member (or '' if unknown). */
export function policyTextForMember(memberId?: string): string {
  if (!memberId) return '';
  const customer = customers[memberId.trim().toUpperCase()];
  if (!customer) return '';
  const policy = policies[customer.policyForm];
  if (!policy) return '';
  return normalize(readFileSync(join(dataDir, policy.document), 'utf8'));
}
