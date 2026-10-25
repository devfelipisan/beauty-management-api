export type SessionCompletionEligibilityStatus='READY'|'BLOCKED';
export type SessionCompletionReason='SESSION_NOT_IN_PROGRESS'|'REQUIRED_TECHNICAL_FIELD_MISSING'|'POWER_REQUIRED_MISSING'|'REQUIRED_EQUIPMENT_MISSING'|'REQUIRED_PHOTO_MISSING';
export interface SessionCompletionEligibilityResponse { status:SessionCompletionEligibilityStatus; reasons:SessionCompletionReason[]; technicalFields:'COMPLETE'|'INCOMPLETE'|'NOT_REQUIRED'; power:'SATISFIED'|'MISSING'|'NOT_REQUIRED'; equipment:'SATISFIED'|'MISSING'|'NOT_REQUIRED'; photos:'SATISFIED'|'MISSING'|'NOT_REQUIRED'; openIntercurrencesCount:number; openVariationAlertsCount:number; }
export interface CompleteSessionRequest { tenantId:string; sessionId:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; }
export interface CompletedSessionResponse { id:string; tenantId:string; appointmentId:string; status:'COMPLETED'; completedAt:string; completedBy:string; }
export interface SessionCompletedEvent { eventId:string; tenantId:string; sessionId:string; appointmentId:string; professionalId:string; serviceId:string; customerPackageId?:string; completedAt:string; correlationId:string; }
export interface ApplySessionCompletedRequest extends SessionCompletedEvent {}
export interface ApplySessionCompletedResponse { applied:boolean; appointmentId:string; sessionId:string; status:'COMPLETED'; }
