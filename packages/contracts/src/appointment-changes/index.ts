export type CancellationOrigin='CUSTOMER'|'COMPANY'|'PROFESSIONAL'|'SYSTEM_EXPIRATION';export type DepositDisposition='RETURN'|'RETAIN'|'CONVERT_TO_CREDIT'|'TRANSFER'|'NONE';
export interface RescheduleAppointmentRequest { tenantId:string;appointmentId:string;startsAt:string;professionalId:string;reason:string;actorId:string;idempotencyKey:string;requestId:string;correlationId:string; }
export interface RescheduleAppointmentResponse { appointmentId:string;status:'RESCHEDULED';startsAt:string;professionalId:string; }
export interface CancelAppointmentRequest { tenantId:string;appointmentId:string;reason:string;note?:string;origin:CancellationOrigin;actorId:string;idempotencyKey:string;requestId:string;correlationId:string; }
export interface CancelAppointmentResponse { appointmentId:string;status:'CANCELED'; }
export interface MarkNoShowRequest { tenantId:string;appointmentId:string;actorId:string;idempotencyKey:string;requestId:string;correlationId:string; }
export interface MarkNoShowResponse { appointmentId:string;status:'NO_SHOW'; }
