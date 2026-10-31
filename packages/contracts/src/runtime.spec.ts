import { assertRpcContract } from './runtime.js';

describe('runtime command contracts', () => {
  const context = {
    tenantId: 'tenant',
    actorId: 'actor',
    requestId: 'request',
    correlationId: 'correlation',
    idempotencyKey: 'key',
  };
  it('rejects invalid monetary input and unknown authority fields', () => {
    const input = {
      ...context,
      receivableId: 'receivable',
      amountCents: 100,
      method: 'PIX',
    };
    expect(() => assertRpcContract('registerPayment', input)).not.toThrow();
    expect(() =>
      assertRpcContract('registerPayment', { ...input, amountCents: '100' }),
    ).toThrow('VALIDATION_ERROR');
    expect(() =>
      assertRpcContract('registerPayment', {
        ...input,
        amountCents: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow('VALIDATION_ERROR');
    expect(() =>
      assertRpcContract('registerPayment', {
        ...input,
        permissions: ['payment.create'],
      }),
    ).toThrow('VALIDATION_ERROR');
  });
  it('validates nested technical definitions without coercion', () => {
    const input = {
      ...context,
      serviceId: 'service',
      fields: [
        { key: 'key', name: 'Name', type: 'BOOLEAN', order: 0, required: true },
      ],
    };
    expect(() => assertRpcContract('createTechnicalForm', input)).not.toThrow();
    expect(() =>
      assertRpcContract('createTechnicalForm', {
        ...input,
        fields: [{ ...input.fields[0], required: 'true' }],
      }),
    ).toThrow('VALIDATION_ERROR');
  });
});
