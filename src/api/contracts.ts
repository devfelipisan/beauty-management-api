import {
  arraySchema,
  booleanSchema,
  enumSchema,
  numberSchema,
  objectSchema,
  optionalSchema,
  stringSchema,
  type RuntimeSchema,
} from "@/shared/contracts/runtime-schema";

export type BusinessCommand =
  | "tenant.create"
  | "professional.create"
  | "service.create"
  | "equipment.create"
  | "package.create"
  | "customer.create"
  | "assessment.create"
  | "appointment.create"
  | "public-appointment.create"
  | "public-lead.create"
  | "lead.status.update"
  | "deposit.confirm"
  | "session.start"
  | "session.complete"
  | "technical-record.create"
  | "follow-up.create"
  | "follow-up.status.update"
  | "payment.register"
  | "tenant-branding.update";

const id = stringSchema({ min: 1, max: 128, trim: true });
const idempotencyKey = stringSchema({ min: 8, max: 200, trim: true });
const isoDateTime = stringSchema({ min: 20, max: 40, trim: true });
const moneyCents = numberSchema({ integer: true, min: 0 });
const shortText = stringSchema({ min: 1, max: 200, trim: true });

const depositConfigurationSchema = objectSchema({
  required: booleanSchema(),
  type: enumSchema(["none", "fixed", "percentage"] as const),
  value: numberSchema({ min: 0 }),
});

export const businessCommandSchemas: Record<BusinessCommand, RuntimeSchema<unknown>> = {
  "tenant.create": objectSchema({
    legalName: stringSchema({ min: 2, max: 200, trim: true }),
    displayName: stringSchema({ min: 2, max: 160, trim: true }),
    document: stringSchema({ min: 5, max: 40, trim: true }),
    timezone: optionalSchema(stringSchema({ min: 1, max: 100, trim: true })),
  }),
  "professional.create": objectSchema({
    displayName: stringSchema({ min: 2, max: 160, trim: true }),
    specialty: optionalSchema(stringSchema({ min: 1, max: 160, trim: true })),
    serviceIds: optionalSchema(arraySchema(id, { max: 100 })),
    active: optionalSchema(booleanSchema()),
  }),
  "service.create": objectSchema({
    name: stringSchema({ min: 2, max: 180, trim: true }),
    category: stringSchema({ min: 2, max: 120, trim: true }),
    durationMinutes: numberSchema({ integer: true, min: 1, max: 1440 }),
    priceCents: moneyCents,
    professionalIds: arraySchema(id, { max: 100 }),
    active: optionalSchema(booleanSchema()),
    deposit: optionalSchema(depositConfigurationSchema),
    assessmentRequired: optionalSchema(booleanSchema()),
  }),
  "equipment.create": objectSchema({
    name: stringSchema({ min: 2, max: 180, trim: true }),
    model: optionalSchema(stringSchema({ min: 1, max: 160, trim: true })),
    manufacturer: optionalSchema(stringSchema({ min: 1, max: 160, trim: true })),
    serialNumber: optionalSchema(stringSchema({ min: 1, max: 160, trim: true })),
    primaryUnit: optionalSchema(stringSchema({ min: 1, max: 80, trim: true })),
    serviceIds: arraySchema(id, { max: 100 }),
    notes: optionalSchema(stringSchema({ min: 1, max: 2000, trim: true })),
  }),
  "package.create": objectSchema({
    customerId: id,
    serviceId: id,
    totalSessions: numberSchema({ integer: true, min: 1, max: 1000 }),
    validUntil: optionalSchema(isoDateTime),
    priceCents: optionalSchema(moneyCents),
  }),
  "customer.create": objectSchema({
    fullName: stringSchema({ min: 2, max: 180, trim: true }),
    phone: stringSchema({ min: 8, max: 40, trim: true }),
    email: optionalSchema(stringSchema({ min: 3, max: 254, trim: true })),
  }),
  "assessment.create": objectSchema({
    customerId: id,
    serviceId: id,
    professionalId: id,
    result: enumSchema(["fit", "fit_with_restrictions", "not_fit"] as const),
    restrictions: optionalSchema(arraySchema(stringSchema({ min: 1, max: 500, trim: true }), { max: 50 })),
    validUntil: optionalSchema(isoDateTime),
  }),
  "appointment.create": objectSchema({
    customerId: id,
    professionalId: id,
    serviceId: id,
    startsAt: isoDateTime,
    discountCents: optionalSchema(moneyCents),
    origin: optionalSchema(enumSchema(["reception", "landing_page", "whatsapp", "return", "campaign", "referral", "manual"] as const)),
    idempotencyKey,
  }),
  "public-appointment.create": objectSchema({
    customer: objectSchema({
      fullName: stringSchema({ min: 2, max: 180, trim: true }),
      phone: stringSchema({ min: 8, max: 40, trim: true }),
      email: optionalSchema(stringSchema({ min: 3, max: 254, trim: true })),
    }),
    professionalId: id,
    serviceId: id,
    startsAt: isoDateTime,
    idempotencyKey,
  }),
  "public-lead.create": objectSchema({
    fullName: stringSchema({ min: 2, max: 180, trim: true }),
    phone: optionalSchema(stringSchema({ min: 8, max: 40, trim: true })),
    email: optionalSchema(stringSchema({ min: 3, max: 254, trim: true })),
    serviceId: optionalSchema(id),
    professionalId: optionalSchema(id),
    desiredPeriod: optionalSchema(stringSchema({ min: 1, max: 120, trim: true })),
    notes: optionalSchema(stringSchema({ min: 1, max: 2000, trim: true })),
    origin: enumSchema(["landing_contact", "landing_newsletter", "landing_service_interest"] as const),
    privacyConsent: booleanSchema(),
    marketingConsent: booleanSchema(),
  }),
  "lead.status.update": objectSchema({
    action: enumSchema(["start_contact", "await_customer", "resume_contact", "mark_no_response", "lose", "mark_duplicate"] as const),
  }),
  "deposit.confirm": objectSchema({
    appointmentId: id,
    paymentMethod: shortText,
    idempotencyKey,
  }),
  "session.start": objectSchema({
    appointmentId: id,
    technicalFormVersion: optionalSchema(numberSchema({ integer: true, min: 1 })),
    idempotencyKey,
  }),
  "session.complete": objectSchema({
    sessionId: id,
    idempotencyKey,
  }),
  "technical-record.create": objectSchema({
    sessionId: id,
    region: optionalSchema(stringSchema({ min: 1, max: 200, trim: true })),
    equipmentId: optionalSchema(id),
    power: optionalSchema(numberSchema({ min: 0 })),
    powerUnit: optionalSchema(stringSchema({ min: 1, max: 80, trim: true })),
    reaction: optionalSchema(stringSchema({ min: 1, max: 1000, trim: true })),
    notes: optionalSchema(stringSchema({ min: 1, max: 4000, trim: true })),
  }),
  "follow-up.create": objectSchema({
    customerId: id,
    sessionId: optionalSchema(id),
    suggestedAt: isoDateTime,
    reason: optionalSchema(stringSchema({ min: 1, max: 1000, trim: true })),
    appointmentId: optionalSchema(id),
  }),
  "follow-up.status.update": objectSchema({
    action: enumSchema(["schedule", "complete", "cancel", "reopen"] as const),
    appointmentId: optionalSchema(id),
  }),
  "payment.register": objectSchema({
    customerId: id,
    originType: enumSchema(["appointment", "session", "package", "credit", "other"] as const),
    originId: id,
    amountCents: moneyCents,
    method: enumSchema(["cash", "pix", "debit_card", "credit_card", "transfer", "internal_credit"] as const),
    idempotencyKey,
  }),
  "tenant-branding.update": objectSchema({
    primaryColor: optionalSchema(stringSchema({ min: 7, max: 7, trim: true })),
    secondaryColor: optionalSchema(stringSchema({ min: 7, max: 7, trim: true })),
    logoFileId: optionalSchema(id),
    faviconFileId: optionalSchema(id),
    heroFileId: optionalSchema(id),
  }),
};

export function parseBusinessCommandInput(command: BusinessCommand, value: unknown): unknown {
  return businessCommandSchemas[command].parse(value);
}
