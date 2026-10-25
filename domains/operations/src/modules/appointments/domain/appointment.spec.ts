import { Appointment, AppointmentOrigin, AppointmentStatus } from './appointment.js';

const base = { tenantId: 'tenant', customerId: 'customer', serviceId: 'service', professionalId: 'professional', startsAt: '2028-01-01T09:00:00.000Z', durationMinutes: 60, basePriceCents: 20000, discountCents: 2000, finalPriceCents: 18000, origin: AppointmentOrigin.RECEPTION };

describe('Appointment', () => {
  it('derives the initial status from the commercial deposit decision', () => {
    expect(Appointment.create('with-deposit', { ...base, depositRequired: true, depositCents: 3600 }).data.status).toBe(AppointmentStatus.AWAITING_DEPOSIT);
    expect(Appointment.create('without-deposit', { ...base, depositRequired: false }).data.status).toBe(AppointmentStatus.AWAITING_CONFIRMATION);
  });
});
