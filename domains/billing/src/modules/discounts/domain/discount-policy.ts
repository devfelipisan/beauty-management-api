import { DomainError } from '@beauty/kernel';

export type DiscountType = 'FIXED' | 'PERCENTAGE';
export interface DiscountPolicyProps { id:string; tenantId:string; customerProfile:string; discountType:DiscountType; discountValue:number; eligibleServices?:string[]; eligibleCategories?:string[]; minimumPurchaseCents?:number; maximumDiscountCents?:number; validFrom?:string; validUntil?:string; requiresApproval:boolean; singleUse:boolean; stackable:boolean; priority?:number; }
export class DiscountPolicy {
  private constructor(readonly data:Readonly<DiscountPolicyProps>) {}
  static create(props:DiscountPolicyProps) { if (!props.id || !props.tenantId || !props.customerProfile || !Number.isInteger(props.discountValue) || props.discountValue < 0 || (props.discountType === 'PERCENTAGE' && props.discountValue > 10000)) throw new DomainError('DISCOUNT_POLICY_INVALID', 'Discount policy is invalid'); return new DiscountPolicy({ ...props }); }
  applies(input:{serviceId:string;category:string;basePriceCents:number;at:string}) { if (this.data.eligibleServices?.length && !this.data.eligibleServices.includes(input.serviceId)) return false; if (this.data.eligibleCategories?.length && !this.data.eligibleCategories.includes(input.category)) return false; if (this.data.minimumPurchaseCents !== undefined && input.basePriceCents < this.data.minimumPurchaseCents) return false; if (this.data.validFrom && input.at < this.data.validFrom) return false; if (this.data.validUntil && input.at > this.data.validUntil) return false; return true; }
  calculate(basePriceCents:number) { const raw = this.data.discountType === 'FIXED' ? this.data.discountValue : Math.floor(basePriceCents * this.data.discountValue / 10000); return Math.min(raw, this.data.maximumDiscountCents ?? raw, basePriceCents); }
}
