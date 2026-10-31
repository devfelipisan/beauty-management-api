import type { CreateAppointmentResponse } from '@beauty/contracts';
import { IdempotencyService } from '@beauty/reliability/idempotency/idempotency.service';
import type { IdempotencyStore } from '@beauty/reliability/idempotency/idempotency-store';
import type { UnitOfWork } from '@beauty/reliability/unit-of-work/unit-of-work';
import { Appointment, AppointmentOrigin } from '../domain/appointment.js';
import type { AppointmentRepository } from '../ports/appointment-repository.js';
import type { CommercialTermsPort } from '../ports/commercial-terms-port.js';
import type { CheckAppointmentEligibility } from '../../appointment-eligibility/application/check-appointment-eligibility.js';
import type { CustomerRepository } from '../../customers/ports/customer-repository.js';
import type { ServiceRepository } from '../../services/ports/service-repository.js';
import type { CreateAppointmentRequest } from '@beauty/contracts';

export interface CreateAppointmentCommand {
  tenantId: string;
  customerId: string;
  serviceId: string;
  professionalId: string;
  startsAt: string;
  origin: CreateAppointmentRequest['origin'];
  idempotencyKey: string;
  actorId: string;
  requestId: string;
  correlationId: string;
}

export class CreateAppointmentError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export class CreateAppointment {
  constructor(
    private readonly eligibility: CheckAppointmentEligibility,
    private readonly customers: CustomerRepository,
    private readonly services: ServiceRepository,
    private readonly appointments: AppointmentRepository,
    private readonly commercialTerms: CommercialTermsPort,
    private readonly unitOfWork: UnitOfWork,
    private readonly idempotencyStore: IdempotencyStore,
    private readonly idempotency = new IdempotencyService(),
    private readonly clinicalPhotographyAvailable?: boolean,
  ) {}

  async execute(
    command: CreateAppointmentCommand,
  ): Promise<CreateAppointmentResponse> {
    if (!command.idempotencyKey?.trim())
      throw new CreateAppointmentError('IDEMPOTENCY_KEY_REQUIRED');
    return this.unitOfWork.execute(async (transaction) => {
      const idempotency = await this.idempotency.reserveOrReplay(
        {
          find: (tenantId, operation, key) =>
            this.idempotencyStore.find(tenantId, operation, key),
          reserve: (record) => transaction.idempotency.reserve(record),
          complete: (tenantId, operation, key, response) =>
            transaction.idempotency.complete(
              tenantId,
              operation,
              key,
              response,
            ),
          fail: (tenantId, operation, key) =>
            transaction.idempotency.fail(tenantId, operation, key),
        },
        command.tenantId,
        'CREATE_APPOINTMENT',
        command.idempotencyKey,
        {
          tenantId: command.tenantId,
          customerId: command.customerId,
          serviceId: command.serviceId,
          professionalId: command.professionalId,
          startsAt: command.startsAt,
          origin: command.origin,
        },
      );
      if (idempotency.replay)
        return idempotency.record.response as CreateAppointmentResponse;

      const customer = await this.customers.findById(
        command.tenantId,
        command.customerId,
      );
      const service = await this.services.findById(
        command.tenantId,
        command.serviceId,
      );
      if (!customer || !service)
        throw new CreateAppointmentError('APPOINTMENT_REFERENCES_NOT_FOUND');
      if (
        this.clinicalPhotographyAvailable === false &&
        (service.data.requiresPhotography ||
          service.data.technicalRequirements?.requiresPhotography === true)
      )
        throw new CreateAppointmentError('CLINICAL_MEDIA_UNAVAILABLE');
      const admissionEndsAt = new Date(
        Date.parse(command.startsAt) + service.data.durationMinutes * 60_000,
      ).toISOString();
      const admission = await this.eligibility.execute({
        tenantId: command.tenantId,
        customerId: command.customerId,
        serviceId: command.serviceId,
        professionalId: command.professionalId,
        startsAt: command.startsAt,
        endsAt: admissionEndsAt,
      });
      if (admission.status !== 'READY')
        throw new CreateAppointmentError(
          admission.reason ?? 'APPOINTMENT_NOT_ELIGIBLE',
        );
      const commercial = await this.commercialTerms.calculate({
        tenantId: command.tenantId,
        customerId: command.customerId,
        serviceId: command.serviceId,
        basePriceCents: service.data.basePriceCents,
        relationshipProfile: customer.data.relationshipProfile,
        commercialContext: {
          serviceId: service.id,
          category: service.data.category,
          minimumPriceCents: service.data.minimumPriceCents,
          allowsDiscount: service.data.allowsDiscount,
          depositMode: service.data.depositMode,
          depositFixedCents: service.data.depositFixedCents,
          depositPercentageBasisPoints:
            service.data.depositPercentageBasisPoints,
        },
      });
      if (
        commercial.status !== 'READY' ||
        commercial.basePriceCents === undefined ||
        commercial.discountCents === undefined ||
        commercial.finalPriceCents === undefined ||
        commercial.depositRequired === undefined
      )
        throw new CreateAppointmentError('COMMERCIAL_TERMS_BLOCKED');
      const depositConfiguredValue =
        service.data.depositMode === 'FIXED'
          ? service.data.depositFixedCents
          : service.data.depositMode === 'PERCENTAGE'
            ? service.data.depositPercentageBasisPoints
            : undefined;
      const appointment = Appointment.create(crypto.randomUUID(), {
        tenantId: command.tenantId,
        customerId: command.customerId,
        serviceId: command.serviceId,
        professionalId: command.professionalId,
        startsAt: command.startsAt,
        durationMinutes: service.data.durationMinutes,
        basePriceCents: commercial.basePriceCents,
        discountCents: commercial.discountCents,
        finalPriceCents: commercial.finalPriceCents,
        depositRequired: commercial.depositRequired,
        depositCents: commercial.depositCents,
        customerProfileAtCalculation: commercial.customerProfileAtCalculation,
        discountPolicyId: commercial.discountPolicyId,
        discountPolicySnapshot: commercial.discountPolicySnapshot,
        depositMode: service.data.depositMode,
        depositConfiguredValue,
        origin: command.origin as AppointmentOrigin,
      });
      await this.appointments.reserve(appointment, transaction.persistence);
      const response: CreateAppointmentResponse = {
        id: appointment.id,
        tenantId: command.tenantId,
        customerId: command.customerId,
        serviceId: command.serviceId,
        professionalId: command.professionalId,
        startsAt: appointment.data.interval.startsAt,
        endsAt: appointment.data.interval.endsAt,
        durationMinutes: appointment.data.interval.durationMinutes,
        basePriceCents: commercial.basePriceCents,
        discountCents: commercial.discountCents,
        finalPriceCents: commercial.finalPriceCents,
        depositRequired: commercial.depositRequired,
        depositCents: commercial.depositCents,
        customerProfileAtCalculation: commercial.customerProfileAtCalculation,
        discountPolicyId: commercial.discountPolicyId,
        discountPolicySnapshot: commercial.discountPolicySnapshot,
        depositMode: service.data.depositMode,
        depositConfiguredValue,
        origin: command.origin,
        status: appointment.data.status,
        createdAt: appointment.data.createdAt,
      };
      await transaction.audit.append({
        id: crypto.randomUUID(),
        tenantId: command.tenantId,
        actorId: command.actorId,
        action: 'appointment.created',
        resourceType: 'APPOINTMENT',
        resourceId: appointment.id,
        requestId: command.requestId,
        correlationId: command.correlationId,
        occurredAt: appointment.data.createdAt,
        metadata: {
          serviceId: command.serviceId,
          professionalId: command.professionalId,
          origin: command.origin,
          status: appointment.data.status,
        },
      });
      await transaction.outbox.append({
        id: crypto.randomUUID(),
        tenantId: command.tenantId,
        type: 'AppointmentCreated',
        aggregateType: 'APPOINTMENT',
        aggregateId: appointment.id,
        correlationId: command.correlationId,
        payload: {
          tenantId: command.tenantId,
          appointmentId: appointment.id,
          correlationId: command.correlationId,
        },
        status: 'PENDING',
        createdAt: appointment.data.createdAt,
      });
      await transaction.idempotency.complete(
        command.tenantId,
        'CREATE_APPOINTMENT',
        command.idempotencyKey,
        response,
      );
      return response;
    });
  }
}
