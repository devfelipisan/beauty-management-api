export interface GetSessionStartContextRequest { tenantId:string; appointmentId:string; actorId:string; correlationId:string; }
export interface SessionStartContextResponse { status:'READY'|'BLOCKED'; reason?:string; appointmentId?:string; customerId?:string; serviceId?:string; professionalId?:string; appointmentStatus?:'CHECKED_IN'; }
export interface StartSessionRequest { tenantId:string; appointmentId:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; }
export interface SessionResponse { id:string; tenantId:string; appointmentId:string; customerId:string; serviceId:string; professionalId:string; status:'IN_PROGRESS'; startedAt:string; startedBy:string; createdAt:string; updatedAt:string; }
export interface ApplySessionStartedRequest { tenantId:string; appointmentId:string; sessionId:string; professionalId:string; eventId:string; correlationId:string; }
export interface ApplySessionStartedResponse { applied:boolean; appointmentId:string; sessionId:string; status:'IN_PROGRESS'; }
