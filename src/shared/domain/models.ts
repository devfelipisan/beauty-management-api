import type { EntityId, IsoDateTime, MoneyCents } from "@/shared/domain/core";
import type { AppointmentStatus, DepositStatus, SessionStatus } from "@/shared/domain/lifecycle-status";

export type TenantStatus = "trial" | "active" | "suspended" | "closed";
export type CustomerStatus = "active" | "inactive" | "blocked";
export type CustomerProfile = "new" | "returning" | "loyal" | "inactive" | "frequent_no_show";
export type PaymentStatus = "pending" | "partial" | "paid" | "refunded" | "canceled";

export interface Tenant {
  id: EntityId;
  legalName: string;
  displayName: string;
  document: string;
  /** Canonical first path segment used to address public tenant resources. */
  publicSlug?: string;
  timezone: string;
  status: TenantStatus;
  createdAt: IsoDateTime;
}

export interface Professional {
  id: EntityId;
  tenantId: EntityId;
  displayName: string;
  specialty?: string;
  serviceIds: EntityId[];
  active: boolean;
  createdAt: IsoDateTime;
}

export interface Service {
  id: EntityId;
  tenantId: EntityId;
  name: string;
  category: string;
  durationMinutes: number;
  priceCents: MoneyCents;
  active: boolean;
  professionalIds: EntityId[];
  deposit: { required: boolean; type: "none" | "fixed" | "percentage"; value: number };
  assessmentRequired: boolean;
  createdAt: IsoDateTime;
}

export interface Customer {
  id: EntityId;
  tenantId: EntityId;
  fullName: string;
  phone: string;
  email?: string;
  status: CustomerStatus;
  relationshipProfile: CustomerProfile;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Appointment {
  id: EntityId;
  tenantId: EntityId;
  customerId: EntityId;
  professionalId: EntityId;
  serviceId: EntityId;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
  status: AppointmentStatus;
  basePriceCents: MoneyCents;
  discountCents: MoneyCents;
  finalPriceCents: MoneyCents;
  depositCents: MoneyCents;
  origin: "reception" | "landing_page" | "whatsapp" | "return" | "campaign" | "referral" | "manual";
  createdBy?: EntityId;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Deposit {
  id: EntityId;
  tenantId: EntityId;
  appointmentId: EntityId;
  amountCents: MoneyCents;
  status: DepositStatus;
  paymentMethod?: string;
  confirmedAt?: IsoDateTime;
  confirmedBy?: EntityId;
  createdAt: IsoDateTime;
}

export interface Session {
  id: EntityId;
  tenantId: EntityId;
  appointmentId: EntityId;
  customerId: EntityId;
  professionalId: EntityId;
  serviceId: EntityId;
  status: SessionStatus;
  startedAt: IsoDateTime;
  completedAt?: IsoDateTime;
  technicalFormVersion: number;
}

export interface Payment {
  id: EntityId;
  tenantId: EntityId;
  customerId: EntityId;
  originType: "appointment" | "session" | "package" | "credit" | "other";
  originId: EntityId;
  amountCents: MoneyCents;
  method: "cash" | "pix" | "debit_card" | "credit_card" | "transfer" | "internal_credit";
  status: PaymentStatus;
  paidAt?: IsoDateTime;
  createdAt: IsoDateTime;
}
