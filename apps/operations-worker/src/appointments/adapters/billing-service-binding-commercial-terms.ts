import type { CalculateCommercialTermsRequest, CommercialTermsResponse } from '../../../../../libs/contracts/src/index.js';
import type { CommercialTermsPort } from '../ports/commercial-terms-port.js';
export interface BillingServiceBinding { calculateCommercialTerms(input:CalculateCommercialTermsRequest):Promise<CommercialTermsResponse>; }
export class BillingServiceBindingCommercialTermsAdapter implements CommercialTermsPort { constructor(private readonly binding:BillingServiceBinding){} calculate(input:CalculateCommercialTermsRequest){return this.binding.calculateCommercialTerms(input);} }
