export interface ConfirmAppointmentRequest { tenantId:string; appointmentId:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; }
export interface CheckInAppointmentRequest { tenantId:string; appointmentId:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; }
export interface AppointmentLifecycleResponse { id:string; status:'CONFIRMED'|'CHECKED_IN'; confirmedAt?:string; checkedInAt?:string; }
