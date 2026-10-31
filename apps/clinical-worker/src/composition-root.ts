import { observeMediaCapacity } from '@beauty/reliability/media/observe-media-capacity';
import type {
  AssessmentEligibilityRequest,
  AssessmentEligibilityResponse,
  GetSessionStartContextRequest,
  SessionResponse,
  StartSessionRequest,
  CreateTechnicalFormRequest,
  PublishTechnicalFormRequest,
  RecordSessionTechnicalValuesRequest,
  RecordSessionPowerRequest,
} from '@beauty/contracts';
import { inheritActorAuthorization } from '@beauty/kernel/application/actor-authorization';
import { D1AssessmentRepository } from '@beauty/clinical/modules/assessments/infrastructure/d1-assessment-repository';
import { CheckAssessmentEligibility } from '@beauty/clinical/modules/assessments/application/check-assessment-eligibility';
import { D1SessionRepository } from '@beauty/clinical/modules/sessions/infrastructure/d1-session-repository';
import { StartSession } from '@beauty/clinical/modules/sessions/application/start-session';
import { D1IdempotencyStore } from '@beauty/reliability/d1/d1-reliability-store';
import { D1UnitOfWork } from '@beauty/reliability/d1/d1-unit-of-work';
import type { SessionStartContextPort } from '@beauty/clinical/modules/sessions/ports/session-start-context.port';
import { D1OutboxDeliveryRepository } from '@beauty/reliability/d1/d1-outbox-delivery-repository';
import { DispatchOutboxBatch } from '@beauty/reliability/outbox/dispatch-outbox-batch';
import { OperationsSessionDelivery } from '@beauty/clinical/modules/sessions/infrastructure/operations-session-delivery';
import { OperationsReturnDelivery } from '@beauty/clinical/modules/sessions/infrastructure/operations-return-delivery';
import { BillingPackageDelivery } from '@beauty/clinical/modules/sessions/infrastructure/billing-package-delivery';
import { D1TechnicalFormRepository } from '@beauty/clinical/modules/technical-forms/infrastructure/d1-technical-form-repository';
import {
  CreateTechnicalForm,
  PublishTechnicalForm,
  RecordSessionTechnicalValues,
} from '@beauty/clinical/modules/technical-forms/application/use-cases';
import { D1EquipmentRepository } from '@beauty/clinical/modules/equipment/infrastructure/d1-equipment-repository';
import {
  CreateEquipment,
  ConfigureEquipmentServices,
  ChangeEquipmentStatus,
  RecordSessionEquipmentUsage,
  GetPreviousSessionContext,
  ConfigureVariationPolicy,
  JustifyVariationAlert,
  RecordSessionPowerWithVariation,
} from '@beauty/clinical/modules/equipment/application/use-cases';
import { D1IntercurrenceRepository } from '@beauty/clinical/modules/intercurrences/infrastructure/d1-intercurrence-repository';
import {
  ReportIntercurrence,
  ResolveIntercurrence,
} from '@beauty/clinical/modules/intercurrences/application/use-cases';
import { OperationsRestrictionDelivery } from '@beauty/clinical/modules/intercurrences/infrastructure/operations-restriction-delivery';
import { D1PhotoAttachmentRepository } from '@beauty/clinical/modules/media/infrastructure/d1-photo-attachment-repository';
import { clinicalMediaStorage } from '@beauty/clinical/modules/media/infrastructure/r2-clinical-media-storage';
import {
  EvaluateSessionPhotoRequirement,
  GetClinicalPhoto,
  ListSessionPhotos,
  ReconcilePhotoAttachment,
  UploadSessionPhoto,
} from '@beauty/clinical/modules/media/application/use-cases';
import {
  CheckSessionCompletionEligibility,
  CompleteSession,
} from '@beauty/clinical/modules/sessions/application/complete-session';
import { D1SessionCompletionReadModel } from '@beauty/clinical/modules/sessions/infrastructure/d1-session-completion-read-model';
import { RecommendReturn } from '@beauty/clinical/modules/sessions/application/recommend-return';
import type { ClinicalEnv } from './env.js';

export class ClinicalComposition {
  async resourceProfessional(
    input: Record<string, unknown>,
    professionalId: string,
  ): Promise<string | null> {
    if (typeof input.tenantId !== 'string') return null;
    if (typeof input.photoId === 'string') {
      const photo = await new D1PhotoAttachmentRepository(
        this.env.D1_DATABASE,
      ).findById(input.tenantId, input.photoId);
      return photo
        ? ((
            await new D1SessionRepository(this.env.D1_DATABASE).findById(
              input.tenantId,
              photo.data.sessionId,
            )
          )?.data.professionalId ?? null)
        : null;
    }
    if (typeof input.sessionId === 'string')
      return (
        (
          await new D1SessionRepository(this.env.D1_DATABASE).findById(
            input.tenantId,
            input.sessionId,
          )
        )?.data.professionalId ?? null
      );
    if (typeof input.appointmentId === 'string') {
      const context = await (
        this.env.OPERATIONS_SERVICE as SessionStartContextPort
      ).getSessionStartContext(
        input as unknown as GetSessionStartContextRequest,
      );
      return context.professionalId ?? null;
    }
    if (typeof input.formId === 'string') {
      const form = await new D1TechnicalFormRepository(
        this.env.D1_DATABASE,
      ).findById(input.tenantId, input.formId);
      return form
        ? this.resourceProfessional(
            { ...input, formId: undefined, serviceId: form.serviceId },
            professionalId,
          )
        : null;
    }
    if (typeof input.serviceId === 'string') {
      const service = this.env.OPERATIONS_SERVICE as {
        getServiceTechnicalContext(
          value: Record<string, unknown>,
        ): Promise<unknown>;
      };
      return (await service.getServiceTechnicalContext({
        ...input,
        professionalId,
      }))
        ? professionalId
        : null;
    }
    if (input.professionalId === professionalId) return professionalId;
    return null;
  }
  getEquipment(tenantId: string, id: string) {
    return new D1EquipmentRepository(this.env.D1_DATABASE).findById(
      tenantId,
      id,
    );
  }
  getActiveTechnicalForm(tenantId: string, serviceId: string) {
    return new D1TechnicalFormRepository(this.env.D1_DATABASE).findActive(
      tenantId,
      serviceId,
    );
  }
  constructor(readonly env: ClinicalEnv) {}
  async checkAssessmentEligibility(
    input: AssessmentEligibilityRequest,
  ): Promise<AssessmentEligibilityResponse> {
    if (
      !input.tenantId ||
      !input.customerId ||
      !input.serviceId ||
      !input.professionalId
    )
      return { eligible: false };
    return new CheckAssessmentEligibility(
      new D1AssessmentRepository(this.env.D1_DATABASE),
    ).execute({ ...input, requiresAssessment: true });
  }
  async startSession(input: StartSessionRequest): Promise<SessionResponse> {
    return new StartSession(
      new D1SessionRepository(this.env.D1_DATABASE),
      this.env.OPERATIONS_SERVICE as SessionStartContextPort,
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async getSessionStartContext(input: GetSessionStartContextRequest) {
    return (
      this.env.OPERATIONS_SERVICE as SessionStartContextPort
    ).getSessionStartContext(input);
  }
  async dispatchOutboxBatch(input: {
    workerId: string;
    batchSize: number;
    leaseSeconds: number;
    now?: string;
  }) {
    return new DispatchOutboxBatch(
      new D1OutboxDeliveryRepository(this.env.D1_DATABASE, [
        'SessionStarted',
        'SessionCompleted',
        'ReturnRecommended',
        'PackageConsumptionRequested',
        'ClinicalRestrictionActivated',
        'ClinicalRestrictionResolved',
      ]),
      {
        deliver: async (event: any) =>
          event.type === 'SessionStarted' || event.type === 'SessionCompleted'
            ? new OperationsSessionDelivery(
                this.env.OPERATIONS_SERVICE as never,
              ).deliver(event)
            : event.type === 'ReturnRecommended'
              ? new OperationsReturnDelivery(
                  this.env.OPERATIONS_SERVICE as never,
                ).deliver(event)
              : event.type === 'PackageConsumptionRequested'
                ? new BillingPackageDelivery(
                    this.env.BILLING_SERVICE as never,
                  ).deliver(event)
                : new OperationsRestrictionDelivery(
                    this.env.OPERATIONS_SERVICE,
                  ).deliver(event),
      },
    ).execute(input);
  }
  async createTechnicalForm(input: CreateTechnicalFormRequest) {
    return new CreateTechnicalForm(
      new D1TechnicalFormRepository(this.env.D1_DATABASE),
      this.env.OPERATIONS_SERVICE as any,
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async publishTechnicalForm(input: PublishTechnicalFormRequest) {
    return new PublishTechnicalForm(
      new D1TechnicalFormRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async recordSessionTechnicalValues(
    input: RecordSessionTechnicalValuesRequest,
  ) {
    const r = new D1TechnicalFormRepository(this.env.D1_DATABASE);
    return new RecordSessionTechnicalValues(
      new D1SessionRepository(this.env.D1_DATABASE),
      r,
      r,
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async recordSessionPower(input: RecordSessionPowerRequest) {
    const r = new D1TechnicalFormRepository(this.env.D1_DATABASE);
    return new RecordSessionPowerWithVariation(
      new D1SessionRepository(this.env.D1_DATABASE),
      r,
      new D1EquipmentRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async createEquipment(
    input: import('@beauty/contracts').CreateEquipmentRequest,
  ) {
    return new CreateEquipment(
      new D1EquipmentRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async configureEquipmentServices(
    input: import('@beauty/contracts').ConfigureEquipmentServicesRequest,
  ) {
    return new ConfigureEquipmentServices(
      new D1EquipmentRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async changeEquipmentStatus(input: {
    tenantId: string;
    equipmentId: string;
    status: string;
    actorId: string;
    requestId: string;
    correlationId: string;
  }) {
    return new ChangeEquipmentStatus(
      new D1EquipmentRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
    ).execute(input);
  }
  async recordSessionEquipmentUsage(
    input: import('@beauty/contracts').RecordSessionEquipmentUsageRequest,
  ) {
    const r = new D1EquipmentRepository(this.env.D1_DATABASE);
    return new RecordSessionEquipmentUsage(
      new D1SessionRepository(this.env.D1_DATABASE),
      r,
      r,
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async getPreviousSessionContext(input: {
    tenantId: string;
    sessionId: string;
    actorId: string;
  }) {
    return new GetPreviousSessionContext(
      new D1SessionRepository(this.env.D1_DATABASE),
      new D1EquipmentRepository(this.env.D1_DATABASE),
    ).execute(input);
  }
  async configureVariationPolicy(
    input: import('@beauty/contracts').ConfigureVariationPolicyRequest,
  ) {
    return new ConfigureVariationPolicy(
      new D1EquipmentRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async justifyVariationAlert(
    input: import('@beauty/contracts').JustifyVariationAlertRequest,
  ) {
    return new JustifyVariationAlert(
      new D1EquipmentRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async reportIntercurrence(
    input: import('@beauty/contracts').ReportIntercurrenceRequest,
  ) {
    return new ReportIntercurrence(
      new D1SessionRepository(this.env.D1_DATABASE),
      new D1IntercurrenceRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async resolveIntercurrence(
    input: import('@beauty/contracts').ResolveIntercurrenceRequest,
  ) {
    return new ResolveIntercurrence(
      new D1SessionRepository(this.env.D1_DATABASE),
      new D1IntercurrenceRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async uploadSessionPhoto(
    input: import('@beauty/contracts').UploadClinicalPhotoRequest,
  ) {
    if (this.env.MAX_CLINICAL_PHOTO_BYTES !== '5242880')
      throw new Error('INVALID_AUTHENTICATION_CONFIGURATION');
    const result = await new UploadSessionPhoto(
      new D1SessionRepository(this.env.D1_DATABASE),
      new D1IntercurrenceRepository(this.env.D1_DATABASE),
      new D1PhotoAttachmentRepository(this.env.D1_DATABASE),
      clinicalMediaStorage(this.env.SESSION_MEDIA),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(
      inheritActorAuthorization(input, {
        ...input,
        maxBytes: Number(this.env.MAX_CLINICAL_PHOTO_BYTES),
      }),
    );
    await observeMediaCapacity(
      this.env.D1_DATABASE,
      this.env.OBSERVE_ENABLED === 'true',
    );
    return result;
  }
  async listSessionPhotos(input: {
    tenantId: string;
    sessionId: string;
    actorId: string;
  }) {
    return new ListSessionPhotos(
      new D1SessionRepository(this.env.D1_DATABASE),
      new D1PhotoAttachmentRepository(this.env.D1_DATABASE),
    ).execute(input);
  }
  async getClinicalPhoto(input: {
    tenantId: string;
    sessionId: string;
    photoId: string;
    actorId: string;
  }) {
    return new GetClinicalPhoto(
      new D1SessionRepository(this.env.D1_DATABASE),
      new D1PhotoAttachmentRepository(this.env.D1_DATABASE),
      clinicalMediaStorage(this.env.SESSION_MEDIA),
    ).execute(input);
  }
  async reconcilePhotoAttachment(input: {
    tenantId: string;
    photoId: string;
    requestId: string;
    correlationId: string;
    actorId: string;
  }) {
    return new ReconcilePhotoAttachment(
      new D1PhotoAttachmentRepository(this.env.D1_DATABASE),
      clinicalMediaStorage(this.env.SESSION_MEDIA),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1SessionRepository(this.env.D1_DATABASE),
    ).execute(input);
  }
  async evaluateSessionPhotoRequirement(input: {
    tenantId: string;
    sessionId: string;
    actorId: string;
  }) {
    return new EvaluateSessionPhotoRequirement(
      new D1SessionRepository(this.env.D1_DATABASE),
      new D1PhotoAttachmentRepository(this.env.D1_DATABASE),
      {
        getSessionPhotoRequirement: (t, s) =>
          new D1PhotoAttachmentRepository(
            this.env.D1_DATABASE,
          ).requiresPhotography(t, s),
      },
    ).execute(input);
  }
  async checkSessionCompletionEligibility(input: {
    tenantId: string;
    sessionId: string;
    actorId: string;
  }) {
    return new CheckSessionCompletionEligibility(
      new D1SessionRepository(this.env.D1_DATABASE),
      new D1SessionCompletionReadModel(this.env.D1_DATABASE),
    ).execute(input);
  }
  async completeSession(
    input: import('@beauty/contracts').CompleteSessionRequest,
  ) {
    return new CompleteSession(
      new D1SessionRepository(this.env.D1_DATABASE),
      new D1SessionCompletionReadModel(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async recommendReturn(
    input: import('@beauty/contracts').RecommendReturnRequest,
  ) {
    return new RecommendReturn(
      new D1SessionRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
}
