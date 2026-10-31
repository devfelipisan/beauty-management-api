import { authorizeActor } from '@beauty/kernel/application/actor-authorization';
import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { ProfileImages } from '@beauty/operations/modules/profile-media/application/profile-images';
import { D1ProfileImageRepository } from '@beauty/operations/modules/profile-media/infrastructure/d1-profile-image-repository';
import { R2ProfileImageStorage } from '@beauty/operations/modules/profile-media/infrastructure/r2-profile-image-storage';
import { D1UnitOfWork } from '@beauty/reliability/d1/d1-unit-of-work';
import { D1IdempotencyStore } from '@beauty/reliability/d1/d1-reliability-store';
import {
  reserveMedia,
  transitionMedia,
} from '@beauty/reliability/media/media-capacity';

const db = env.D1_DATABASE;
async function fixture(quota = 1000) {
  const id = crypto.randomUUID(),
    tenantId = `profile-${id}`,
    ownerId = `customer-${id}`;
  await db.batch([
    db
      .prepare("INSERT INTO tenants VALUES (?,?,?,?,'UTC','ACTIVE',?,?)")
      .bind(tenantId, 'Profile', 'Profile', id, 'now', 'now'),
    db
      .prepare(
        "INSERT INTO customers (id,tenant_id,full_name,status,relationship_profile,created_at,updated_at) VALUES (?,?,'Profile','ACTIVE','NEW','now','now')",
      )
      .bind(ownerId, tenantId),
    db.prepare(
      "UPDATE media_capacity SET inventory_approved=1,policy_approved=1,writers_coordinated=1,approval_reference='test' WHERE bucket='beauty-r2'",
    ),
    db
      .prepare(
        'INSERT INTO tenant_media_capacity (tenant_id,limit_bytes) VALUES (?,?)',
      )
      .bind(tenantId, quota),
  ]);
  const storage = new R2ProfileImageStorage(
    (env as unknown as { PROFILE_MEDIA: R2Bucket }).PROFILE_MEDIA,
  );
  const put = vi.spyOn(storage, 'put'),
    remove = vi.spyOn(storage, 'delete'),
    head = vi.spyOn(storage, 'head'),
    get = vi.spyOn(storage, 'get');
  const app = new ProfileImages(
    new D1ProfileImageRepository(db),
    storage,
    new D1UnitOfWork(db),
    new D1IdempotencyStore(db),
  );
  const input = (key: string, expectedVersion = 0) =>
    authorizeActor(
      {
        tenantId,
        ownerId,
        actorId: 'actor',
        requestId: 'request',
        correlationId: 'correlation',
        idempotencyKey: key,
        expectedVersion,
        contentType: 'image/jpeg',
        sizeBytes: 4,
        checksum: key,
        body: new Response(new Uint8Array([255, 216, 255, 0])).body!,
      },
      { tenantId, actorId: 'actor' },
    );
  return { app, input, put, remove, head, get, storage, tenantId, ownerId };
}
describe('profile media physical storage', () => {
  it('uses one PUT, replays without writing, replaces safely and releases only deleted bytes', async () => {
    const f = await fixture();
    const first = (await f.app.upload(f.input('one'))) as {
      id: string;
      version: number;
    };
    expect(await f.app.upload(f.input('one'))).toEqual(first);
    expect(f.put).toHaveBeenCalledTimes(1);
    expect(f.head).not.toHaveBeenCalled();
    const second = (await f.app.upload(f.input('two', 1))) as {
      id: string;
      version: number;
    };
    expect(second.version).toBe(2);
    expect(f.put).toHaveBeenCalledTimes(2);
    expect(f.remove).toHaveBeenCalledTimes(1);
    const read = await f.app.get(
      authorizeActor(
        {
          tenantId: f.tenantId,
          ownerId: f.ownerId,
          actorId: 'actor',
          version: 2,
        },
        { tenantId: f.tenantId, actorId: 'actor' },
      ),
    );
    expect(read.image.id).toBe(second.id);
    expect(
      new Uint8Array(await new Response(read.object!.body).arrayBuffer()),
    ).toHaveLength(4);
    expect(
      (
        await f.app.get(
          authorizeActor(
            {
              tenantId: f.tenantId,
              ownerId: f.ownerId,
              actorId: 'actor',
              version: 2,
              etag: '"2"',
            },
            { tenantId: f.tenantId, actorId: 'actor' },
          ),
        )
      ).object,
    ).toBeNull();
    expect(f.get).toHaveBeenCalledTimes(1);
    expect(
      await db
        .prepare(
          'SELECT charged_bytes FROM tenant_media_capacity WHERE tenant_id=?',
        )
        .bind(f.tenantId)
        .first(),
    ).toEqual({ charged_bytes: 4 });
    await f.app.remove(f.input('delete', 2));
    expect((await f.app.metadata(f.tenantId, f.ownerId)).image).toBeNull();
    expect(f.remove).toHaveBeenCalledTimes(2);
    expect(f.head).not.toHaveBeenCalled();
    expect(
      await db
        .prepare(
          'SELECT charged_bytes FROM tenant_media_capacity WHERE tenant_id=?',
        )
        .bind(f.tenantId)
        .first(),
    ).toEqual({ charged_bytes: 0 });
  });
  it('retains the old image and charges full replacement capacity when quota is insufficient', async () => {
    const f = await fixture(4);
    await f.app.upload(f.input('one'));
    await expect(f.app.upload(f.input('two', 1))).rejects.toThrow(
      'MEDIA_TENANT_QUOTA_UNAVAILABLE',
    );
    expect(f.put).toHaveBeenCalledTimes(1);
    expect(f.remove).not.toHaveBeenCalled();
    expect((await f.app.metadata(f.tenantId, f.ownerId)).version).toBe(1);
    expect(
      await db
        .prepare(
          'SELECT COUNT(*) AS count FROM idempotency_records WHERE tenant_id=? AND idempotency_key=?',
        )
        .bind(f.tenantId, 'two')
        .first(),
    ).toEqual({ count: 0 });
  });
  it('keeps failed deletion charged and recovers from the persisted Outbox event', async () => {
    const f = await fixture();
    await f.app.upload(f.input('one'));
    f.remove.mockRejectedValueOnce(new Error('transport'));
    await f.app.upload(f.input('two', 1));
    expect(
      await db
        .prepare(
          'SELECT charged_bytes FROM tenant_media_capacity WHERE tenant_id=?',
        )
        .bind(f.tenantId)
        .first(),
    ).toEqual({ charged_bytes: 8 });
    const event = await db
      .prepare(
        "SELECT id,tenant_id,event_type,aggregate_id,correlation_id FROM outbox_events WHERE tenant_id=? AND event_type='ProfileImageDeletionRequested'",
      )
      .bind(f.tenantId)
      .first<any>();
    await f.app.deliver({
      id: event.id,
      tenantId: event.tenant_id,
      type: event.event_type,
      aggregateId: event.aggregate_id,
      correlationId: event.correlation_id,
    } as never);
    const calls = f.remove.mock.calls.length;
    await f.app.deliver({
      id: event.id,
      tenantId: event.tenant_id,
      type: event.event_type,
      aggregateId: event.aggregate_id,
      correlationId: event.correlation_id,
    } as never);
    expect(f.remove).toHaveBeenCalledTimes(calls);
    expect(
      await db
        .prepare(
          'SELECT charged_bytes FROM tenant_media_capacity WHERE tenant_id=?',
        )
        .bind(f.tenantId)
        .first(),
    ).toEqual({ charged_bytes: 4 });
  });
  it('rejects a different payload for a completed key and cannot query another tenant', async () => {
    const f = await fixture();
    await f.app.upload(f.input('one'));
    await expect(
      f.app.upload(
        authorizeActor(
          { ...f.input('one'), checksum: 'different' },
          { tenantId: f.tenantId, actorId: 'actor' },
        ),
      ),
    ).rejects.toThrow('IDEMPOTENCY_KEY_CONFLICT');
    await expect(
      f.app.get(
        authorizeActor(
          { tenantId: 'other', ownerId: f.ownerId, actorId: 'actor' },
          { tenantId: 'other', actorId: 'actor' },
        ),
      ),
    ).rejects.toThrow('CUSTOMER_NOT_FOUND');
    expect(f.put).toHaveBeenCalledTimes(1);
  });
  it('atomically admits only one concurrent reservation at the tenant limit', async () => {
    const f = await fixture(4);
    const results = await Promise.allSettled([
      f.app.upload(f.input('a')),
      f.app.upload(f.input('b')),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(f.put).toHaveBeenCalledTimes(1);
    expect(
      await db
        .prepare(
          'SELECT charged_bytes FROM tenant_media_capacity WHERE tenant_id=?',
        )
        .bind(f.tenantId)
        .first(),
    ).toEqual({ charged_bytes: 4 });
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM profile_images WHERE tenant_id=? AND status='AVAILABLE'",
        )
        .bind(f.tenantId)
        .first(),
    ).toEqual({ count: 1 });
  });
  it('blocks uploads without inventory approval and never invokes R2', async () => {
    const f = await fixture();
    await db
      .prepare(
        "UPDATE media_capacity SET inventory_approved=0 WHERE bucket='beauty-r2'",
      )
      .run();
    try {
      await expect(f.app.upload(f.input('blocked'))).rejects.toThrow(
        'MEDIA_CAPACITY_UNAVAILABLE',
      );
      expect(f.put).not.toHaveBeenCalled();
    } finally {
      await db
        .prepare(
          "UPDATE media_capacity SET inventory_approved=1 WHERE bucket='beauty-r2'",
        )
        .run();
    }
  });
  it('requires verified application authority and enforces the backend file limit', async () => {
    const f = await fixture();
    await expect(f.app.upload({ ...f.input('forged') })).rejects.toThrow(
      'PERMISSION_DENIED',
    );
    const input = f.input('oversized');
    input.sizeBytes = 2_000_001;
    await expect(f.app.upload(input)).rejects.toThrow('PHOTO_SIZE_EXCEEDED');
    expect(f.put).not.toHaveBeenCalled();
  });
  it('releases a certified pre-write rejection without DELETE or stranded quota', async () => {
    const f = await fixture();
    const input = f.input('invalid');
    input.body = new Response(new Uint8Array([0, 0, 0, 0])).body!;
    await expect(f.app.upload(input)).rejects.toThrow('PHOTO_CONTENT_INVALID');
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.head).not.toHaveBeenCalled();
    expect(
      await db
        .prepare(
          'SELECT charged_bytes FROM tenant_media_capacity WHERE tenant_id=?',
        )
        .bind(f.tenantId)
        .first(),
    ).toEqual({ charged_bytes: 0 });
    expect(
      await db
        .prepare(
          'SELECT status FROM idempotency_records WHERE tenant_id=? AND idempotency_key=?',
        )
        .bind(f.tenantId, 'invalid')
        .first(),
    ).toEqual({ status: 'FAILED' });
  });
  it('shares the last global capacity between concurrent clinical and profile reservations', async () => {
    const f = await fixture();
    const before = await db
      .prepare(
        "SELECT charged_bytes FROM media_capacity WHERE bucket='beauty-r2'",
      )
      .first<{ charged_bytes: number }>();
    const key = `clinical/${f.tenantId}/reservation`;
    await db
      .prepare(
        "UPDATE media_capacity SET charged_bytes=7999999996 WHERE bucket='beauty-r2'",
      )
      .run();
    try {
      const results = await Promise.allSettled([
        f.app.upload(f.input('profile-global')),
        new D1UnitOfWork(db).execute(async (t) =>
          reserveMedia(
            {
              objectKey: key,
              tenantId: f.tenantId,
              domain: 'clinical',
              resourceId: 'clinical-intent',
              operation: 'UPLOAD_SESSION_PHOTO',
              idempotencyKey: 'clinical-global',
              sizeBytes: 4,
            },
            t.persistence,
          ),
        ),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        await db
          .prepare(
            "SELECT charged_bytes FROM media_capacity WHERE bucket='beauty-r2'",
          )
          .first(),
      ).toEqual({ charged_bytes: 8_000_000_000 });
      if (results[0].status === 'fulfilled')
        await f.app.remove(f.input('remove-global', 1));
      else
        await new D1UnitOfWork(db).execute(async (t) =>
          transitionMedia(
            f.tenantId,
            key,
            'RESERVED',
            'RELEASED',
            t.persistence,
          ),
        );
      expect(
        await db
          .prepare(
            'SELECT charged_bytes FROM tenant_media_capacity WHERE tenant_id=?',
          )
          .bind(f.tenantId)
          .first(),
      ).toEqual({ charged_bytes: 0 });
    } finally {
      await db
        .prepare(
          "UPDATE media_capacity SET charged_bytes=? WHERE bucket='beauty-r2'",
        )
        .bind(before!.charged_bytes)
        .run();
    }
  });
});
