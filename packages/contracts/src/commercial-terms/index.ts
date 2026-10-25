export type CommercialTermsStatus = 'READY' | 'BLOCKED';
export type CommercialTermsBlockReason = 'DISCOUNT_POLICY_UNAVAILABLE' | 'DISCOUNT_POLICY_AMBIGUOUS' | 'DISCOUNT_APPROVAL_REQUIRED' | 'DEPOSIT_POLICY_UNAVAILABLE' | 'INVALID_COMMERCIAL_TERMS';
export type DepositMode = 'NOT_REQUIRED' | 'FIXED' | 'PERCENTAGE';
export interface ServiceCommercialContext { serviceId: string; category: string; minimumPriceCents?: number; allowsDiscount: boolean; depositMode: DepositMode; depositFixedCents?: number; depositPercentageBasisPoints?: number; }
export interface CalculateCommercialTermsRequest { tenantId: string; customerId: string; serviceId: string; basePriceCents: number; relationshipProfile?: string; commercialContext?: ServiceCommercialContext; }
export interface CommercialTermsResponse { status: CommercialTermsStatus; reason?: CommercialTermsBlockReason; basePriceCents?: number; discountCents?: number; finalPriceCents?: number; depositRequired?: boolean; depositCents?: number; discountPolicyId?: string; discountPolicySnapshot?: Record<string, unknown>; customerProfileAtCalculation?: string; }
