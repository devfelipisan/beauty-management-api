import type { DiscountPolicy } from '../domain/discount-policy.js';
export interface DiscountPolicyRepository { findApplicablePolicies(tenantId:string, profile:string, serviceId:string, category:string, amountCents:number, at:string):Promise<DiscountPolicy[]>; }
