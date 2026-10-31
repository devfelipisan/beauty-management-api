import { ImageWriteNotStartedError } from '@beauty/reliability/media/image-write-error';
import type { UnitOfWork } from '@beauty/reliability/unit-of-work/unit-of-work';
import { assertProfessionalAuthorization } from '@beauty/kernel/application/actor-authorization';
import type { TransactionContext } from '@beauty/reliability/unit-of-work/transaction-context';
import type { IdempotencyStore } from '@beauty/reliability/idempotency/idempotency-store';
import { IdempotencyService } from '@beauty/reliability/idempotency/idempotency.service';
import type { OutboxEvent } from '@beauty/reliability/outbox/outbox-event';
import type { ProfileImageRepository } from '../ports/profile-image-repository.js';
import type {
  ProfileImageStoragePort,
  ProfileStoredObject,
} from '../ports/profile-image-storage.js';
import {
  ProfileImagePolicy,
  profileMetadata,
  type ProfileImage,
} from '../domain/profile-image.js';

interface Actor {
  tenantId: string;
  ownerId: string;
  actorId: string;
  requestId: string;
  correlationId: string;
}
interface Mutation extends Actor {
  idempotencyKey: string;
  expectedVersion: number;
}
export const PROFILE_RECONCILE_EVENT = 'ProfileImageReconciliationRequested';
export const PROFILE_DELETE_EVENT = 'ProfileImageDeletionRequested';
export class ProfileImages {
  constructor(
    private readonly repository: ProfileImageRepository,
    private readonly storage: ProfileImageStoragePort,
    private readonly uow: UnitOfWork,
    private readonly idempotency: IdempotencyStore,
    private readonly leaseSeconds = 60,
  ) {}
  private async owner(i: Pick<Actor, 'tenantId' | 'ownerId'>) {
    if (!(await this.repository.customerExists(i.tenantId, i.ownerId)))
      throw new Error('CUSTOMER_NOT_FOUND');
  }
  private store(t: TransactionContext): IdempotencyStore {
    return {
      ...t.idempotency,
      find: (a, b, c) => this.idempotency.find(a, b, c),
    };
  }
  private audit(t: TransactionContext, i: Actor, action: string, id: string) {
    return t.audit.append({
      id: crypto.randomUUID(),
      tenantId: i.tenantId,
      actorId: i.actorId,
      action,
      resourceType: 'PROFILE_IMAGE',
      resourceId: id,
      requestId: i.requestId,
      correlationId: i.correlationId,
      occurredAt: new Date().toISOString(),
    });
  }
  private event(
    t: TransactionContext,
    p: ProfileImage,
    type: string,
    correlationId: string,
  ) {
    if (!Number.isSafeInteger(this.leaseSeconds) || this.leaseSeconds < 1)
      throw new Error('VALIDATION_ERROR');
    const now = Date.now();
    return t.outbox.append({
      id: crypto.randomUUID(),
      tenantId: p.tenantId,
      type,
      aggregateType: 'PROFILE_IMAGE',
      aggregateId: p.id,
      correlationId,
      payload: { photoId: p.id },
      status: 'PENDING',
      createdAt: new Date(now).toISOString(),
      ...(type === PROFILE_RECONCILE_EVENT
        ? {
            availableAt: new Date(now + this.leaseSeconds * 1000).toISOString(),
          }
        : {}),
    });
  }
  private validateMutation(i: Mutation) {
    if (!i.idempotencyKey?.trim()) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
    if (!Number.isSafeInteger(i.expectedVersion) || i.expectedVersion < 0)
      throw new Error('VALIDATION_ERROR');
  }
  async upload(
    i: Mutation & {
      contentType: string;
      sizeBytes: number;
      checksum: string;
      body: ReadableStream<Uint8Array>;
    },
  ) {
    assertProfessionalAuthorization(i, '');
    await this.owner(i);
    this.validateMutation(i);
    ProfileImagePolicy.validate(i.contentType, i.sizeBytes);
    const request = {
      ownerId: i.ownerId,
      version: i.expectedVersion,
      contentType: i.contentType,
      sizeBytes: i.sizeBytes,
      checksum: i.checksum,
    };
    const existing = await this.idempotency.find(
      i.tenantId,
      'UPLOAD_PROFILE_IMAGE',
      i.idempotencyKey,
    );
    if (existing) {
      const r = await new IdempotencyService().reserveOrReplay(
        this.idempotency,
        i.tenantId,
        'UPLOAD_PROFILE_IMAGE',
        i.idempotencyKey,
        request,
      );
      await i.body.cancel().catch(() => undefined);
      return r.record.response;
    }
    const current = await this.repository.current(i.tenantId, i.ownerId);
    if (current.version !== i.expectedVersion)
      throw new Error('PROFILE_IMAGE_VERSION_CONFLICT');
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    const image: ProfileImage = {
      id,
      tenantId: i.tenantId,
      ownerId: i.ownerId,
      objectKey: `profile/${encodeURIComponent(i.tenantId)}/customer/${encodeURIComponent(i.ownerId)}/${id}`,
      contentType: i.contentType,
      sizeBytes: i.sizeBytes,
      checksum: i.checksum,
      version: i.expectedVersion + 1,
      status: 'PENDING',
      uploadedBy: i.actorId,
      idempotencyKey: i.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };
    await this.uow.execute(async (t) => {
      await new IdempotencyService().reserveOrReplay(
        this.store(t),
        i.tenantId,
        'UPLOAD_PROFILE_IMAGE',
        i.idempotencyKey,
        request,
      );
      this.repository.create(image, t);
      await this.event(t, image, PROFILE_RECONCILE_EVENT, i.correlationId);
    });
    let stored: ProfileStoredObject;
    try {
      stored = await this.storage.put(
        image.objectKey,
        i.body,
        i.contentType,
        i.sizeBytes,
        {
          tenantId: i.tenantId,
          photoId: id,
          ownerId: i.ownerId,
          checksum: i.checksum,
        },
      );
    } catch (error) {
      if (error instanceof ImageWriteNotStartedError)
        await this.uow.execute(async (t) => {
          this.repository.retire(image, t);
          this.repository.release(image, t);
          await t.idempotency.fail(
            image.tenantId,
            'UPLOAD_PROFILE_IMAGE',
            image.idempotencyKey,
          );
        });
      throw error;
    }
    const result = await this.finalize(image, stored, i);
    if (current.image) await this.cleanup(current.image).catch(() => undefined);
    return result;
  }
  private async finalize(
    image: ProfileImage,
    stored: ProfileStoredObject,
    i: Actor,
  ) {
    if (stored.size !== image.sizeBytes)
      throw new Error('PHOTO_CONTENT_INVALID');
    const current = await this.repository.current(
      image.tenantId,
      image.ownerId,
    );
    if (current.image?.id === image.id) return profileMetadata(current.image);
    if (current.version !== image.version - 1) {
      await this.uow.execute(async (t) => {
        this.repository.retire(image, t);
        await this.event(t, image, PROFILE_DELETE_EVENT, i.correlationId);
        await t.idempotency.fail(
          image.tenantId,
          'UPLOAD_PROFILE_IMAGE',
          image.idempotencyKey,
        );
      });
      throw new Error('PROFILE_IMAGE_VERSION_CONFLICT');
    }
    const metadata = profileMetadata({ ...image, status: 'AVAILABLE' });
    await this.uow.execute(async (t) => {
      this.repository.activate(image, stored.etag, current.image, t);
      await this.audit(t, i, 'ProfileImageUploaded', image.id);
      await t.idempotency.complete(
        image.tenantId,
        'UPLOAD_PROFILE_IMAGE',
        image.idempotencyKey,
        metadata,
      );
      if (current.image)
        await this.event(
          t,
          current.image,
          PROFILE_DELETE_EVENT,
          i.correlationId,
        );
    });
    return metadata;
  }
  async metadata(tenantId: string, ownerId: string) {
    await this.owner({ tenantId, ownerId });
    const current = await this.repository.current(tenantId, ownerId);
    return {
      version: current.version,
      image: current.image ? profileMetadata(current.image) : null,
    };
  }
  async get(
    i: Pick<Actor, 'tenantId' | 'ownerId' | 'actorId'> & {
      version?: number;
      etag?: string;
    },
  ) {
    assertProfessionalAuthorization(i, '');
    await this.owner(i);
    const current = await this.repository.current(i.tenantId, i.ownerId);
    if (
      !current.image ||
      (i.version !== undefined && i.version !== current.version)
    )
      throw new Error('PROFILE_IMAGE_NOT_FOUND');
    if (i.etag === `"${current.version}"`)
      return { image: current.image, object: null };
    const object = await this.storage.get(current.image.objectKey);
    if (!object) throw new Error('PHOTO_OBJECT_MISSING');
    return { image: current.image, object };
  }
  async remove(i: Mutation) {
    assertProfessionalAuthorization(i, '');
    await this.owner(i);
    this.validateMutation(i);
    const request = { ownerId: i.ownerId, version: i.expectedVersion };
    const existing = await this.idempotency.find(
      i.tenantId,
      'REMOVE_PROFILE_IMAGE',
      i.idempotencyKey,
    );
    if (existing) {
      const r = await new IdempotencyService().reserveOrReplay(
        this.idempotency,
        i.tenantId,
        'REMOVE_PROFILE_IMAGE',
        i.idempotencyKey,
        request,
      );
      return r.record.response;
    }
    const current = await this.repository.current(i.tenantId, i.ownerId);
    if (current.version !== i.expectedVersion)
      throw new Error('PROFILE_IMAGE_VERSION_CONFLICT');
    const result = {
      version: current.image ? current.version + 1 : current.version,
      image: null,
    };
    await this.uow.execute(async (t) => {
      await new IdempotencyService().reserveOrReplay(
        this.store(t),
        i.tenantId,
        'REMOVE_PROFILE_IMAGE',
        i.idempotencyKey,
        request,
      );
      if (current.image) {
        this.repository.remove(
          i.tenantId,
          i.ownerId,
          current.version,
          current.image,
          t,
        );
        await this.event(
          t,
          current.image,
          PROFILE_DELETE_EVENT,
          i.correlationId,
        );
        await this.audit(t, i, 'ProfileImageRemoved', current.image.id);
      }
      await t.idempotency.complete(
        i.tenantId,
        'REMOVE_PROFILE_IMAGE',
        i.idempotencyKey,
        result,
      );
    });
    if (current.image) await this.cleanup(current.image).catch(() => undefined);
    return result;
  }
  private async cleanup(image: ProfileImage) {
    if (await this.repository.released(image.tenantId, image.id)) return;
    const current = await this.repository.current(
      image.tenantId,
      image.ownerId,
    );
    if (current.image?.id === image.id)
      throw new Error('PROFILE_IMAGE_ACTIVE_DELETE_FORBIDDEN');
    const persisted = await this.repository.find(image.tenantId, image.id);
    if (persisted?.status !== 'RETIRED')
      throw new Error('PROFILE_IMAGE_ACTIVE_DELETE_FORBIDDEN');
    await this.storage.delete(image.objectKey);
    await this.uow.execute(async (t) => this.repository.release(image, t));
  }
  async deliver(event: OutboxEvent) {
    if (
      !event.tenantId ||
      ![PROFILE_DELETE_EVENT, PROFILE_RECONCILE_EVENT].includes(event.type)
    )
      throw new Error('VALIDATION_ERROR');
    const image = await this.repository.find(event.tenantId, event.aggregateId);
    if (!image) throw new Error('PROFILE_IMAGE_NOT_FOUND');
    if (event.type === PROFILE_DELETE_EVENT) {
      await this.cleanup(image);
      return { kind: 'DELIVERED' as const };
    }
    if (image.status !== 'PENDING') return { kind: 'DELIVERED' as const };
    const object = await this.storage.head(image.objectKey);
    if (!object) throw new Error('PHOTO_OBJECT_MISSING');
    if (
      object.size !== image.sizeBytes ||
      object.contentType !== image.contentType ||
      object.metadata?.tenantId !== image.tenantId ||
      object.metadata?.ownerId !== image.ownerId ||
      object.metadata?.photoId !== image.id ||
      object.metadata?.checksum !== image.checksum
    )
      throw new Error('PHOTO_CONTENT_INVALID');
    await this.finalize(image, object, {
      tenantId: image.tenantId,
      ownerId: image.ownerId,
      actorId: image.uploadedBy,
      requestId: event.id,
      correlationId: event.correlationId,
    });
    return { kind: 'DELIVERED' as const };
  }
}
