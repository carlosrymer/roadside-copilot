import customersJson from '../../../data/customers.json';
import policiesJson from '../../../data/policies.json';
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

const customers = customersJson as Record<string, Customer>;
const policies = policiesJson as Record<string, Policy>;

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
