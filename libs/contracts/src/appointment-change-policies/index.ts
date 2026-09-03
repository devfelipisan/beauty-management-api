import type {CancellationOrigin,DepositDisposition} from '../appointment-changes/index.js';

export type PaymentDisposition='NONE'|'REFUND'|'CONVERT_TO_CREDIT'|'RETAIN';
export type ReceivableDisposition='KEEP'|'CANCEL';
export interface AppointmentChangeFinancialDecision { policyId:string; policyVersion:number; evaluatedAt:string; depositDisposition:DepositDisposition; depositAmountCents:number; paymentDisposition:PaymentDisposition; refundablePaymentAmountCents:number; creditAmountCents:number; receivableDisposition:ReceivableDisposition; relationshipImpact:'NONE'|'OUT_OF_POLICY_CANCELLATION'|'NO_SHOW'; financialStateVersion:string; }
export interface PaymentRefundDecision { paymentId:string; paymentAmountCents:number; amountCents:number; refundableAmountCents:number; paymentVersion:number; refundedAmountAtEvaluation:number; }
export interface FinancialDecisionSnapshotV2 extends AppointmentChangeFinancialDecision { tenantId:string; deposit?:{id:string;status:string;amountCents:number;version:number}; receivable?:{id:string;status:string;netAmountCents:number;paidAmountCents:number;outstandingAmountCents:number;version:number}; payments:PaymentRefundDecision[]; financialFingerprint:string; }
export type FinancialDecisionSnapshotValidation={status:'VALID'|'STALE'|'INVALID';reason?:'DEPOSIT_VERSION_CHANGED'|'RECEIVABLE_VERSION_CHANGED'|'PAYMENT_VERSION_CHANGED'|'PAYMENT_REFUNDABLE_AMOUNT_CHANGED'|'FINANCIAL_FINGERPRINT_CHANGED'|'FINANCIAL_SNAPSHOT_INCOMPLETE'|'TENANT_MISMATCH';};
export interface FinancialPolicyDecision { status:'READY'|'BLOCKED'; reason?:string; decision?:AppointmentChangeFinancialDecision; }
export interface EvaluateCancellationFinancialsRequest { tenantId:string; appointmentId:string; customerId:string; serviceId:string; origin:CancellationOrigin; scheduledAt:string; canceledAt:string; correlationId:string; }
export interface EvaluateNoShowFinancialsRequest { tenantId:string; appointmentId:string; customerId:string; serviceId:string; scheduledAt:string; appointmentEndsAt:string; evaluatedAt:string; correlationId:string; }
