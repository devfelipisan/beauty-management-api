export type EquipmentStatus='AVAILABLE'|'MAINTENANCE'|'BLOCKED'|'INACTIVE';
export interface EquipmentInput { name:string; model?:string; manufacturer?:string; serialNumber?:string; mainUnit?:string; notes?:string; }
export interface EquipmentResponse extends EquipmentInput { id:string; tenantId:string; status:EquipmentStatus; createdAt:string; updatedAt:string; }
export interface CreateEquipmentRequest { tenantId:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; equipment:EquipmentInput; }
export interface ConfigureEquipmentServicesRequest { tenantId:string; equipmentId:string; serviceIds:string[]; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; }
export interface RecordSessionEquipmentUsageRequest { tenantId:string; sessionId:string; equipmentId:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; }
export interface SessionEquipmentUsageResponse { id:string; tenantId:string; sessionId:string; equipmentId:string; equipmentNameSnapshot:string; equipmentModelSnapshot?:string; manufacturerSnapshot?:string; serialNumberSnapshot?:string; mainUnitSnapshot?:string; recordedAt:string; recordedBy:string; }
export interface PreviousSessionContextResponse { previousSessionId:string|null; technicalValues:unknown[]; power:unknown[]; equipment:SessionEquipmentUsageResponse[]; photosAvailable:false; intercurrencesAvailable:false; }
export type VariationMode='ABSOLUTE'|'PERCENTAGE';
export interface ConfigureVariationPolicyRequest { tenantId:string; serviceId:string; parameterKey:string; mode:VariationMode; threshold:string; unit?:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; }
export interface VariationPolicyResponse { id:string; tenantId:string; serviceId:string; parameterKey:string; mode:VariationMode; threshold:string; unit?:string; status:'ACTIVE'; createdAt:string; createdBy:string; }
export type VariationComparisonStatus='NO_BASELINE'|'NO_POLICY'|'NO_VARIATION'|'ALERT'|'NOT_COMPARABLE'|'UNIT_MISMATCH'|'PERCENTAGE_NOT_COMPARABLE';
export interface SessionVariationAlertResponse { id:string; tenantId:string; sessionId:string; parameterKey:string; previousSessionId?:string; previousValue?:string; currentValue:string; unit?:string; policyId:string; threshold:string; variation:string; status:'OPEN'|'JUSTIFIED'; justification?:string; justifiedAt?:string; justifiedBy?:string; createdAt:string; }
export interface JustifyVariationAlertRequest { tenantId:string; sessionId:string; alertId:string; justification:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; }
