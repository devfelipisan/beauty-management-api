export type PackageStatus='ACTIVE'|'COMPLETED'|'EXPIRED'|'CANCELED';
export type PackageMovementType='INITIAL_CREDIT'|'CONSUMPTION';
export type PackageUsageBlockReason='PACKAGE_NOT_FOUND'|'CUSTOMER_MISMATCH'|'SERVICE_MISMATCH'|'PACKAGE_NOT_ACTIVE'|'PACKAGE_EXPIRED'|'PACKAGE_BALANCE_EXHAUSTED'|'SESSION_ALREADY_CONSUMED';
export interface PackageDefinition { id:string; tenantId:string; serviceId:string; quantity:number; basePriceCents:number; discountCents:number; finalPriceCents:number; validityDays?:number; status:'ACTIVE'|'INACTIVE'; createdAt:string; updatedAt:string; }
export interface CustomerPackage { id:string; tenantId:string; packageDefinitionId?:string; customerId:string; serviceId:string; totalQuantity:number; remainingQuantity:number; basePriceCents:number; discountCents:number; finalPriceCents:number; purchasedAt:string; validUntil:string; status:PackageStatus; createdAt:string; updatedAt:string; }
export interface PackageConsumptionRequestedEvent { eventId:string; tenantId:string; sessionId:string; appointmentId:string; customerId:string; serviceId:string; customerPackageId:string; completedAt:string; correlationId:string; }
export interface PackageUnitConsumedEvent { eventId:string; tenantId:string; customerPackageId:string; customerId:string; sessionId:string; serviceId:string; balanceBefore:number; balanceAfter:number; correlationId:string; }
export interface ApplyPackageConsumptionRequest extends PackageConsumptionRequestedEvent {}
export interface ApplyPackageConsumptionResponse { applied:boolean; customerPackageId:string; sessionId:string; balanceBefore:number; balanceAfter:number; status:PackageStatus; }
export interface PackageListQuery { tenantId:string; customerId?:string; status?:PackageStatus; serviceId?:string; cursor?:string; limit?:number; }
export interface MaterializeCustomerPackageRequest { tenantId:string; customerId:string; packageDefinitionId?:string; serviceId:string; totalQuantity:number; basePriceCents:number; discountCents:number; finalPriceCents:number; purchasedAt:string; validUntil:string; sourceOperationId:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; }
