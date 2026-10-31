import { ImageWriteNotStartedError } from '@beauty/reliability/media/image-write-error';
import { assertProfessionalAuthorization } from '@beauty/kernel/application/actor-authorization';
import type {
  ClinicalPhotoMetadata,
  PhotoRequirementResponse,
  UploadClinicalPhotoRequest,
} from '@beauty/contracts';
import type { UnitOfWork } from '@beauty/reliability/unit-of-work/unit-of-work';

import { IdempotencyService } from '@beauty/reliability/idempotency/idempotency.service';
import type { IdempotencyStore } from '@beauty/reliability/idempotency/idempotency-store';
import type { SessionRepository } from '../../sessions/ports/session-repository.js';
import type { IntercurrenceRepository } from '../../intercurrences/ports/intercurrence-repository.js';
import { PhotoAttachment } from '../domain/photo-attachment.js';
import { photoObjectKey, validatePhotoInput } from '../domain/photo-policy.js';
import type { PhotoAttachmentRepository } from '../ports/photo-attachment-repository.js';
import type { ClinicalMediaStoragePort } from '../ports/clinical-media-storage.port.js';
const txStore = (
  source: IdempotencyStore,
  transaction: { idempotency: IdempotencyStore },
): IdempotencyStore => ({
  find: (t, o, k) => source.find(t, o, k),
  reserve: (r) => transaction.idempotency.reserve(r),
  complete: (t, o, k, r) => transaction.idempotency.complete(t, o, k, r),
  fail: (t, o, k) => transaction.idempotency.fail(t, o, k),
});
export class UploadSessionPhoto {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly intercurrences: IntercurrenceRepository,
    private readonly photos: PhotoAttachmentRepository,
    private readonly storage: ClinicalMediaStoragePort,
    private readonly uow: UnitOfWork,
    private readonly idempotency: IdempotencyStore,
  ) {}
  async execute(i: UploadClinicalPhotoRequest): Promise<ClinicalPhotoMetadata> {
    if (this.storage.available === false)
      throw new Error('CLINICAL_MEDIA_UNAVAILABLE');
    const session = await this.sessions.findById(i.tenantId, i.sessionId);
    if (!session) throw new Error('SESSION_NOT_FOUND');
    assertProfessionalAuthorization(i, session.data.professionalId);
    validatePhotoInput(i.contentType, i.contentLength, i.maxBytes);
    if (i.purpose === 'INTERCURRENCE') {
      const x = await this.intercurrences.findById(
        i.tenantId,
        i.intercurrenceId ?? '',
      );
      if (!x || x.sessionId !== i.sessionId)
        throw new Error('INTERCURRENCE_NOT_FOUND');
    }
    /* Replay is validated by request hash below, including after session evolution. */
    const existing = await this.idempotency.find(
      i.tenantId,
      'UPLOAD_SESSION_PHOTO',
      i.idempotencyKey,
    );
    if (existing) {
      const replay = await new IdempotencyService().reserveOrReplay(
        this.idempotency,
        i.tenantId,
        'UPLOAD_SESSION_PHOTO',
        i.idempotencyKey,
        {
          tenantId: i.tenantId,
          sessionId: i.sessionId,
          intercurrenceId: i.intercurrenceId,
          purpose: i.purpose,
          contentType: i.contentType,
          contentLength: i.contentLength,
          clientChecksum: i.clientChecksum,
        },
      );
      await i.body.cancel().catch(() => undefined);
      return replay.record.response as ClinicalPhotoMetadata;
    }
    if (session.data.status !== 'IN_PROGRESS')
      throw new Error('PHOTO_UPLOAD_NOT_ALLOWED');
    const pending = await this.uow.execute(async (t) => {
      const r = await new IdempotencyService().reserveOrReplay(
        txStore(this.idempotency, t),
        i.tenantId,
        'UPLOAD_SESSION_PHOTO',
        i.idempotencyKey,
        {
          tenantId: i.tenantId,
          sessionId: i.sessionId,
          intercurrenceId: i.intercurrenceId,
          purpose: i.purpose,
          contentType: i.contentType,
          contentLength: i.contentLength,
          clientChecksum: i.clientChecksum,
        },
      );
      if (r.replay)
        return { replay: r.record.response as ClinicalPhotoMetadata };
      const id = crypto.randomUUID();
      const photo = PhotoAttachment.pending(id, {
        idempotencyKey: i.idempotencyKey,
        tenantId: i.tenantId,
        sessionId: i.sessionId,
        intercurrenceId: i.intercurrenceId,
        purpose: i.purpose,
        objectKey: photoObjectKey(i.tenantId, i.sessionId, id),
        contentType: i.contentType,
        sizeBytes: i.contentLength ?? 0,
        checksum: i.clientChecksum,
        uploadedBy: i.actorId,
        capturedAt: i.capturedAt,
      });
      this.photos.createPending(photo, t.persistence);
      return {
        pending: {
          photo,
          metadata: {
            id,
            tenantId: i.tenantId,
            sessionId: i.sessionId,
            intercurrenceId: i.intercurrenceId,
            purpose: i.purpose,
            contentType: i.contentType,
            sizeBytes: i.contentLength ?? 0,
            capturedAt: i.capturedAt,
            status: 'PENDING_UPLOAD',
          } satisfies ClinicalPhotoMetadata,
        },
      };
    });
    if ('replay' in pending) {
      await i.body.cancel().catch(() => undefined);
      return pending.replay!;
    }
    const current = pending.pending;
    // Only a certified pre-write rejection can release capacity without R2 reconciliation.
    try {
      const stored = await this.storage.put(
        current.photo.data.objectKey,
        i.body,
        i.contentType,
        {
          tenantId: i.tenantId,
          photoId: current.photo.id,
          sessionId: i.sessionId,
        },
        i.maxBytes,
        i.contentLength,
      );
      const now = new Date().toISOString();
      const result = await this.uow.execute(async (t) => {
        this.photos.markAvailable(
          i.tenantId,
          current.photo.id,
          {
            sizeBytes: stored.size,
            etag: stored.etag,
            checksum: i.clientChecksum,
            uploadedAt: now,
          },
          t.persistence,
        );
        const out = {
          ...current.metadata,
          status: 'AVAILABLE' as const,
          sizeBytes: stored.size,
          uploadedAt: now,
        };
        await t.audit.append({
          id: crypto.randomUUID(),
          tenantId: i.tenantId,
          actorId: i.actorId,
          action:
            i.purpose === 'INTERCURRENCE'
              ? 'IntercurrencePhotoUploaded'
              : 'SessionPhotoUploaded',
          resourceType: 'CLINICAL_PHOTO',
          resourceId: current.photo.id,
          requestId: i.requestId,
          correlationId: i.correlationId,
          occurredAt: now,
          metadata: {
            sessionId: i.sessionId,
            photoId: current.photo.id,
            purpose: i.purpose,
            contentType: i.contentType,
            sizeBytes: stored.size,
            actorId: i.actorId,
          },
        });
        await t.idempotency.complete(
          i.tenantId,
          'UPLOAD_SESSION_PHOTO',
          i.idempotencyKey,
          out,
        );
        return out;
      });
      return result;
    } catch (error) {
      if (error instanceof ImageWriteNotStartedError)
        await this.uow.execute(async (t) => {
          this.photos.markFailed(
            i.tenantId,
            current.photo.id,
            error.message,
            t.persistence,
          );
          await t.idempotency.fail(
            i.tenantId,
            'UPLOAD_SESSION_PHOTO',
            i.idempotencyKey,
          );
        });
      throw error;
    }
  }
}
export class ListSessionPhotos {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly photos: PhotoAttachmentRepository,
  ) {}
  async execute(i: { tenantId: string; sessionId: string; actorId: string }) {
    const s = await this.sessions.findById(i.tenantId, i.sessionId);
    if (!s) throw new Error('SESSION_NOT_FOUND');
    assertProfessionalAuthorization(i, s.data.professionalId);
    return this.photos.listAvailableBySession(i.tenantId, i.sessionId);
  }
}
export class GetClinicalPhoto {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly photos: PhotoAttachmentRepository,
    private readonly storage: ClinicalMediaStoragePort,
  ) {}
  async execute(i: {
    tenantId: string;
    sessionId: string;
    photoId: string;
    actorId: string;
  }) {
    const s = await this.sessions.findById(i.tenantId, i.sessionId);
    if (!s) throw new Error('SESSION_NOT_FOUND');
    assertProfessionalAuthorization(i, s.data.professionalId);
    const p = await this.photos.findById(i.tenantId, i.photoId);
    if (!p || p.data.sessionId !== i.sessionId || p.data.status !== 'AVAILABLE')
      throw new Error('PHOTO_NOT_FOUND');
    const object = await this.storage.get(p.data.objectKey);
    if (!object) throw new Error('PHOTO_OBJECT_MISSING');
    return { metadata: p.data, object };
  }
}
export class ReconcilePhotoAttachment {
  constructor(
    private readonly photos: PhotoAttachmentRepository,
    private readonly storage: ClinicalMediaStoragePort,
    private readonly uow: UnitOfWork,
    private readonly sessions?: SessionRepository,
  ) {}
  async execute(i: {
    tenantId: string;
    photoId: string;
    requestId: string;
    correlationId: string;
    actorId: string;
  }) {
    const p = await this.photos.findById(i.tenantId, i.photoId);
    if (!p) throw new Error('PHOTO_NOT_FOUND');
    if (!this.sessions) throw new Error('PERMISSION_DENIED');
    const session = await this.sessions.findById(i.tenantId, p.data.sessionId);
    if (!session) throw new Error('SESSION_NOT_FOUND');
    assertProfessionalAuthorization(i, session.data.professionalId);
    if (p.data.status !== 'PENDING_UPLOAD') return { status: p.data.status };
    const object = await this.storage.head(p.data.objectKey);
    if (!object) throw new Error('PHOTO_OBJECT_MISSING');
    if (
      !p.data.idempotencyKey ||
      object.size !== p.data.sizeBytes ||
      object.contentType !== p.data.contentType ||
      object.metadata?.tenantId !== i.tenantId ||
      object.metadata?.sessionId !== p.data.sessionId ||
      object.metadata?.photoId !== i.photoId
    )
      throw new Error('PHOTO_CONTENT_INVALID');
    if (p.data.status === 'PENDING_UPLOAD') {
      const now = new Date().toISOString();
      return this.uow.execute(async (t) => {
        this.photos.markAvailable(
          i.tenantId,
          i.photoId,
          { sizeBytes: object.size, etag: object.etag, uploadedAt: now },
          t.persistence,
        );
        await t.audit.append({
          id: crypto.randomUUID(),
          tenantId: i.tenantId,
          actorId: i.actorId,
          action: 'ClinicalPhotoReconciled',
          resourceType: 'CLINICAL_PHOTO',
          resourceId: i.photoId,
          requestId: i.requestId,
          correlationId: i.correlationId,
          occurredAt: now,
        });
        await t.idempotency.complete(
          i.tenantId,
          'UPLOAD_SESSION_PHOTO',
          p.data.idempotencyKey!,
          {
            id: p.id,
            tenantId: i.tenantId,
            sessionId: p.data.sessionId,
            intercurrenceId: p.data.intercurrenceId,
            purpose: p.data.purpose,
            contentType: p.data.contentType,
            sizeBytes: object.size,
            capturedAt: p.data.capturedAt,
            status: 'AVAILABLE',
            uploadedAt: now,
          },
        );
        return { status: 'AVAILABLE' };
      });
    }
    return { status: p.data.status };
  }
}
export class EvaluateSessionPhotoRequirement {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly photos: PhotoAttachmentRepository,
    private readonly serviceContext: {
      getSessionPhotoRequirement(
        tenantId: string,
        serviceId: string,
      ): Promise<boolean>;
    },
  ) {}
  async execute(i: {
    tenantId: string;
    sessionId: string;
    actorId: string;
  }): Promise<PhotoRequirementResponse> {
    const s = await this.sessions.findById(i.tenantId, i.sessionId);
    if (!s) throw new Error('SESSION_NOT_FOUND');
    assertProfessionalAuthorization(i, s.data.professionalId);
    if (!(
      s.data.completionRequirements?.requiresPhotography ??
      (await this.serviceContext.getSessionPhotoRequirement(
        i.tenantId,
        s.data.serviceId,
      ))
    ))
      return { status: 'NOT_REQUIRED', missingPurposes: [] };
    const count = await this.photos.countAvailableByPurpose(
      i.tenantId,
      i.sessionId,
      'BEFORE',
    );
    return count > 0
      ? { status: 'REQUIRED_SATISFIED', missingPurposes: [] }
      : { status: 'REQUIRED_MISSING', missingPurposes: ['BEFORE'] };
  }
}
