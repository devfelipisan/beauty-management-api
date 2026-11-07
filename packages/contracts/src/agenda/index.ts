import type {
  AppointmentStatus,
  AppointmentOrigin,
} from '../create-appointment/index.js';

export interface AgendaQuery {
  from: string;
  to: string;
  professionalId?: string;
  serviceId?: string;
  status?: AppointmentStatus;
  cursor?: string;
  limit?: number;
}

export interface AgendaAppointment {
  tenantId?: string;
  basePriceCents?: number | null;
  discountCents?: number | null;
  finalPriceCents?: number | null;
  depositCents?: number | null;
  createdAt?: string;
  updatedAt?: string;
  id: string;
  customer: { id: string; displayName: string | null };
  professional: { id: string; displayName: string | null };
  service: { id: string; displayName: string | null };
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  origin: AppointmentOrigin;
}

export interface AgendaResponse {
  tenant: { id: string; displayName: string; timezone: string };
  period: { from: string; to: string };
  appointments: AgendaAppointment[];
  summary: Partial<Record<AppointmentStatus, number>>;
  page: { nextCursor: string | null; hasMore: boolean };
}

export interface AgendaAppointmentDetails extends AgendaAppointment {
  allowedActions: readonly string[];
}
