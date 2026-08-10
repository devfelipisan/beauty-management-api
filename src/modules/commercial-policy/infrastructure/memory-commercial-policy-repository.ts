import type { CommercialPolicyRepository } from "../domain/commercial-policy-repository";
import type { DiscountApproval, DiscountPolicy, RelationshipProfileConfig } from "../domain/commercial-policy";

const timestamp = "2026-08-09T12:00:00.000Z";

const demoConfigs: RelationshipProfileConfig[] = [
  { profile: "new", minimumCompletedAppointments: 0, manualOverrideAllowed: true, updatedAt: timestamp },
  { profile: "returning", minimumCompletedAppointments: 1, periodMonths: 12, manualOverrideAllowed: true, updatedAt: timestamp },
  { profile: "loyal", minimumCompletedAppointments: 3, periodMonths: 6, maximumNoShows: 1, manualOverrideAllowed: true, updatedAt: timestamp },
  { profile: "inactive", inactiveAfterDays: 180, manualOverrideAllowed: true, updatedAt: timestamp },
  { profile: "frequent_no_show", maximumNoShows: 2, periodMonths: 6, manualOverrideAllowed: false, updatedAt: timestamp },
];

const demoPolicies: DiscountPolicy[] = [
  {
    id: "discount-loyal-10",
    tenantId: "tenant-bella",
    name: "Fidelidade 10%",
    profile: "loyal",
    type: "percentage",
    status: "active",
    percentage: 10,
    singleUse: false,
    requiresApproval: false,
    stackable: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: "discount-reactivation-30",
    tenantId: "tenant-bella",
    name: "Reativação R$ 30",
    profile: "inactive",
    type: "fixed",
    status: "active",
    fixedAmountCents: 3000,
    minimumAmountCents: 10000,
    singleUse: true,
    requiresApproval: false,
    stackable: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

const demoApprovals: DiscountApproval[] = [
  {
    id: "discount-approval-demo-1",
    tenantId: "tenant-bella",
    customerId: "customer-mariana",
    operationType: "appointment",
    requestedBy: "user-reception",
    requestedPercentage: 15,
    justification: "Condição comercial solicitada pela recepção para retenção do cliente.",
    status: "pending",
    createdAt: timestamp,
  },
];

function clonePolicy(policy: DiscountPolicy): DiscountPolicy {
  return {
    ...policy,
    eligibleServiceIds: policy.eligibleServiceIds ? [...policy.eligibleServiceIds] : undefined,
    eligibleCategories: policy.eligibleCategories ? [...policy.eligibleCategories] : undefined,
    eligiblePackageIds: policy.eligiblePackageIds ? [...policy.eligiblePackageIds] : undefined,
  };
}

export class MemoryCommercialPolicyRepository implements CommercialPolicyRepository {
  private readonly policies = demoPolicies.map(clonePolicy);
  private readonly approvals = demoApprovals.map((item) => ({ ...item }));

  async listRelationshipProfileConfigs(tenantId: string) {
    if (tenantId !== "tenant-bella") return [];
    return demoConfigs.map((item) => ({ ...item }));
  }

  async listDiscountPolicies(tenantId: string) {
    return this.policies.filter((item) => item.tenantId === tenantId).map(clonePolicy);
  }

  async listDiscountApprovals(tenantId: string) {
    return this.approvals.filter((item) => item.tenantId === tenantId).map((item) => ({ ...item }));
  }

  async createDiscountPolicy(entity: DiscountPolicy) {
    this.policies.push(clonePolicy(entity));
    return clonePolicy(entity);
  }
}
