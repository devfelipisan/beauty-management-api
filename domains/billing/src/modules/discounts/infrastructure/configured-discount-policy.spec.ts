import { ConfiguredDiscountPolicy } from './configured-discount-policy.js';
import { DiscountPolicy } from '../domain/discount-policy.js';

describe('configured discount adapter', () => {
  it('reports the capability unavailable when policy lookup fails', async () => {
    const findApplicablePolicies = vi
      .fn()
      .mockRejectedValue(new Error('DATABASE_UNAVAILABLE'));
    const adapter = new ConfiguredDiscountPolicy({ findApplicablePolicies });
    expect(await adapter.evaluate(input)).toEqual({ available: false });
  });
  const input = {
    tenantId: 'tenant',
    customerId: 'customer',
    serviceId: 'service',
    basePriceCents: 1000,
    relationshipProfile: 'LOYAL',
    commercialContext: { allowsDiscount: true, category: 'GENERAL' },
  };
  it('does not query a policy without the current relationship profile', async () => {
    const findApplicablePolicies = vi.fn();
    const adapter = new ConfiguredDiscountPolicy({ findApplicablePolicies });
    expect(
      await adapter.evaluate({ ...input, relationshipProfile: undefined }),
    ).toEqual({ available: true, discountCents: 0 });
    expect(findApplicablePolicies).not.toHaveBeenCalled();
  });
  it('does not apply policies that are empty, single use or require approval', async () => {
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
    const findApplicablePolicies = vi.fn();
    const adapter = new ConfiguredDiscountPolicy({ findApplicablePolicies });
    for (const policies of [
      [],
      [DiscountPolicy.create({ ...props, singleUse: true })],
      [DiscountPolicy.create({ ...props, requiresApproval: true })],
    ]) {
      findApplicablePolicies.mockResolvedValue(policies);
      expect(await adapter.evaluate(input)).toEqual({
        available: true,
        discountCents: 0,
      });
    }
  });
});
