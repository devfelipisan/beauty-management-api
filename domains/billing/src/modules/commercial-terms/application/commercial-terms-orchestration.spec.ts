import { CalculateCommercialTerms } from './calculate-commercial-terms.js';

function fixture() {
  const discount = {
    evaluate: vi.fn().mockResolvedValue({
      available: true,
      discountCents: 100,
      policyId: 'policy',
      snapshot: { source: 'configured' },
    }),
  };
  const deposit = {
    evaluate: vi
      .fn()
      .mockResolvedValue({ available: true, required: true, amountCents: 200 }),
  };
  const input = {
    tenantId: 'tenant',
    customerId: 'customer',
    serviceId: 'service',
    basePriceCents: 1000,
    relationshipProfile: 'LOYAL',
    commercialContext: {
      serviceId: 'service',
      category: 'GENERAL',
      minimumPriceCents: 500,
      allowsDiscount: true,
      depositMode: 'FIXED' as const,
    },
  };
  return {
    discount,
    deposit,
    input,
    calculate: new CalculateCommercialTerms(discount, deposit),
  };
}
describe('commercial terms capability orchestration', () => {
  it('forwards the discount-adjusted final amount and preserves the policy snapshot in the result', async () => {
    const f = fixture();
    expect(await f.calculate.execute(f.input)).toMatchObject({
      status: 'READY',
      basePriceCents: 1000,
      discountCents: 100,
      finalPriceCents: 900,
      depositCents: 200,
      discountPolicyId: 'policy',
      discountPolicySnapshot: { source: 'configured' },
      customerProfileAtCalculation: 'LOYAL',
    });
    expect(f.discount.evaluate).toHaveBeenCalledWith(f.input);
    expect(f.deposit.evaluate).toHaveBeenCalledWith({
      ...f.input,
      finalPriceCents: 900,
    });
  });
  it.each([
    ['DISCOUNT_POLICY_UNAVAILABLE', { available: false }],
    ['DISCOUNT_APPROVAL_REQUIRED', { available: true, approvalRequired: true }],
    ['INVALID_COMMERCIAL_TERMS', { available: true, discountCents: 1001 }],
    ['INVALID_COMMERCIAL_TERMS', { available: true, discountCents: 501 }],
  ])('blocks %s before asking for a deposit', async (reason, decision) => {
    const f = fixture();
    f.discount.evaluate.mockResolvedValue(decision);
    expect(await f.calculate.execute(f.input)).toEqual({
      status: 'BLOCKED',
      reason,
    });
    expect(f.deposit.evaluate).not.toHaveBeenCalled();
  });
  it('rejects missing/mismatched commercial context before invoking capabilities', async () => {
    const f = fixture();
    expect(
      await f.calculate.execute({ ...f.input, commercialContext: undefined }),
    ).toEqual({ status: 'BLOCKED', reason: 'DISCOUNT_POLICY_UNAVAILABLE' });
    expect(
      await f.calculate.execute({
        ...f.input,
        commercialContext: { ...f.input.commercialContext, serviceId: 'other' },
      }),
    ).toEqual({ status: 'BLOCKED', reason: 'INVALID_COMMERCIAL_TERMS' });
    expect(f.discount.evaluate).not.toHaveBeenCalled();
  });
  it.each([
    ['DEPOSIT_POLICY_UNAVAILABLE', { available: false }],
    ['INVALID_COMMERCIAL_TERMS', { available: true, required: true }],
    [
      'INVALID_COMMERCIAL_TERMS',
      { available: true, required: true, amountCents: 901 },
    ],
  ])('blocks %s from the deposit decision', async (reason, decision) => {
    const f = fixture();
    f.deposit.evaluate.mockResolvedValue(decision);
    expect(await f.calculate.execute(f.input)).toEqual({
      status: 'BLOCKED',
      reason,
    });
  });
  it('omits optional deposit cents and accepts absent optional discounts/minimum', async () => {
    const f = fixture();
    f.discount.evaluate.mockResolvedValue({ available: true });
    f.deposit.evaluate.mockResolvedValue({ available: true });
    const response = await f.calculate.execute({
      ...f.input,
      commercialContext: {
        ...f.input.commercialContext,
        minimumPriceCents: undefined,
      },
    });
    expect(response).toMatchObject({ status: 'READY', finalPriceCents: 1000 });
    expect(response).not.toHaveProperty('depositCents');
  });
});
