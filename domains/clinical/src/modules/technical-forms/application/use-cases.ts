import { assertProfessionalAuthorization } from '@beauty/kernel/application/actor-authorization';
import type {
  CreateTechnicalFormRequest,
  PublishTechnicalFormRequest,
  RecordSessionPowerRequest,
  RecordSessionTechnicalValuesRequest,
  SessionPowerResponse,
  SessionTechnicalValuesResponse,
  TechnicalFormResponse,
} from '@beauty/contracts';
import { IdempotencyService } from '@beauty/reliability/idempotency/idempotency.service';
import type { IdempotencyStore } from '@beauty/reliability/idempotency/idempotency-store';
import type { UnitOfWork } from '@beauty/reliability/unit-of-work/unit-of-work';
import { TechnicalFormDefinition } from '../domain/technical-form-definition.js';
import { validateTechnicalValue } from '../domain/technical-value.js';
import type { SessionRepository } from '../../sessions/ports/session-repository.js';
import type {
  TechnicalFormRepository,
  SessionTechnicalRepository,
} from '../ports/technical-form-repository.js';
import type { ServiceTechnicalContextPort } from '../ports/service-technical-context.port.js';
function txStore(source: IdempotencyStore, tx: any): IdempotencyStore {
  return {
    find: (t, o, k) => source.find(t, o, k),
    reserve: (r) => tx.idempotency.reserve(r),
    complete: (t, o, k, r) => tx.idempotency.complete(t, o, k, r),
    fail: (t, o, k) => tx.idempotency.fail(t, o, k),
  };
}
const formView = (x: TechnicalFormDefinition): TechnicalFormResponse => ({
  id: x.id,
  tenantId: x.tenantId,
  serviceId: x.serviceId,
  version: x.version,
  status: x.status,
  fields: [...x.fields],
  createdAt: x.createdAt,
  createdBy: x.createdBy,
});
export class CreateTechnicalForm {
  constructor(
    private readonly forms: TechnicalFormRepository,
    private readonly context: ServiceTechnicalContextPort,
    private readonly uow: UnitOfWork,
    private readonly store: IdempotencyStore,
    private readonly idem = new IdempotencyService(),
  ) {}
  async execute(i: CreateTechnicalFormRequest) {
    const c = await this.context.getServiceTechnicalContext({
      tenantId: i.tenantId,
      serviceId: i.serviceId,
    });
    if (!c.active) throw new Error('SERVICE_NOT_FOUND');
    if (!c.hasTechnicalForm) throw new Error('TECHNICAL_FORM_NOT_ENABLED');
    const version = await this.forms.nextVersion(i.tenantId, i.serviceId);
    const form = new TechnicalFormDefinition(
      crypto.randomUUID(),
      i.tenantId,
      i.serviceId,
      version,
      'DRAFT',
      i.fields,
      new Date().toISOString(),
      i.actorId,
    );
    return this.uow.execute(async (tx) => {
      const r = await this.idem.reserveOrReplay(
        txStore(this.store, tx),
        i.tenantId,
        'CREATE_TECHNICAL_FORM',
        i.idempotencyKey,
        { tenantId: i.tenantId, serviceId: i.serviceId },
      );
      if (r.replay) return r.record.response as TechnicalFormResponse;
      this.forms.create(form, tx.persistence);
      const response = formView(form);
      await tx.audit.append({
        id: crypto.randomUUID(),
        tenantId: i.tenantId,
        actorId: i.actorId,
        action: 'technical_form.created',
        resourceType: 'TECHNICAL_FORM',
        resourceId: form.id,
        requestId: i.requestId,
        correlationId: i.correlationId,
        occurredAt: form.createdAt,
        metadata: {
          serviceId: i.serviceId,
          version: form.version,
          fieldCount: form.fields.length,
        },
      });
      await tx.idempotency.complete(
        i.tenantId,
        'CREATE_TECHNICAL_FORM',
        i.idempotencyKey,
        response,
      );
      return response;
    });
  }
}
export class PublishTechnicalForm {
  constructor(
    private readonly forms: TechnicalFormRepository,
    private readonly uow: UnitOfWork,
    private readonly store: IdempotencyStore,
    private readonly idem = new IdempotencyService(),
  ) {}
  async execute(i: PublishTechnicalFormRequest) {
    const form = await this.forms.findById(i.tenantId, i.formId);
    if (!form) throw new Error('TECHNICAL_FORM_NOT_FOUND');
    if (form.status !== 'DRAFT') throw new Error('TECHNICAL_FORM_IMMUTABLE');
    return this.uow.execute(async (tx) => {
      const r = await this.idem.reserveOrReplay(
        txStore(this.store, tx),
        i.tenantId,
        'PUBLISH_TECHNICAL_FORM',
        i.idempotencyKey,
        { tenantId: i.tenantId, formId: i.formId },
      );
      if (r.replay) return r.record.response as TechnicalFormResponse;
      this.forms.publish(
        i.tenantId,
        i.formId,
        new Date().toISOString(),
        tx.persistence,
      );
      const response = { ...formView(form), status: 'ACTIVE' as const };
      await tx.audit.append({
        id: crypto.randomUUID(),
        tenantId: i.tenantId,
        actorId: i.actorId,
        action: 'technical_form.published',
        resourceType: 'TECHNICAL_FORM',
        resourceId: i.formId,
        requestId: i.requestId,
        correlationId: i.correlationId,
        occurredAt: new Date().toISOString(),
        metadata: { serviceId: form.serviceId, version: form.version },
      });
      await tx.idempotency.complete(
        i.tenantId,
        'PUBLISH_TECHNICAL_FORM',
        i.idempotencyKey,
        response,
      );
      return response;
    });
  }
}
export class RecordSessionTechnicalValues {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly forms: TechnicalFormRepository,
    private readonly technical: SessionTechnicalRepository,
    private readonly uow: UnitOfWork,
    private readonly store: IdempotencyStore,
    private readonly idem = new IdempotencyService(),
  ) {}
  async execute(
    i: RecordSessionTechnicalValuesRequest,
  ): Promise<SessionTechnicalValuesResponse> {
    const session = await this.sessions.findById(i.tenantId, i.sessionId);
    if (!session) throw new Error('SESSION_NOT_FOUND');
    if (session.data.status !== 'IN_PROGRESS')
      throw new Error('TECHNICAL_EDIT_NOT_ALLOWED');
    assertProfessionalAuthorization(i, session.data.professionalId);
    return this.uow.execute(async (tx) => {
      const r = await this.idem.reserveOrReplay(
        txStore(this.store, tx),
        i.tenantId,
        'RECORD_SESSION_TECHNICAL_VALUES',
        i.idempotencyKey,
        { tenantId: i.tenantId, sessionId: i.sessionId },
      );
      if (r.replay) return r.record.response as SessionTechnicalValuesResponse;
      let snap = await this.technical.findSnapshot(i.tenantId, i.sessionId);
      if (!snap) {
        const form = await this.forms.findActive(
          i.tenantId,
          session.data.serviceId,
        );
        if (!form) throw new Error('TECHNICAL_FORM_NOT_CONFIGURED');
        snap = {
          id: crypto.randomUUID(),
          serviceId: form.serviceId,
          formVersion: form.version,
          fields: [...form.fields],
        };
        this.technical.createSnapshot(
          {
            id: snap.id,
            tenantId: i.tenantId,
            sessionId: i.sessionId,
            serviceId: form.serviceId,
            formId: form.id,
            formVersion: form.version,
            fields: snap.fields,
            createdAt: new Date().toISOString(),
          },
          tx.persistence,
        );
      }
      const byId = new Map(snap.fields.map((f) => [f.key, f]));
      const result: SessionTechnicalValuesResponse = {
        tenantId: i.tenantId,
        sessionId: i.sessionId,
        snapshotId: snap.id,
        values: [],
      };
      for (const item of i.values) {
        const field = byId.get(item.fieldId);
        if (!field) throw new Error('TECHNICAL_FIELD_NOT_FOUND');
        validateTechnicalValue(field, item.value, item.unit);
        this.technical.upsertValue(
          {
            id: crypto.randomUUID(),
            tenantId: i.tenantId,
            sessionId: i.sessionId,
            fieldId: item.fieldId,
            field,
            value: item.value,
            unit: item.unit,
            recordedAt: new Date().toISOString(),
            recordedBy: i.actorId,
          },
          tx.persistence,
        );
        result.values.push({
          fieldId: item.fieldId,
          valueType: field.type,
          value: item.value,
          unit: item.unit ?? field.unit,
        });
      }
      await tx.audit.append({
        id: crypto.randomUUID(),
        tenantId: i.tenantId,
        actorId: i.actorId,
        action: 'session.technical_values_recorded',
        resourceType: 'SESSION',
        resourceId: i.sessionId,
        requestId: i.requestId,
        correlationId: i.correlationId,
        occurredAt: new Date().toISOString(),
        metadata: {
          fieldKeys: result.values.map((x) => x.fieldId),
          fieldCount: result.values.length,
        },
      });
      await tx.idempotency.complete(
        i.tenantId,
        'RECORD_SESSION_TECHNICAL_VALUES',
        i.idempotencyKey,
        result,
      );
      return result;
    });
  }
}
export class RecordSessionPower {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly technical: SessionTechnicalRepository,
    private readonly uow: UnitOfWork,
    private readonly store: IdempotencyStore,
    private readonly idem = new IdempotencyService(),
  ) {}
  async execute(i: RecordSessionPowerRequest): Promise<SessionPowerResponse> {
    const session = await this.sessions.findById(i.tenantId, i.sessionId);
    if (!session) throw new Error('SESSION_NOT_FOUND');
    if (session.data.status !== 'IN_PROGRESS')
      throw new Error('TECHNICAL_EDIT_NOT_ALLOWED');
    assertProfessionalAuthorization(i, session.data.professionalId);
    const value = String(i.value);
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || !i.unit?.trim())
      throw new Error('TECHNICAL_VALUE_INVALID');
    return this.uow.execute(async (tx) => {
      const r = await this.idem.reserveOrReplay(
        txStore(this.store, tx),
        i.tenantId,
        'RECORD_SESSION_POWER',
        i.idempotencyKey,
        { tenantId: i.tenantId, sessionId: i.sessionId },
      );
      if (r.replay) return r.record.response as SessionPowerResponse;
      const now = new Date().toISOString();
      const response = {
        id: crypto.randomUUID(),
        tenantId: i.tenantId,
        sessionId: i.sessionId,
        value,
        unit: i.unit,
        recordedAt: now,
        recordedBy: i.actorId,
      };
      this.technical.appendPower(response, tx.persistence);
      await tx.audit.append({
        id: crypto.randomUUID(),
        tenantId: i.tenantId,
        actorId: i.actorId,
        action: 'session.power_recorded',
        resourceType: 'SESSION',
        resourceId: i.sessionId,
        requestId: i.requestId,
        correlationId: i.correlationId,
        occurredAt: now,
        metadata: { unit: i.unit },
      });
      await tx.idempotency.complete(
        i.tenantId,
        'RECORD_SESSION_POWER',
        i.idempotencyKey,
        response,
      );
      return response;
    });
  }
}
