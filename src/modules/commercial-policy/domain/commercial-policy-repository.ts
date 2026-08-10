import type { DiscountApproval, DiscountPolicy, RelationshipProfileConfig } from "./commercial-policy";

export interface CommercialPolicyRepository {
  listRelationshipProfileConfigs(tenantId: string): Promise<RelationshipProfileConfig[]>;
  listDiscountPolicies(tenantId: string): Promise<DiscountPolicy[]>;
  listDiscountApprovals(tenantId: string): Promise<DiscountApproval[]>;
  createDiscountPolicy(entity: DiscountPolicy): Promise<DiscountPolicy>;
}
