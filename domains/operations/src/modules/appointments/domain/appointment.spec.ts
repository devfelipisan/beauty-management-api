import {
  Appointment,
  AppointmentOrigin,
  AppointmentStatus,
} from './appointment.js';

const base = {
  tenantId: 'tenant',
  customerId: 'customer',
  serviceId: 'service',
  professionalId: 'professional',
  startsAt: '2028-01-01T09:00:00.000Z',
  durationMinutes: 60,
  basePriceCents: 20000,
  discountCents: 2000,
  finalPriceCents: 18000,
  origin: AppointmentOrigin.RECEPTION,
};

describe('Appointment', () => {
  it.each(['tenantId', 'customerId', 'serviceId', 'professionalId'])(
    'rejects an absent %s reference',
    (key) => {
      expect(() =>
        Appointment.create('appointment', { ...base, [key]: '' }),
      ).toThrow('Appointment references are required');
    },
  );
  it.each([
    'basePriceCents',
    'discountCents',
    'finalPriceCents',
    'depositCents',
    'depositConfiguredValue',
  ])('rejects negative or fractional %s snapshots', (key) => {
    for (const value of [-1, 0.5])
      expect(() =>
        Appointment.create('appointment', { ...base, [key]: value }),
      ).toThrow('Price snapshots must be non-negative cents');
  });
  it('preserves explicit status/timestamps and updates only status/time when transitioning', () => {
    const appointment = Appointment.create('appointment', {
      ...base,
      status: AppointmentStatus.CONFIRMED,
      createdAt: 'created',
      updatedAt: 'updated',
    });
    const previous = appointment.data;
    appointment.transition(AppointmentStatus.CHECKED_IN, 'checked-in');
    expect(appointment.data).toEqual({
      ...previous,
      status: AppointmentStatus.CHECKED_IN,
      updatedAt: 'checked-in',
    });
    appointment.transition(AppointmentStatus.IN_PROGRESS);
    expect(appointment.data.updatedAt).not.toBe('checked-in');
    expect(appointment.data.createdAt).toBe('created');
  });
  it('derives the initial status from the commercial deposit decision', () => {
    expect(
      Appointment.create('with-deposit', {
        ...base,
        depositRequired: true,
        depositCents: 3600,
      }).data.status,
    ).toBe(AppointmentStatus.AWAITING_DEPOSIT);
    expect(
      Appointment.create('without-deposit', { ...base, depositRequired: false })
        .data.status,
    ).toBe(AppointmentStatus.AWAITING_CONFIRMATION);
  });
});
