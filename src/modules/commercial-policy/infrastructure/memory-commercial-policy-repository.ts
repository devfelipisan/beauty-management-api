import type { CommercialPolicyRepository } from "../domain/commercial-policy-repository";
import type { DiscountApproval, DiscountPolicy, RelationshipProfileConfig } from "../domain/commercial-policy";

function clonePolicy(policy: DiscountPolicy): DiscountPolicy {
  return {
    ...policy,
    eligibleServiceIds: policy.eligibleServiceIds ? [...policy.eligibleServiceIds] : undefined,
    eligibleCategories: policy.eligibleCategories ? [...policy.eligibleCategories] : undefined,
    eligiblePackageIds: policy.eligiblePackageIds ? [...policy.eligiblePackageIds] : undefined,
  };
}

/** Test double only. Production persistence is PostgreSQL. */
export class MemoryCommercialPolicyRepository implements CommercialPolicyRepository {
  private readonly configs: RelationshipProfileConfig[];
  private readonly policies: DiscountPolicy[];
  private readonly approvals: DiscountApproval[];

  constructor(initial: {
    configs?: RelationshipProfileConfig[];
    policies?: DiscountPolicy[];
    approvals?: DiscountApproval[];
  } = {}) {
    this.configs = (initial.configs ?? []).map((item) => ({ ...item }));
    this.policies = (initial.policies ?? []).map(clonePolicy);
    this.approvals = (initial.approvals ?? []).map((item) => ({ ...item }));
  }

  async listRelationshipProfileConfigs(_tenantId: string) {
    return this.configs.map((item) => ({ ...item }));
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
