import type { Assessment } from "./assessment";

export interface AssessmentRepository {
  findById(tenantId: string, id: string): Promise<Assessment | null>;
  listByCustomer(tenantId: string, customerId: string): Promise<Assessment[]>;
  create(entity: Assessment): Promise<Assessment>;
}
