export type AppointmentOrigin = 'RECEPTION' | 'LANDING_PAGE' | 'WHATSAPP' | 'RETURN' | 'CAMPAIGN' | 'REFERRAL' | 'MANUAL';
export type AppointmentStatus = 'AWAITING_DEPOSIT' | 'AWAITING_CONFIRMATION' | 'CONFIRMED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'RESCHEDULED' | 'CANCELED' | 'NO_SHOW' | 'EXPIRED';

export interface CreateAppointmentRequest {
  customerId: string;
  serviceId: string;
  professionalId: string;
  startsAt: string;
  origin: AppointmentOrigin;
}

export interface CreateAppointmentResponse {
  id: string;
  tenantId: string;
  customerId: string;
  serviceId: string;
  professionalId: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  basePriceCents: number;
  discountCents: number;
  finalPriceCents: number;
  depositRequired: boolean;
  depositCents?: number;
  customerProfileAtCalculation?: string;
  discountPolicyId?: string;
  discountPolicySnapshot?: Record<string, unknown>;
  depositMode: 'NOT_REQUIRED' | 'FIXED' | 'PERCENTAGE';
  depositConfiguredValue?: number;
  origin: AppointmentOrigin;
  status: AppointmentStatus;
  createdAt: string;
}
