import { CommercialTerms } from './commercial-terms.js';
export interface CommercialTermsFacts { basePriceCents:number; discountCents:number; depositRequired:boolean; depositCents:number; }
export class CommercialTermsPolicy { evaluate(facts:CommercialTermsFacts) { return CommercialTerms.create({ ...facts, finalPriceCents:facts.basePriceCents-facts.discountCents }); } }
