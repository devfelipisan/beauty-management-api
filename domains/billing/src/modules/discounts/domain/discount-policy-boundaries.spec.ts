import { DiscountPolicy } from './discount-policy.js';

const props = {
  id: 'policy',
  tenantId: 'tenant',
  customerProfile: 'LOYAL',
  discountType: 'FIXED' as const,
  discountValue: 100,
  requiresApproval: false,
  singleUse: false,
  stackable: false,
};
const input = {
  serviceId: 'service',
  category: 'GENERAL',
  basePriceCents: 1000,
  at: '2026-10-31',
};
describe('discount policy qualification boundaries', () => {
  it.each([
    { id: '' },
    { tenantId: '' },
    { customerProfile: '' },
    { discountValue: -1 },
    { discountValue: 0.5 },
    { discountType: 'PERCENTAGE', discountValue: 10001 },
  ])('rejects invalid policy data %j', (patch) => {
    expect(() =>
      DiscountPolicy.create({ ...props, ...patch } as never),
    ).toThrow('Discount policy is invalid');
  });
  it('requires all configured selectors, amount and validity predicates and accepts inclusive limits', () => {
    const policy = DiscountPolicy.create({
      ...props,
      eligibleServices: ['service'],
      eligibleCategories: ['GENERAL'],
      minimumPurchaseCents: 1000,
      validFrom: '2026-10-31',
      validUntil: '2026-11-01',
    });
    expect(policy.applies(input)).toBe(true);
    expect(policy.applies({ ...input, at: '2026-11-01' })).toBe(true);
    for (const patch of [
      { serviceId: 'other' },
      { category: 'OTHER' },
      { basePriceCents: 999 },
      { at: '2026-10-30' },
      { at: '2026-11-02' },
    ])
      expect(policy.applies({ ...input, ...patch })).toBe(false);
    expect(DiscountPolicy.create(props).applies(input)).toBe(true);
    expect(
      DiscountPolicy.create({
        ...props,
        eligibleServices: [],
        eligibleCategories: [],
      }).applies(input),
    ).toBe(true);
  });
  it('caps discounts by configured maximum and base price and rounds percentage down', () => {
    expect(
      DiscountPolicy.create({ ...props, discountValue: 1500 }).calculate(1000),
    ).toBe(1000);
    expect(
      DiscountPolicy.create({ ...props, maximumDiscountCents: 50 }).calculate(
        1000,
      ),
    ).toBe(50);
    expect(
      DiscountPolicy.create({
        ...props,
        discountType: 'PERCENTAGE',
        discountValue: 3333,
      }).calculate(1000),
    ).toBe(333);
  });
});
