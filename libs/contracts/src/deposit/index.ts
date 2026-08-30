export type DepositStatus = 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELED';
export interface CreateDepositRequest { tenantId:string; appointmentId:string; amountCents:number; depositRequired:boolean; expiresAt?:string; idempotencyKey:string; correlationId:string; }
export interface DepositResponse { id:string; tenantId:string; appointmentId:string; amountCents:number; status:DepositStatus; expiresAt?:string; confirmedAt?:string; canceledAt?:string; createdAt:string; }
export interface ConfirmDepositRequest { tenantId:string; depositId:string; idempotencyKey:string; actorId?:string; correlationId:string; }
export interface ExpireDepositRequest { tenantId:string; depositId:string; idempotencyKey:string; correlationId:string; }
export interface DepositLifecycleResponse { deposit:DepositResponse; appointmentPropagation:'APPLIED'|'PENDING'|'NOT_REQUESTED'; }
export interface ApplyDepositTransitionRequest { tenantId:string; appointmentId:string; depositId:string; eventId:string; correlationId:string; }
export interface ApplyDepositTransitionResponse { applied:boolean; appointmentId:string; status:string; }
