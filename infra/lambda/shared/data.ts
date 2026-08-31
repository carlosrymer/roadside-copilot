import customersJson from '../../../data/customers.json';
import policiesJson from '../../../data/policies.json';
import garagesJson from '../../../data/garages.json';
import basicDoc from '../../../data/policy-docs/basic.md';
import standardDoc from '../../../data/policy-docs/standard.md';
import premiumDoc from '../../../data/policy-docs/premium.md';
import { distanceMiles, rankProviders, selectProvider, type Coord, type Ranked } from './geo.js';
import type { MemberFacts } from './tasks/coverage.js';

export { distanceMiles };
export type { Coord };

export interface Vehicle {
  year: number;
  make: string;
  model: string;
  plate: string;
  registered: boolean;
  use: string;
}

export interface Customer {
  memberId: string;
  name: string;
  phone: string;
  policyForm: string;
  policyStatus: string;
  serviceCallsUsedThisYear: number;
  vehicle: Vehicle;
  homeBase: { lat: number; lng: number; label: string };
}

export interface Policy {
  policyForm: string;
  plan: string;
  underwriter: string;
  document: string;
  summary: {
    coveredServices: string[];
    serviceCallsPerYear: number;
    towingDistanceMiles: number;
    perCallBenefitCapUsd: number | null;
    tripInterruptionUsd: number;
    exclusions: string[];
  };
}

export interface Garage {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  phone: string;
  capabilities: string[];
  hours: string;
  rating: number;
  avgDispatchMinutes: number;
}

const customers = customersJson as Record<string, Customer>;
const policies = policiesJson as Record<string, Policy>;
const garages = garagesJson as Garage[];

const policyDocs: Record<string, string> = {
  'policy-docs/basic.md': basicDoc,
  'policy-docs/standard.md': standardDoc,
  'policy-docs/premium.md': premiumDoc,
};

export interface MemberContext {
  customer: Customer;
  policy: Policy;
  policyDoc: string;
}

/** Resolve a member to their policy + full policy document text, or null if unknown. */
export function getMemberContext(memberId: string): MemberContext | null {
  const customer = customers[memberId?.trim().toUpperCase()];
  if (!customer) return null;
  const policy = policies[customer.policyForm];
  if (!policy) return null;
  return { customer, policy, policyDoc: policyDocs[policy.document] ?? '' };
}

// ---------------------------------------------------------------------------
// Provider ranking. The maths lives in `geo.ts` (pure, data-free) so the eval
// harness can reuse the exact ranking logic; these wrappers just bind it to the
// bundled garage list.
// ---------------------------------------------------------------------------

export type RankedGarage = Ranked<Garage>;

export function rankGarages(origin: Coord, capability?: string): RankedGarage[] {
  return rankProviders(garages, origin, capability);
}

/** Best provider for a capability, degrading to any tow, then to anyone. */
export function selectGarage(origin: Coord, capability?: string): RankedGarage[] {
  return selectProvider(garages, origin, capability);
}

/** Project a member context onto the facts the coverage prompt renders. */
export function toMemberFacts(ctx: MemberContext): MemberFacts {
  return {
    name: ctx.customer.name,
    memberId: ctx.customer.memberId,
    policyStatus: ctx.customer.policyStatus,
    plan: ctx.policy.plan,
    policyForm: ctx.policy.policyForm,
    vehicle: {
      year: ctx.customer.vehicle.year,
      make: ctx.customer.vehicle.make,
      model: ctx.customer.vehicle.model,
      registered: ctx.customer.vehicle.registered,
      use: ctx.customer.vehicle.use,
    },
    serviceCallsUsedThisYear: ctx.customer.serviceCallsUsedThisYear,
    serviceCallsPerYear: ctx.policy.summary.serviceCallsPerYear,
  };
}
