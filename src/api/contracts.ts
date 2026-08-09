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
  | "customer.create"
  | "appointment.create"
  | "public-appointment.create"
  | "public-lead.create"
  | "lead.status.update"
  | "deposit.confirm"
  | "session.start"
  | "session.complete"
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
  "customer.create": objectSchema({
    fullName: stringSchema({ min: 2, max: 180, trim: true }),
    phone: stringSchema({ min: 8, max: 40, trim: true }),
    email: optionalSchema(stringSchema({ min: 3, max: 254, trim: true })),
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
