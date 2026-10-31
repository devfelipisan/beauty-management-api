type Check = (value: unknown) => boolean;
const string: Check = (value) => typeof value === 'string';
const nonempty: Check = (value) =>
  typeof value === 'string' && Boolean(value.trim());
const integer: Check = (value) =>
  typeof value === 'number' && Number.isSafeInteger(value);
const boolean: Check = (value) => typeof value === 'boolean';
const optional =
  (check: Check): Check =>
  (value) =>
    value === undefined || check(value);
const array =
  (check: Check): Check =>
  (value) =>
    Array.isArray(value) && value.every(check);
const enumeration =
  (...values: string[]): Check =>
  (value) =>
    typeof value === 'string' && values.includes(value);
const object =
  (shape: Record<string, Check>): Check =>
  (value) =>
    Boolean(
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).every((key) => Object.hasOwn(shape, key)) &&
      Object.entries(shape).every(([key, check]) =>
        check((value as Record<string, unknown>)[key]),
      ),
    );
const context = {
  tenantId: nonempty,
  actorId: nonempty,
  requestId: nonempty,
  correlationId: nonempty,
  idempotencyKey: nonempty,
};
const readContext = {
  tenantId: nonempty,
  actorId: nonempty,
  requestId: optional(nonempty),
  correlationId: optional(nonempty),
};
const field = object({
  key: nonempty,
  name: nonempty,
  description: optional(string),
  type: enumeration(
    'SHORT_TEXT',
    'LONG_TEXT',
    'INTEGER',
    'DECIMAL',
    'PERCENTAGE',
    'SINGLE_SELECT',
    'MULTI_SELECT',
    'BOOLEAN',
    'DATE',
    'TIME',
    'MEASUREMENT',
  ),
  order: integer,
  required: optional(boolean),
  minimum: optional(string),
  maximum: optional(string),
  precision: optional(integer),
  unit: optional(string),
  options: optional(array(string)),
  status: optional(enumeration('ACTIVE', 'INACTIVE')),
});
const schemas: Record<string, Check> = {
  registerPayment: object({
    ...context,
    receivableId: nonempty,
    customerId: optional(nonempty),
    amountCents: (value) => integer(value) && (value as number) > 0,
    method: enumeration(
      'CASH',
      'PIX',
      'DEBIT_CARD',
      'CREDIT_CARD',
      'TRANSFER',
      'INTERNAL_CREDIT',
    ),
    externalReference: optional(string),
    notes: optional(string),
  }),
  rescheduleAppointment: object({
    ...context,
    appointmentId: nonempty,
    professionalId: nonempty,
    startsAt: (value) =>
      string(value) && Number.isFinite(Date.parse(value as string)),
    reason: nonempty,
  }),
  cancelAppointment: object({
    ...context,
    appointmentId: nonempty,
    reason: nonempty,
    note: optional(string),
    origin: enumeration(
      'CUSTOMER',
      'COMPANY',
      'PROFESSIONAL',
      'SYSTEM_EXPIRATION',
    ),
  }),
  markAppointmentNoShow: object({ ...context, appointmentId: nonempty }),
  assignPackageToAppointment: object({
    ...context,
    appointmentId: nonempty,
    customerPackageId: nonempty,
  }),
  startSession: object({ ...context, appointmentId: nonempty }),
  completeSession: object({ ...context, sessionId: nonempty }),
  checkSessionCompletionEligibility: object({
    ...readContext,
    sessionId: nonempty,
  }),
  createTechnicalForm: object({
    ...context,
    serviceId: nonempty,
    fields: array(field),
  }),
  publishTechnicalForm: object({ ...context, formId: nonempty }),
  recordSessionTechnicalValues: object({
    ...context,
    sessionId: nonempty,
    values: array(
      object({ fieldId: nonempty, value: () => true, unit: optional(string) }),
    ),
  }),
  recordSessionPower: object({
    ...context,
    sessionId: nonempty,
    value: (value) =>
      string(value) || (typeof value === 'number' && Number.isFinite(value)),
    unit: nonempty,
  }),
  createEquipment: object({
    ...context,
    equipment: object({
      name: nonempty,
      model: optional(string),
      manufacturer: optional(string),
      serialNumber: optional(string),
      mainUnit: optional(string),
      notes: optional(string),
    }),
  }),
  configureEquipmentServices: object({
    ...context,
    equipmentId: nonempty,
    serviceIds: array(nonempty),
  }),
  recordSessionEquipmentUsage: object({
    ...context,
    sessionId: nonempty,
    equipmentId: nonempty,
  }),
  getPreviousSessionContext: object({ ...readContext, sessionId: nonempty }),
  configureVariationPolicy: object({
    ...context,
    serviceId: nonempty,
    parameterKey: nonempty,
    mode: enumeration('ABSOLUTE', 'PERCENTAGE'),
    threshold: nonempty,
    unit: optional(string),
  }),
  justifyVariationAlert: object({
    ...context,
    sessionId: nonempty,
    alertId: nonempty,
    justification: nonempty,
  }),
  recommendReturn: object({
    ...context,
    sessionId: nonempty,
    required: boolean,
    interval: optional(
      object({
        value: (value) => integer(value) && (value as number) > 0,
        unit: enumeration('DAY', 'WEEK', 'MONTH'),
      }),
    ),
    recommendedFor: optional(
      (value) => string(value) && Number.isFinite(Date.parse(value as string)),
    ),
    reasonCode: optional(string),
    observation: optional(string),
  }),
};

/** Validates transport shape; aggregate invariants remain authoritative. */
export function assertRpcContract(operation: string, input: unknown): void {
  const schema = schemas[operation];
  if (schema && !schema(input)) throw new Error('VALIDATION_ERROR');
}
