import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './paths.js';
import type { MemberFacts } from '../../infra/lambda/shared/tasks/coverage.js';

/**
 * The eval harness reads the synthetic data straight off disk. The Lambda gets
 * the same files through esbuild's bundler imports; both read one source of
 * truth, so a policy edit cannot make the agent and its grader disagree.
 */

interface Customer {
  memberId: string;
  name: string;
  policyForm: string;
  policyStatus: string;
  serviceCallsUsedThisYear: number;
  vehicle: { year: number; make: string; model: string; registered: boolean; use: string };
  homeBase: { lat: number; lng: number; label: string };
}

interface Policy {
  policyForm: string;
  plan: string;
  document: string;
  summary: { serviceCallsPerYear: number; towingDistanceMiles: number };
}

export interface Garage {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  phone: string;
  capabilities: string[];
  rating: number;
  avgDispatchMinutes: number;
}

const read = <T>(f: string): T => JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8')) as T;

export const customers = read<Record<string, Customer>>('customers.json');
export const policies = read<Record<string, Policy>>('policies.json');
export const garages = read<Garage[]>('garages.json');

export interface MemberContext {
  customer: Customer;
  policy: Policy;
  /** Raw markdown, exactly as the Lambda sends it to the model. */
  policyDoc: string;
}

export function getMemberContext(memberId?: string): MemberContext | null {
  if (!memberId) return null;
  const customer = customers[memberId.trim().toUpperCase()];
  if (!customer) return null;
  const policy = policies[customer.policyForm];
  if (!policy) return null;
  return { customer, policy, policyDoc: readFileSync(join(DATA_DIR, policy.document), 'utf8') };
}

export function toMemberFacts(ctx: MemberContext): MemberFacts {
  return {
    name: ctx.customer.name,
    memberId: ctx.customer.memberId,
    policyStatus: ctx.customer.policyStatus,
    plan: ctx.policy.plan,
    policyForm: ctx.policy.policyForm,
    vehicle: ctx.customer.vehicle,
    serviceCallsUsedThisYear: ctx.customer.serviceCallsUsedThisYear,
    serviceCallsPerYear: ctx.policy.summary.serviceCallsPerYear,
  };
}

export function providerHasCapability(providerId: string, capability: string): boolean {
  return Boolean(garages.find((g) => g.id === providerId)?.capabilities.includes(capability));
}

/**
 * Canonicalize text for verbatim quote matching: fold smart quotes, strip
 * markdown emphasis, collapse whitespace.
 *
 * This function is where "did the model make it up?" is actually decided, and
 * every rule here is a judgement call with a cost. Too strict and a faithful
 * quote fails because the source had `**bold**` around a word; too loose and a
 * reworded paraphrase passes as a quote. That trade-off is why `scorers.spec.ts`
 * pins the behaviour with tests. See LESSONS.md, Lesson 6.
 */
export function normalize(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalized policy text for a member, or '' when the member is unknown. */
export function policyTextForMember(memberId?: string): string {
  const ctx = getMemberContext(memberId);
  return ctx ? normalize(ctx.policyDoc) : '';
}
