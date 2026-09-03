import type {CancellationOrigin,DepositDisposition} from '../appointment-changes/index.js';

export type PaymentDisposition='NONE'|'REFUND'|'CONVERT_TO_CREDIT'|'RETAIN';
export type ReceivableDisposition='KEEP'|'CANCEL';
export interface AppointmentChangeFinancialDecision { policyId:string; policyVersion:number; evaluatedAt:string; depositDisposition:DepositDisposition; depositAmountCents:number; paymentDisposition:PaymentDisposition; refundablePaymentAmountCents:number; creditAmountCents:number; receivableDisposition:ReceivableDisposition; relationshipImpact:'NONE'|'OUT_OF_POLICY_CANCELLATION'|'NO_SHOW'; financialStateVersion:string; }
export interface FinancialPolicyDecision { status:'READY'|'BLOCKED'; reason?:string; decision?:AppointmentChangeFinancialDecision; }
export interface EvaluateCancellationFinancialsRequest { tenantId:string; appointmentId:string; customerId:string; serviceId:string; origin:CancellationOrigin; scheduledAt:string; canceledAt:string; correlationId:string; }
export interface EvaluateNoShowFinancialsRequest { tenantId:string; appointmentId:string; customerId:string; serviceId:string; scheduledAt:string; appointmentEndsAt:string; evaluatedAt:string; correlationId:string; }
