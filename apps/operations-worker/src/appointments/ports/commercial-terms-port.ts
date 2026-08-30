import type { CalculateCommercialTermsRequest, CommercialTermsResponse } from '../../../../../libs/contracts/src/index.js';
export interface CommercialTermsPort { calculate(input: CalculateCommercialTermsRequest): Promise<CommercialTermsResponse>; }
export const COMMERCIAL_TERMS = Symbol('COMMERCIAL_TERMS');
