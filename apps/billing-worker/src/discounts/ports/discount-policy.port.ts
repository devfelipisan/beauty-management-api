export interface DiscountDecision { available:boolean; discountCents?:number; approvalRequired?:boolean; }
export interface DiscountPolicyPort { evaluate(input:{tenantId:string;customerId:string;serviceId:string;basePriceCents:number;relationshipProfile?:string}):Promise<DiscountDecision>; }
export const DISCOUNT_POLICY = Symbol('DISCOUNT_POLICY');
