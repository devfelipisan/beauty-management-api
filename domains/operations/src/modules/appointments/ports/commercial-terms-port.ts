import type { CalculateCommercialTermsRequest, CommercialTermsResponse } from '@beauty/contracts';
export interface CommercialTermsPort { calculate(input: CalculateCommercialTermsRequest): Promise<CommercialTermsResponse>; }
export const COMMERCIAL_TERMS = Symbol('COMMERCIAL_TERMS');
