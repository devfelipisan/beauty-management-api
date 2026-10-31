import { ConfiguredDepositPolicy } from './configured-deposit-policy.js';

describe('configured deposit adapter', () => {
  const policy = new ConfiguredDepositPolicy();
  const input = {
    tenantId: 'tenant',
    serviceId: 'service',
    finalPriceCents: 1000,
  };
  it('does not require a deposit without configuration or with NOT_REQUIRED', async () => {
    expect(await policy.evaluate(input)).toEqual({
      available: true,
      required: false,
    });
    expect(
      await policy.evaluate({
        ...input,
        commercialContext: { depositMode: 'NOT_REQUIRED' },
      }),
    ).toEqual({ available: true, required: false });
  });
  it.each([undefined, -1, 0.5, 1001])(
    'returns an invalid fixed decision for %s rather than inventing an amount',
    async (depositFixedCents) => {
      expect(
        await policy.evaluate({
          ...input,
          commercialContext: { depositMode: 'FIXED', depositFixedCents },
        }),
      ).toEqual({ available: true, required: true, amountCents: undefined });
    },
  );
  it.each([0, 1000])(
    'preserves the inclusive fixed amount boundary %s',
    async (depositFixedCents) => {
      expect(
        await policy.evaluate({
          ...input,
          commercialContext: { depositMode: 'FIXED', depositFixedCents },
        }),
      ).toEqual({
        available: true,
        required: true,
        amountCents: depositFixedCents,
      });
    },
  );
  it.each([undefined, -1, 0.5, 10001])(
    'rejects invalid percentage basis points %s',
    async (depositPercentageBasisPoints) => {
      expect(
        await policy.evaluate({
          ...input,
          commercialContext: {
            depositMode: 'PERCENTAGE',
            depositPercentageBasisPoints,
          },
        }),
      ).toEqual({ available: true, required: true, amountCents: undefined });
    },
  );
  it.each([
    [0, 0],
    [3333, 333],
    [10000, 1000],
  ])(
    'calculates existing percentage rounding for %s basis points',
    async (depositPercentageBasisPoints, expected) => {
      expect(
        await policy.evaluate({
          ...input,
          commercialContext: {
            depositMode: 'PERCENTAGE',
            depositPercentageBasisPoints,
          },
        }),
      ).toEqual({ available: true, required: true, amountCents: expected });
    },
  );
});
