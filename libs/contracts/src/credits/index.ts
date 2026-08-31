export interface GrantInternalCreditRequest { tenantId:string; customerId:string; amountCents:number; sourceType:'REFUND'; sourceId:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; }
export interface GrantInternalCreditResponse { customerId:string; amountCents:number; availableAmountCents:number; }
export interface InternalCreditGrantedEvent { eventId:string; tenantId:string; customerId:string; amountCents:number; sourceType:'REFUND'; sourceId:string; correlationId:string; }
