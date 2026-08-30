export type TechnicalFieldType = 'SHORT_TEXT'|'LONG_TEXT'|'INTEGER'|'DECIMAL'|'PERCENTAGE'|'SINGLE_SELECT'|'MULTI_SELECT'|'BOOLEAN'|'DATE'|'TIME'|'MEASUREMENT';
export type TechnicalFormStatus = 'DRAFT'|'ACTIVE'|'INACTIVE';
export interface TechnicalFieldInput { key:string; name:string; description?:string; type:TechnicalFieldType; order:number; required?:boolean; minimum?:string; maximum?:string; precision?:number; unit?:string; options?:string[]; status?:'ACTIVE'|'INACTIVE'; }
export interface CreateTechnicalFormRequest { tenantId:string; serviceId:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; fields:TechnicalFieldInput[]; }
export interface TechnicalFormResponse { id:string; tenantId:string; serviceId:string; version:number; status:TechnicalFormStatus; fields:TechnicalFieldInput[]; createdAt:string; createdBy:string; }
export interface GetServiceTechnicalContextRequest { tenantId:string; serviceId:string; }
export interface GetServiceTechnicalContextResponse { tenantId:string; serviceId:string; active:boolean; hasTechnicalForm:boolean; technicalRequirements:Record<string,unknown>; }
export interface PublishTechnicalFormRequest { tenantId:string; formId:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; }
export interface SessionTechnicalValueInput { fieldId:string; value:unknown; unit?:string; }
export interface RecordSessionTechnicalValuesRequest { tenantId:string; sessionId:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; values:SessionTechnicalValueInput[]; }
export interface SessionTechnicalValueResponse { fieldId:string; valueType:TechnicalFieldType; value:unknown; unit?:string; }
export interface SessionTechnicalValuesResponse { tenantId:string; sessionId:string; snapshotId:string; values:SessionTechnicalValueResponse[]; }
export interface RecordSessionPowerRequest { tenantId:string; sessionId:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; value:string|number; unit:string; }
export interface SessionPowerResponse { id:string; tenantId:string; sessionId:string; value:string; unit:string; recordedAt:string; recordedBy:string; }
