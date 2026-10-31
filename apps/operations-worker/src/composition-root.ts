import {
  CreateServiceUseCase,
  GetServiceUseCase,
  ListServicesUseCase,
  UpdateServiceUseCase,
  DeactivateServiceUseCase,
} from '@beauty/operations/modules/services/application/use-cases';
import { D1CustomersPersistence } from '@beauty/operations/modules/customers/infrastructure/d1-persistence';

import {
  GetCustomerUseCase,
  ListCustomersUseCase,
  UpdateCustomerUseCase,
} from '@beauty/operations/modules/customers/application/use-cases';
import { workerSecurity } from '@beauty/tenancy/adapters/worker-security';

import { ids, json, mappedError } from '@beauty/cloudflare-runtime';
import type {
  AssessmentEligibilityRequest,
  AssessmentEligibilityResponse,
  CalculateCommercialTermsRequest,
  CommercialTermsResponse,
  ConfirmAppointmentRequest,
  CheckInAppointmentRequest,
  GetSessionStartContextRequest,
  ApplySessionStartedRequest,
  ApplySessionCompletedRequest,
} from '@beauty/contracts';
import {
  CreateAppointment,
  type CreateAppointmentCommand,
} from '@beauty/operations/modules/appointments/application/create-appointment';
import { D1AppointmentRepository } from '@beauty/operations/modules/appointments/infrastructure/d1-appointment-repository';
import { D1AvailabilityRepository } from '@beauty/operations/modules/appointments/infrastructure/d1-availability-repository';
import { D1CustomerRepository } from '@beauty/operations/modules/customers/infrastructure/d1-customer-repository';
import { D1ProfessionalRepository } from '@beauty/operations/modules/professionals/infrastructure/d1-professional-repository';
import { D1ProfessionalServiceEligibility } from '@beauty/operations/modules/appointment-eligibility/infrastructure/d1-professional-service-eligibility';
import { CustomerRestrictionAdapter } from '@beauty/operations/modules/appointment-eligibility/infrastructure/customer-restriction';
import { ClinicalServiceBindingAssessmentEligibilityAdapter } from '@beauty/operations/modules/appointment-eligibility/infrastructure/clinical-service-binding-assessment-eligibility';
import { CheckAppointmentEligibility } from '@beauty/operations/modules/appointment-eligibility/application/check-appointment-eligibility';
import { D1LicenseRepository } from '@beauty/operations/modules/licensing/infrastructure/d1-license-repository';
import {
  D1LicenseEligibilityAdapter,
  D1PlanLimitAdapter,
} from '@beauty/operations/modules/licensing/infrastructure/appointment-admission-adapters';
import { D1ServiceRepository } from '@beauty/operations/modules/services/infrastructure/d1-service-repository';
import { D1TenantRepository } from '@beauty/operations/modules/tenants/infrastructure/d1-tenant-repository';
import { D1IdempotencyStore } from '@beauty/reliability/d1/d1-reliability-store';
import { D1UnitOfWork } from '@beauty/reliability/d1/d1-unit-of-work';
import { ApplyDepositTransition } from '@beauty/operations/modules/appointments/application/apply-deposit-transition';
import {
  CheckInAppointment,
  ConfirmAppointment,
} from '@beauty/operations/modules/appointments/application/appointment-lifecycle';
import {
  ApplySessionStarted,
  GetSessionStartContext,
} from '@beauty/operations/modules/appointments/application/session-start';
import { ApplyClinicalRestriction } from '@beauty/operations/modules/customers/application/apply-clinical-restriction';
import { D1ClinicalRestrictionRepository } from '@beauty/operations/modules/customers/infrastructure/d1-clinical-restriction-repository';
import { ApplySessionCompleted } from '@beauty/operations/modules/appointments/application/apply-session-completed';
import { D1CustomerHistoryRepository } from '@beauty/operations/modules/customer-history/infrastructure/d1-customer-history-repository';
import { ApplyReturnRecommended } from '@beauty/operations/modules/returns/application/apply-return-recommended';
import { ApplyPackageUnitConsumed } from '@beauty/operations/modules/customer-history/application/apply-package-unit-consumed';
import { ApplyPaymentReceived } from '@beauty/operations/modules/customer-history/application/apply-payment-received';
import { ApplyRefundIssued } from '@beauty/operations/modules/customer-history/application/apply-refund-issued';
import { RescheduleAppointment } from '@beauty/operations/modules/appointments/application/reschedule-appointment';
import { D1AppointmentChangeRepository } from '@beauty/operations/modules/appointments/infrastructure/d1-appointment-change-repository';
import {
  CancelAppointment,
  MarkAppointmentNoShow,
} from '@beauty/operations/modules/appointments/application/cancel-and-no-show';
import { D1AppointmentCancellationRepository } from '@beauty/operations/modules/appointments/infrastructure/d1-appointment-cancellation-repository';
import { D1OutboxDeliveryRepository } from '@beauty/reliability/d1/d1-outbox-delivery-repository';
import { DispatchOutboxBatch } from '@beauty/reliability/outbox/dispatch-outbox-batch';
import { BillingFinancialSettlementDelivery } from '@beauty/operations/infrastructure/outbox/billing-financial-settlement-delivery';
import { BillingAppointmentChangeDelivery } from '@beauty/operations/infrastructure/outbox/billing-appointment-change-delivery';
import { AssignPackageToAppointment } from '@beauty/operations/modules/appointments/application/assign-package-to-appointment';
import { D1PackageAssignmentRepository } from '@beauty/operations/modules/appointments/infrastructure/d1-package-assignment-repository';
import type { OperationsEnv } from './env.js';
export async function invokeClinicalAssessment(
  env: OperationsEnv,
  input: AssessmentEligibilityRequest,
): Promise<AssessmentEligibilityResponse> {
  const binding = env.CLINICAL_SERVICE as {
    checkAssessmentEligibility(
      input: AssessmentEligibilityRequest,
    ): Promise<AssessmentEligibilityResponse>;
  };
  return binding.checkAssessmentEligibility(input);
}
export async function invokeCommercialTerms(
  env: OperationsEnv,
  input: CalculateCommercialTermsRequest,
): Promise<CommercialTermsResponse> {
  const binding = env.BILLING_SERVICE as {
    calculateCommercialTerms(
      input: CalculateCommercialTermsRequest,
    ): Promise<CommercialTermsResponse>;
  };
  return binding.calculateCommercialTerms(input);
}
export async function invokeCreateAppointment(
  env: OperationsEnv,
  input: CreateAppointmentCommand,
) {
  const customerRepository = new D1CustomerRepository(env.D1_DATABASE);
  const serviceRepository = new D1ServiceRepository(env.D1_DATABASE);
  const licenseRepository = new D1LicenseRepository(env.D1_DATABASE);
  const eligibility = new CheckAppointmentEligibility(
    new D1TenantRepository(env.D1_DATABASE),
    customerRepository,
    serviceRepository,
    new D1ProfessionalRepository(env.D1_DATABASE),
    new D1AvailabilityRepository(env.D1_DATABASE),
    new D1ProfessionalServiceEligibility(env.D1_DATABASE),
    new D1LicenseEligibilityAdapter(licenseRepository),
    new ClinicalServiceBindingAssessmentEligibilityAdapter(
      env.CLINICAL_SERVICE as never,
    ),
    new CustomerRestrictionAdapter(
      customerRepository,
      new D1ClinicalRestrictionRepository(env.D1_DATABASE),
    ),
    new D1PlanLimitAdapter(licenseRepository),
  );
  return new CreateAppointment(
    eligibility,
    customerRepository,
    serviceRepository,
    new D1AppointmentRepository(env.D1_DATABASE),
    { calculate: (terms) => invokeCommercialTerms(env, terms) },
    new D1UnitOfWork(env.D1_DATABASE),
    new D1IdempotencyStore(env.D1_DATABASE),
    undefined,
    false, // Photography is suspended in the approved no-R2 release.
  ).execute(input);
}
function appointmentLifecycle(env: OperationsEnv) {
  return {
    repository: new D1AppointmentRepository(env.D1_DATABASE),
    uow: new D1UnitOfWork(env.D1_DATABASE),
    store: new D1IdempotencyStore(env.D1_DATABASE),
  };
}
export async function invokeConfirmAppointment(
  env: OperationsEnv,
  input: ConfirmAppointmentRequest,
) {
  const x = appointmentLifecycle(env);
  return new ConfirmAppointment(x.repository, x.uow, x.store).execute(input);
}
export async function invokeCheckInAppointment(
  env: OperationsEnv,
  input: CheckInAppointmentRequest,
) {
  const x = appointmentLifecycle(env);
  return new CheckInAppointment(x.repository, x.uow, x.store).execute(input);
}
export async function invokeSessionStartContext(
  env: OperationsEnv,
  input: GetSessionStartContextRequest,
) {
  return new GetSessionStartContext(
    new D1AppointmentRepository(env.D1_DATABASE),
    new D1ProfessionalRepository(env.D1_DATABASE),
    new D1TenantRepository(env.D1_DATABASE),
    new D1ServiceRepository(env.D1_DATABASE),
  ).execute(input);
}
export async function invokeServiceTechnicalContext(
  env: OperationsEnv,
  input: import('@beauty/contracts').GetServiceTechnicalContextRequest,
) {
  return (
    (await new D1ServiceRepository(env.D1_DATABASE).getTechnicalContext(
      input.tenantId,
      input.serviceId,
    )) ?? {
      tenantId: input.tenantId,
      serviceId: input.serviceId,
      active: false,
      hasTechnicalForm: false,
      technicalRequirements: {},
    }
  );
}
type Runtime = {
  get: GetCustomerUseCase;
  list: ListCustomersUseCase;
  update: UpdateCustomerUseCase;
};
let runtime: Runtime | undefined;
export function getRuntime(env: OperationsEnv): Runtime {
  if (!runtime) {
    const repository = new D1CustomerRepository(env.D1_DATABASE);
    runtime = {
      get: new GetCustomerUseCase(repository),
      list: new ListCustomersUseCase(repository),
      update: new UpdateCustomerUseCase(
        repository,
        new D1UnitOfWork(env.D1_DATABASE),
      ),
    };
  }
  return runtime;
}

export class OperationsComposition {
  async resourceProfessional(
    input: Record<string, unknown>,
    professionalId: string,
  ): Promise<string | null> {
    if (typeof input.tenantId !== 'string') return null;
    if (typeof input.appointmentId === 'string')
      return (
        (
          await new D1AppointmentRepository(this.env.D1_DATABASE).findById(
            input.tenantId,
            input.appointmentId,
          )
        )?.data.professionalId ?? null
      );
    if (typeof input.serviceId === 'string')
      return (await new D1ProfessionalServiceEligibility(
        this.env.D1_DATABASE,
      ).isEnabled(input.tenantId, professionalId, input.serviceId))
        ? professionalId
        : null;
    return typeof input.professionalId === 'string'
      ? input.professionalId
      : null;
  }
  services() {
    const repository = new D1ServiceRepository(this.env.D1_DATABASE);
    return {
      create: new CreateServiceUseCase(
        repository,
        false,
        new D1UnitOfWork(this.env.D1_DATABASE),
      ),
      get: new GetServiceUseCase(repository),
      list: new ListServicesUseCase(repository),
      update: new UpdateServiceUseCase(
        repository,
        false,
        new D1UnitOfWork(this.env.D1_DATABASE),
      ),
      deactivate: new DeactivateServiceUseCase(
        repository,
        new D1UnitOfWork(this.env.D1_DATABASE),
      ),
    };
  }

  listCustomerHistory(query: import('@beauty/contracts').CustomerHistoryQuery) {
    return new D1CustomerHistoryRepository(this.env.D1_DATABASE).list(query);
  }
  constructor(readonly env: OperationsEnv) {}
  async packageAssignmentRoute(request: Request): Promise<Response | null> {
    const m = new URL(request.url).pathname.match(
      /^\/tenants\/([^/]+)\/appointments\/([^/]+)\/package$/,
    );
    if (!m) return null;
    const { requestId, correlationId } = ids(request);
    const token = request.headers
      .get('authorization')
      ?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    const identity = token
      ? await workerSecurity(this.env).identity.authenticate(token)
      : null;
    if (!identity)
      return json(
        {
          status: 'error',
          code: 'AUTHENTICATION_REQUIRED',
          requestId,
          correlationId,
        },
        401,
      );
    const membership = await workerSecurity(
      this.env,
    ).membership.findActiveMembership(identity.actorId, m[1]);
    if (!membership)
      return json(
        {
          status: 'error',
          code: 'TENANT_ACCESS_DENIED',
          requestId,
          correlationId,
        },
        403,
      );
    if (
      request.method !== 'POST' ||
      !membership.permissions.includes('appointment.package.assign')
    )
      return json(
        {
          status: 'error',
          code: 'PERMISSION_DENIED',
          requestId,
          correlationId,
        },
        403,
      );
    if (
      membership.professionalId &&
      (await this.resourceProfessional(
        { tenantId: m[1], appointmentId: m[2] },
        membership.professionalId,
      )) !== membership.professionalId
    )
      return json(
        {
          status: 'error',
          code: 'PERMISSION_DENIED',
          requestId,
          correlationId,
        },
        403,
      );
    const key = request.headers.get('Idempotency-Key');
    if (!key?.trim())
      return json(
        {
          status: 'error',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          requestId,
          correlationId,
        },
        400,
      );
    try {
      const body = (await request.json()) as { customerPackageId?: string };
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).some((key) => key !== 'customerPackageId') ||
        typeof body.customerPackageId !== 'string' ||
        !body.customerPackageId.trim()
      )
        return json(
          {
            status: 'error',
            code: 'VALIDATION_ERROR',
            requestId,
            correlationId,
          },
          400,
        );
      return json({
        data: await this.assignPackageToAppointment({
          tenantId: m[1],
          appointmentId: m[2],
          customerPackageId: body.customerPackageId,
          actorId: identity.actorId,
          idempotencyKey: key,
          requestId,
          correlationId,
        }),
        requestId,
        correlationId,
      });
    } catch (error) {
      return mappedError(error, requestId, correlationId);
    }
  }
  applyDepositConfirmed(
    input: import('@beauty/contracts').ApplyDepositTransitionRequest,
  ) {
    return new ApplyDepositTransition(
      new D1AppointmentRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input, 'confirmed');
  }
  applyDepositExpired(
    input: import('@beauty/contracts').ApplyDepositTransitionRequest,
  ) {
    return new ApplyDepositTransition(
      new D1AppointmentRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input, 'expired');
  }
  getSessionStartContext(input: GetSessionStartContextRequest) {
    return new GetSessionStartContext(
      new D1AppointmentRepository(this.env.D1_DATABASE),
      new D1ProfessionalRepository(this.env.D1_DATABASE),
      new D1TenantRepository(this.env.D1_DATABASE),
      new D1ServiceRepository(this.env.D1_DATABASE),
    ).execute(input);
  }
  applySessionStarted(input: ApplySessionStartedRequest) {
    return new ApplySessionStarted(
      new D1AppointmentRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  applySessionCompleted(input: ApplySessionCompletedRequest) {
    return new ApplySessionCompleted(
      new D1AppointmentRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
      new D1CustomerRepository(this.env.D1_DATABASE),
      new D1CustomerHistoryRepository(this.env.D1_DATABASE),
    ).execute(input);
  }
  applyClinicalRestriction(
    input: import('@beauty/contracts').ClinicalRestrictionEvent,
  ) {
    return new ApplyClinicalRestriction(
      new D1CustomersPersistence(),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input, false);
  }
  applyReturnRecommended(
    input: import('@beauty/contracts').ApplyReturnRecommendedRequest,
  ) {
    return new ApplyReturnRecommended(
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
      new D1CustomerHistoryRepository(this.env.D1_DATABASE),
    ).execute(input);
  }
  assignPackageToAppointment(
    input: import('@beauty/contracts').AssignPackageToAppointmentRequest,
  ) {
    return new AssignPackageToAppointment(
      new D1AppointmentRepository(this.env.D1_DATABASE),
      new D1PackageAssignmentRepository(this.env.D1_DATABASE),
      this.env.BILLING_SERVICE as never,
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  applyPackageUnitConsumed(
    input: import('@beauty/contracts').PackageUnitConsumedEvent,
  ) {
    return new ApplyPackageUnitConsumed(
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
      new D1CustomerHistoryRepository(this.env.D1_DATABASE),
    ).execute(input);
  }
  applyPaymentReceived(
    input: import('@beauty/contracts').PaymentReceivedEvent,
  ) {
    return new ApplyPaymentReceived(
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
      new D1CustomerHistoryRepository(this.env.D1_DATABASE),
    ).execute(input);
  }
  applyRefundIssued(input: import('@beauty/contracts').RefundIssuedEvent) {
    return new ApplyRefundIssued(
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
      new D1CustomerHistoryRepository(this.env.D1_DATABASE),
    ).execute(input);
  }
  rescheduleAppointment(
    input: import('@beauty/contracts').RescheduleAppointmentRequest,
  ) {
    return new RescheduleAppointment(
      new D1AppointmentRepository(this.env.D1_DATABASE),
      new D1AppointmentChangeRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  cancelAppointment(
    input: import('@beauty/contracts').CancelAppointmentRequest,
  ) {
    return new CancelAppointment(
      new D1AppointmentRepository(this.env.D1_DATABASE),
      new D1AppointmentCancellationRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
      this.env.BILLING_SERVICE as never,
    ).execute(input);
  }
  markAppointmentNoShow(input: import('@beauty/contracts').MarkNoShowRequest) {
    return new MarkAppointmentNoShow(
      new D1AppointmentRepository(this.env.D1_DATABASE),
      new D1AppointmentCancellationRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
      this.env.BILLING_SERVICE as never,
    ).execute(input);
  }
  async dispatchOutboxBatch(input: {
    workerId: string;
    batchSize: number;
    leaseSeconds: number;
    now?: string;
  }) {
    return new DispatchOutboxBatch(
      new D1OutboxDeliveryRepository(this.env.D1_DATABASE, [
        'FinancialSettlementRequested',
        'AppointmentCanceled',
        'AppointmentNoShowRecorded',
      ]),
      {
        deliver: (e) =>
          (e.type === 'FinancialSettlementRequested'
            ? new BillingFinancialSettlementDelivery(
                this.env.BILLING_SERVICE as never,
              )
            : new BillingAppointmentChangeDelivery(
                this.env.BILLING_SERVICE as never,
              )
          ).deliver(e),
      },
    ).execute(input);
  }
  resolveClinicalRestriction(
    input: import('@beauty/contracts').ClinicalRestrictionEvent,
  ) {
    return new ApplyClinicalRestriction(
      new D1CustomersPersistence(),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input, true);
  }
  getServiceTechnicalContext(
    input: import('@beauty/contracts').GetServiceTechnicalContextRequest,
  ) {
    return invokeServiceTechnicalContext(this.env, input);
  }
}
