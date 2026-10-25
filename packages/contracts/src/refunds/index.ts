export interface IssueRefundRequest { tenantId:string; paymentId:string; amountCents:number; reasonCode?:string; notes?:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; }
export interface IssueRefundResponse { refundId:string; paymentId:string; amountCents:number; status:'CONFIRMED'; }
export interface RefundIssuedEvent { eventId:string; tenantId:string; customerId:string; paymentId:string; refundId:string; receivableId:string; amountCents:number; refundedAt:string; correlationId:string; }
