import type { DiscountPolicyPort } from '../ports/discount-policy.port.js';
export class UnavailableDiscountPolicy implements DiscountPolicyPort { async evaluate() { return { available:false }; } }
