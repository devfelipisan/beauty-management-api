export type ReceivableStatus='OPEN'|'PARTIALLY_PAID'|'PAID';
export type FinancialSourceType='APPOINTMENT'|'CUSTOMER_PACKAGE';
export type PaymentMethod='CASH'|'PIX'|'DEBIT_CARD'|'CREDIT_CARD'|'TRANSFER'|'INTERNAL_CREDIT';
export interface FinancialSettlementRequestedEvent { eventId:string; tenantId:string; appointmentId:string; sessionId:string; customerId:string; serviceId:string; settlementSource:'STANDARD'|'PACKAGE'; basePriceCents:number; discountCents:number; finalPriceCents:number; depositId?:string; depositAmountCents?:number; customerPackageId?:string; completedAt:string; correlationId:string; }
export interface FinancialSettlementResponse { applied:boolean; result:'RECEIVABLE_CREATED'|'NO_SESSION_RECEIVABLE'; receivableId?:string; }
export interface RegisterPaymentRequest { tenantId:string; receivableId:string; customerId?:string; amountCents:number; method:PaymentMethod; externalReference?:string; notes?:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; }
export interface RegisterPaymentResponse { paymentId:string; receivableId:string; amountCents:number; paidAmountCents:number; outstandingAmountCents:number; status:ReceivableStatus; }
export interface PaymentReceivedEvent { eventId:string; tenantId:string; customerId:string; receivableId:string; paymentId:string; amountCents:number; method:PaymentMethod; receivedAt:string; sourceType:FinancialSourceType; sourceId:string; correlationId:string; }
