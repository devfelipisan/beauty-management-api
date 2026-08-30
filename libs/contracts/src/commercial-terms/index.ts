export type CommercialTermsStatus = 'READY' | 'BLOCKED';
export type CommercialTermsBlockReason = 'DISCOUNT_POLICY_UNAVAILABLE' | 'DISCOUNT_APPROVAL_REQUIRED' | 'DEPOSIT_POLICY_UNAVAILABLE' | 'INVALID_COMMERCIAL_TERMS';
export interface CalculateCommercialTermsRequest { tenantId: string; customerId: string; serviceId: string; basePriceCents: number; relationshipProfile?: string; }
export interface CommercialTermsResponse { status: CommercialTermsStatus; reason?: CommercialTermsBlockReason; basePriceCents?: number; discountCents?: number; finalPriceCents?: number; depositRequired?: boolean; depositCents?: number; }
