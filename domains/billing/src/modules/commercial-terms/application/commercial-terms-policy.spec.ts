import { CalculateCommercialTerms } from './calculate-commercial-terms.js';
import { ConfiguredDepositPolicy } from '../../deposits/infrastructure/configured-deposit-policy.js';

describe('materialized commercial policies', () => {
  it('calculates percentage deposit after discount', async () => {
    const result = await new CalculateCommercialTerms({ evaluate: async () => ({ available: true, discountCents: 2000 }) }, new ConfiguredDepositPolicy()).execute({
      tenantId: 'tenant', customerId: 'customer', serviceId: 'service', basePriceCents: 20000,
      commercialContext: { serviceId: 'service', category: 'GENERAL', allowsDiscount: true, depositMode: 'PERCENTAGE', depositPercentageBasisPoints: 2000 },
    });
    expect(result).toMatchObject({ status: 'READY', finalPriceCents: 18000, depositCents: 3600 });
  });

  it('returns READY without discount when Service disallows discount', async () => {
    const result = await new CalculateCommercialTerms({ evaluate: async () => ({ available: true, discountCents: 0 }) }, new ConfiguredDepositPolicy()).execute({
      tenantId: 'tenant', customerId: 'customer', serviceId: 'service', basePriceCents: 10000,
      commercialContext: { serviceId: 'service', category: 'GENERAL', allowsDiscount: false, depositMode: 'NOT_REQUIRED' },
    });
    expect(result).toMatchObject({ status: 'READY', discountCents: 0, finalPriceCents: 10000, depositRequired: false });
    expect(result.depositCents).toBeUndefined();
  });
});
