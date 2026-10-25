import { DiscountPolicy } from './discount-policy.js';
import { ConfiguredDiscountPolicy } from '../infrastructure/configured-discount-policy.js';
const policy = DiscountPolicy.create({ id:'p1', tenantId:'t1', customerProfile:'LOYAL', discountType:'PERCENTAGE', discountValue:2000, maximumDiscountCents:3000, requiresApproval:false, singleUse:false, stackable:false });

describe('DiscountPolicy', () => {
  it('calculates percentage discounts using integer basis points and maximum cap', () => {
    expect(policy.calculate(20000)).toBe(3000);
  });

  it('does not apply outside tenant/profile/service/category/period constraints', () => {
    expect(policy.applies({ serviceId:'s1', category:'GENERAL', basePriceCents:1000, at:'2026-01-01T00:00:00.000Z' })).toBe(true);
    const restricted = DiscountPolicy.create({ ...policy.data, eligibleServices:['s2'], validFrom:'2026-02-01T00:00:00.000Z' });
    expect(restricted.applies({ serviceId:'s1', category:'GENERAL', basePriceCents:1000, at:'2026-01-01T00:00:00.000Z' })).toBe(false);
  });
});

describe('ConfiguredDiscountPolicy', () => {
  it('returns no discount when Service disallows discounts', async () => {
    const repository = { findApplicablePolicies: async () => { throw new Error('must not query'); } };
    await expect(new ConfiguredDiscountPolicy(repository).evaluate({ tenantId:'t1', customerId:'c1', serviceId:'s1', basePriceCents:1000, commercialContext:{ category:'GENERAL', allowsDiscount:false } })).resolves.toEqual({ available:true, discountCents:0 });
  });

  it('returns a frozen applicable policy snapshot', async () => {
    const repository = { findApplicablePolicies: async () => [policy] };
    const result = await new ConfiguredDiscountPolicy(repository).evaluate({ tenantId:'t1', customerId:'c1', serviceId:'s1', basePriceCents:20000, relationshipProfile:'LOYAL', commercialContext:{ category:'GENERAL', allowsDiscount:true } });
    expect(result).toMatchObject({ available:true, policyId:'p1', discountCents:3000, snapshot:{ id:'p1', tenantId:'t1' } });
  });
});
