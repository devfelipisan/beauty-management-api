export interface DiscountDecision { available:boolean; discountCents?:number; approvalRequired?:boolean; policyId?:string; snapshot?:Record<string, unknown>; }
export interface DiscountPolicyPort { evaluate(input:{tenantId:string;customerId:string;serviceId:string;basePriceCents:number;relationshipProfile?:string;commercialContext?:{category:string;allowsDiscount:boolean;minimumPriceCents?:number}}):Promise<DiscountDecision>; }
export const DISCOUNT_POLICY = Symbol('DISCOUNT_POLICY');
