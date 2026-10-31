import { assertRpcContract } from './runtime.js';

describe('runtime command contracts', () => {
  const context = {
    tenantId: 'tenant',
    actorId: 'actor',
    requestId: 'request',
    correlationId: 'correlation',
    idempotencyKey: 'key',
  };
  const cases = [
    [
      'rescheduleAppointment',
      {
        appointmentId: 'a',
        professionalId: 'p',
        startsAt: '2026-10-31T10:00:00Z',
        reason: 'reason',
      },
    ],
    [
      'cancelAppointment',
      {
        appointmentId: 'a',
        reason: 'reason',
        origin: 'CUSTOMER',
        note: 'note',
      },
    ],
    ['markAppointmentNoShow', { appointmentId: 'a' }],
    [
      'assignPackageToAppointment',
      { appointmentId: 'a', customerPackageId: 'p' },
    ],
    ['startSession', { appointmentId: 'a' }],
    ['completeSession', { sessionId: 's' }],
    ['publishTechnicalForm', { formId: 'f' }],
    [
      'recordSessionTechnicalValues',
      { sessionId: 's', values: [{ fieldId: 'f', value: false, unit: 'u' }] },
    ],
    ['recordSessionPower', { sessionId: 's', value: 1, unit: 'u' }],
    [
      'createEquipment',
      {
        equipment: {
          name: 'Name',
          model: 'Model',
          manufacturer: 'Maker',
          serialNumber: 'Serial',
          mainUnit: 'Unit',
          notes: 'Notes',
        },
      },
    ],
    [
      'configureEquipmentServices',
      { equipmentId: 'e', serviceIds: ['service'] },
    ],
    ['recordSessionEquipmentUsage', { sessionId: 's', equipmentId: 'e' }],
    [
      'configureVariationPolicy',
      {
        serviceId: 's',
        parameterKey: 'power',
        mode: 'ABSOLUTE',
        threshold: '10',
        unit: 'u',
      },
    ],
    [
      'justifyVariationAlert',
      { sessionId: 's', alertId: 'a', justification: 'Reason' },
    ],
    [
      'recommendReturn',
      {
        sessionId: 's',
        required: true,
        interval: { value: 2, unit: 'WEEK' },
        recommendedFor: '2026-10-31',
        reasonCode: 'r',
        observation: 'note',
      },
    ],
  ] as const;
  it.each(cases)(
    'accepts the existing %s shape and rejects missing identifiers or injected fields',
    (operation, body) => {
      const input = { ...context, ...body };
      expect(() => assertRpcContract(operation, input)).not.toThrow();
      expect(() =>
        assertRpcContract(operation, { ...input, tenantId: '' }),
      ).toThrow('VALIDATION_ERROR');
      expect(() =>
        assertRpcContract(operation, { ...input, roles: ['admin'] }),
      ).toThrow('VALIDATION_ERROR');
    },
  );
  it.each(['checkSessionCompletionEligibility', 'getPreviousSessionContext'])(
    'accepts %s read context without mutation-only fields',
    (operation) => {
      const input = {
        tenantId: 'tenant',
        actorId: 'actor',
        sessionId: 'session',
      };
      expect(() => assertRpcContract(operation, input)).not.toThrow();
      expect(() =>
        assertRpcContract(operation, {
          ...input,
          correlationId: 'c',
          requestId: 'r',
        }),
      ).not.toThrow();
      expect(() =>
        assertRpcContract(operation, { ...input, idempotencyKey: 'extra' }),
      ).toThrow('VALIDATION_ERROR');
    },
  );
  it('rejects invalid dates, numeric coercion, nested unknown keys and invalid return intervals', () => {
    for (const [operation, body] of [
      [
        'rescheduleAppointment',
        {
          appointmentId: 'a',
          professionalId: 'p',
          startsAt: 'invalid',
          reason: 'reason',
        },
      ],
      ['recordSessionPower', { sessionId: 's', value: Infinity, unit: 'u' }],
      ['recordSessionPower', { sessionId: 's', value: false, unit: 'u' }],
      ['createEquipment', { equipment: { name: 'N', actorId: 'forged' } }],
      [
        'recommendReturn',
        {
          sessionId: 's',
          required: false,
          interval: { value: 0, unit: 'DAY' },
        },
      ],
      [
        'recommendReturn',
        { sessionId: 's', required: false, recommendedFor: 'invalid' },
      ],
      ['configureEquipmentServices', { equipmentId: 'e', serviceIds: [1] }],
    ] as const)
      expect(() =>
        assertRpcContract(operation, { ...context, ...body }),
      ).toThrow('VALIDATION_ERROR');
    expect(() =>
      assertRpcContract('recordSessionPower', {
        ...context,
        sessionId: 's',
        value: '1.25',
        unit: 'u',
      }),
    ).not.toThrow();
    for (const value of [null, [], 1, 'json'])
      expect(() => assertRpcContract('completeSession', value)).toThrow(
        'VALIDATION_ERROR',
      );
    expect(() =>
      assertRpcContract('operationWithoutTransportSchema', null),
    ).not.toThrow();
  });
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
