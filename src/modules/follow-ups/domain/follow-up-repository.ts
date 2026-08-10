import type { FollowUp } from "./follow-up";

export interface FollowUpRepository {
  findById(tenantId: string, id: string): Promise<FollowUp | null>;
  list(tenantId: string): Promise<FollowUp[]>;
  create(entity: FollowUp): Promise<FollowUp>;
  update(entity: FollowUp): Promise<FollowUp>;
}
