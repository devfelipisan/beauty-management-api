import { authorizeActor } from '@beauty/kernel/application/actor-authorization';
import type { UploadClinicalPhotoRequest } from '@beauty/contracts';
import { PhotoAttachment } from '../domain/photo-attachment.js';
import {
  UploadSessionPhoto,
  ListSessionPhotos,
  GetClinicalPhoto,
  ReconcilePhotoAttachment,
  EvaluateSessionPhotoRequirement,
} from './use-cases.js';

function fixture() {
  const session = {
    data: {
      tenantId: 'tenant',
      professionalId: 'professional',
      serviceId: 'service',
      status: 'IN_PROGRESS',
    },
  };
  const sessions = { findById: vi.fn().mockResolvedValue(session) };
  const intercurrences = {
    findById: vi.fn().mockResolvedValue({ sessionId: 'session' }),
  };
  const photos = {
    createPending: vi.fn(),
    markAvailable: vi.fn(),
    markFailed: vi.fn(),
    findById: vi.fn(),
    listAvailableBySession: vi.fn().mockResolvedValue([]),
    countAvailableByPurpose: vi.fn().mockResolvedValue(0),
  };
  const storage = {
    put: vi.fn().mockResolvedValue({ size: 8, etag: 'etag' }),
    get: vi.fn(),
    head: vi.fn(),
  };
  const store = {
    find: vi.fn().mockResolvedValue(null),
    reserve: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  };
  const transaction = {
    idempotency: { reserve: vi.fn(), complete: vi.fn(), fail: vi.fn() },
    audit: { append: vi.fn() },
    persistence: { add: vi.fn() },
  };
  const uow = {
    execute: vi.fn(async (operation: (tx: typeof transaction) => unknown) =>
      operation(transaction),
    ),
  };
  const input = authorizeActor(
    {
      tenantId: 'tenant',
      sessionId: 'session',
      actorId: 'actor',
      idempotencyKey: 'key',
      requestId: 'request',
      correlationId: 'correlation',
      purpose: 'BEFORE',
      contentType: 'image/jpeg',
      contentLength: 8,
      maxBytes: 8,
      body: new ReadableStream<Uint8Array>(),
    } as UploadClinicalPhotoRequest,
    { tenantId: 'tenant', actorId: 'actor', professionalId: 'professional' },
  );
  const upload = new UploadSessionPhoto(
    sessions as never,
    intercurrences as never,
    photos as never,
    storage,
    uow as never,
    store,
  );
  const photo = (status = 'AVAILABLE', sessionId = 'session') =>
    PhotoAttachment.restore('photo', {
      tenantId: 'tenant',
      sessionId,
      purpose: 'BEFORE',
      objectKey: 'object',
      contentType: 'image/jpeg',
      sizeBytes: 8,
      uploadedBy: 'actor',
      status,
      createdAt: 'now',
      updatedAt: 'now',
    } as never);
  return {
    sessions,
    session,
    intercurrences,
    photos,
    storage,
    store,
    transaction,
    uow,
    input,
    upload,
    photo,
  };
}

describe('clinical media application orchestration', () => {
  it('uploads a pending photo, publishes metadata, audits and completes idempotency', async () => {
    const f = fixture();
    const result = await f.upload.execute(f.input);
    expect(result).toMatchObject({
      tenantId: 'tenant',
      sessionId: 'session',
      status: 'AVAILABLE',
      sizeBytes: 8,
    });
    expect(f.sessions.findById).toHaveBeenCalledWith('tenant', 'session');
    const pending = f.photos.createPending.mock.calls[0][0] as PhotoAttachment;
    expect(pending.data.status).toBe('PENDING_UPLOAD');
    expect(f.storage.put).toHaveBeenCalledWith(
      pending.data.objectKey,
      f.input.body,
      'image/jpeg',
      { tenantId: 'tenant', sessionId: 'session', photoId: result.id },
      8,
      8,
    );
    expect(f.photos.markAvailable).toHaveBeenCalledWith(
      'tenant',
      result.id,
      expect.objectContaining({ sizeBytes: 8, etag: 'etag' }),
      f.transaction.persistence,
    );
    expect(f.transaction.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SessionPhotoUploaded',
        actorId: 'actor',
        resourceId: result.id,
      }),
    );
    expect(f.store.complete).toHaveBeenCalledWith(
      'tenant',
      'UPLOAD_SESSION_PHOTO',
      'key',
      result,
    );
    expect(f.photos.markFailed).not.toHaveBeenCalled();
  });
  it('validates an intercurrence belongs to the session and uses its audit action', async () => {
    const f = fixture();
    f.input.purpose = 'INTERCURRENCE';
    f.input.intercurrenceId = 'incident';
    await f.upload.execute(f.input);
    expect(f.intercurrences.findById).toHaveBeenCalledWith(
      'tenant',
      'incident',
    );
    expect(f.transaction.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'IntercurrencePhotoUploaded' }),
    );
  });
  it.each([null, { sessionId: 'another-session' }])(
    'rejects an absent or unrelated intercurrence %j before writing',
    async (incident) => {
      const f = fixture();
      f.input.purpose = 'INTERCURRENCE';
      f.intercurrences.findById.mockResolvedValue(incident);
      await expect(f.upload.execute(f.input)).rejects.toThrow(
        'INTERCURRENCE_NOT_FOUND',
      );
      expect(f.uow.execute).not.toHaveBeenCalled();
    },
  );
  it.each(['missing', 'completed', 'unauthorized', 'invalid-content'])(
    'rejects %s upload before reserving or touching storage',
    async (failure) => {
      const f = fixture();
      if (failure === 'missing') f.sessions.findById.mockResolvedValue(null);
      if (failure === 'completed') f.session.data.status = 'COMPLETED';
      if (failure === 'unauthorized') f.input.actorId = 'forged';
      if (failure === 'invalid-content') f.input.contentType = 'text/plain';
      const code = {
        missing: 'SESSION_NOT_FOUND',
        completed: 'PHOTO_UPLOAD_NOT_ALLOWED',
        unauthorized: 'PERMISSION_DENIED',
        'invalid-content': 'PHOTO_CONTENT_TYPE_NOT_ALLOWED',
      }[failure];
      await expect(f.upload.execute(f.input)).rejects.toThrow(code);
      expect(f.transaction.idempotency.reserve).not.toHaveBeenCalled();
      expect(f.storage.put).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    'replays completed metadata without another upload (transaction replay=%s)',
    async (inTransaction) => {
      const f = fixture();
      const response = { id: 'original', status: 'AVAILABLE' };
      const record = { status: 'COMPLETED', response };
      if (inTransaction) {
        const { IdempotencyService } =
          await import('@beauty/reliability/idempotency/idempotency.service');
        f.store.find.mockResolvedValueOnce(null).mockResolvedValueOnce({
          ...record,
          requestHash: new IdempotencyService().hash({
            tenantId: f.input.tenantId,
            sessionId: f.input.sessionId,
            intercurrenceId: f.input.intercurrenceId,
            purpose: f.input.purpose,
            contentType: f.input.contentType,
            contentLength: f.input.contentLength,
            clientChecksum: f.input.clientChecksum,
          }),
        });
      } else f.store.find.mockResolvedValue(record);
      expect(await f.upload.execute(f.input)).toBe(response);
      expect(f.storage.put).not.toHaveBeenCalled();
      expect(f.photos.createPending).not.toHaveBeenCalled();
    },
  );
  it.each([new Error('STORAGE_FAILURE'), 'transport-failure'])(
    'marks failed metadata and idempotency when storage fails: %s',
    async (failure) => {
      const f = fixture();
      f.storage.put.mockRejectedValue(failure);
      await expect(f.upload.execute(f.input)).rejects.toBe(failure);
      expect(f.photos.markFailed).toHaveBeenCalledWith(
        'tenant',
        expect.any(String),
        failure instanceof Error ? 'STORAGE_FAILURE' : 'PHOTO_UPLOAD_FAILED',
        f.transaction.persistence,
      );
      expect(f.store.fail).toHaveBeenCalledWith(
        'tenant',
        'UPLOAD_SESSION_PHOTO',
        'key',
      );
      expect(f.store.complete).not.toHaveBeenCalled();
    },
  );
  it('lists only after checking the session and application scope', async () => {
    const f = fixture();
    const list = new ListSessionPhotos(f.sessions as never, f.photos as never);
    expect(await list.execute(f.input)).toEqual([]);
    expect(f.photos.listAvailableBySession).toHaveBeenCalledWith(
      'tenant',
      'session',
    );
    f.input.actorId = 'forged';
    await expect(list.execute(f.input)).rejects.toThrow('PERMISSION_DENIED');
    f.sessions.findById.mockResolvedValue(null);
    await expect(list.execute(f.input)).rejects.toThrow('SESSION_NOT_FOUND');
    expect(f.photos.listAvailableBySession).toHaveBeenCalledTimes(1);
  });
  it('reads an available photo only in the authorized session', async () => {
    const f = fixture();
    const get = new GetClinicalPhoto(
      f.sessions as never,
      f.photos as never,
      f.storage,
    );
    const input = Object.assign(f.input, { photoId: 'photo' });
    const photo = f.photo();
    const object = { body: 'stream' };
    f.photos.findById.mockResolvedValue(photo);
    f.storage.get.mockResolvedValue(object);
    expect(await get.execute(input)).toEqual({ metadata: photo.data, object });
    expect(f.photos.findById).toHaveBeenCalledWith('tenant', 'photo');
    expect(f.storage.get).toHaveBeenCalledWith('object');
    f.storage.get.mockResolvedValue(null);
    await expect(get.execute(input)).rejects.toThrow('PHOTO_OBJECT_MISSING');
    for (const invalid of [
      null,
      f.photo('PENDING_UPLOAD'),
      f.photo('AVAILABLE', 'another'),
    ]) {
      f.photos.findById.mockResolvedValue(invalid);
      await expect(get.execute(input)).rejects.toThrow('PHOTO_NOT_FOUND');
    }
    f.sessions.findById.mockResolvedValue(null);
    await expect(get.execute(input)).rejects.toThrow('SESSION_NOT_FOUND');
  });
  it('reconciles pending objects and audits their promotion, without overwriting terminal metadata', async () => {
    const f = fixture();
    const reconcile = new ReconcilePhotoAttachment(
      f.photos as never,
      f.storage,
      f.uow as never,
    );
    const input = { ...f.input, photoId: 'photo' };
    f.photos.findById.mockResolvedValue(f.photo('PENDING_UPLOAD'));
    f.storage.head.mockResolvedValue({ size: 8, etag: 'etag' });
    expect(await reconcile.execute(input)).toEqual({ status: 'AVAILABLE' });
    expect(f.photos.markAvailable).toHaveBeenCalledWith(
      'tenant',
      'photo',
      expect.objectContaining({ sizeBytes: 8, etag: 'etag' }),
      f.transaction.persistence,
    );
    expect(f.transaction.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ClinicalPhotoReconciled',
        resourceId: 'photo',
      }),
    );
    for (const status of ['AVAILABLE', 'FAILED']) {
      f.photos.findById.mockResolvedValue(f.photo(status));
      expect(await reconcile.execute(input)).toEqual({ status });
    }
    expect(f.photos.markAvailable).toHaveBeenCalledTimes(1);
  });
  it('records a missing pending object as failed, but reports a missing available object', async () => {
    const f = fixture();
    const reconcile = new ReconcilePhotoAttachment(
      f.photos as never,
      f.storage,
      f.uow as never,
    );
    const input = { ...f.input, photoId: 'photo' };
    f.photos.findById.mockResolvedValue(null);
    await expect(reconcile.execute(input)).rejects.toThrow('PHOTO_NOT_FOUND');
    f.photos.findById.mockResolvedValue(f.photo('PENDING_UPLOAD'));
    f.storage.head.mockResolvedValue(null);
    expect(await reconcile.execute(input)).toEqual({ status: 'FAILED' });
    expect(f.photos.markFailed).toHaveBeenCalledWith(
      'tenant',
      'photo',
      'PHOTO_OBJECT_MISSING',
      f.transaction.persistence,
    );
    f.photos.findById.mockResolvedValue(f.photo());
    await expect(reconcile.execute(input)).rejects.toThrow(
      'PHOTO_OBJECT_MISSING',
    );
    expect(f.photos.markFailed).toHaveBeenCalledTimes(1);
  });
  it('evaluates the existing photo requirement without counting photos when optional', async () => {
    const f = fixture();
    const context = {
      getSessionPhotoRequirement: vi.fn().mockResolvedValue(false),
    };
    const evaluate = new EvaluateSessionPhotoRequirement(
      f.sessions as never,
      f.photos as never,
      context,
    );
    expect(await evaluate.execute(f.input)).toEqual({
      status: 'NOT_REQUIRED',
      missingPurposes: [],
    });
    expect(f.photos.countAvailableByPurpose).not.toHaveBeenCalled();
    context.getSessionPhotoRequirement.mockResolvedValue(true);
    expect(await evaluate.execute(f.input)).toEqual({
      status: 'REQUIRED_MISSING',
      missingPurposes: ['BEFORE'],
    });
    f.photos.countAvailableByPurpose.mockResolvedValue(1);
    expect(await evaluate.execute(f.input)).toEqual({
      status: 'REQUIRED_SATISFIED',
      missingPurposes: [],
    });
    expect(f.photos.countAvailableByPurpose).toHaveBeenCalledWith(
      'tenant',
      'session',
      'BEFORE',
    );
    f.sessions.findById.mockResolvedValue(null);
    await expect(evaluate.execute(f.input)).rejects.toThrow(
      'SESSION_NOT_FOUND',
    );
  });
});
