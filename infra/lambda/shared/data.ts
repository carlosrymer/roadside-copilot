import customersJson from '../../../data/customers.json';
import policiesJson from '../../../data/policies.json';
import garagesJson from '../../../data/garages.json';
import basicDoc from '../../../data/policy-docs/basic.md';
import standardDoc from '../../../data/policy-docs/standard.md';
import premiumDoc from '../../../data/policy-docs/premium.md';

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

interface Coord {
  lat: number;
  lng: number;
}

/** Great-circle distance in miles between two coordinates. */
export function distanceMiles(a: Coord, b: Coord): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface RankedGarage extends Garage {
  distanceMiles: number;
  etaMinutes: number;
}

/**
 * Rank providers near an origin, optionally requiring a capability. ETA is the
 * provider's dispatch time plus a rough drive estimate at 35 mph.
 */
export function rankGarages(origin: Coord, capability?: string): RankedGarage[] {
  const pool = capability ? garages.filter((g) => g.capabilities.includes(capability)) : garages;
  return pool
    .map((g) => {
      const miles = distanceMiles(origin, g);
      return {
        ...g,
        distanceMiles: Math.round(miles * 10) / 10,
        etaMinutes: g.avgDispatchMinutes + Math.round((miles / 35) * 60),
      };
    })
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}
