import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
import type { TransactionContext } from '@beauty/reliability/unit-of-work/transaction-context';
import {
  reserveMedia,
  transitionMedia,
} from '@beauty/reliability/media/media-capacity';
import { profileMetadata, type ProfileImage } from '../domain/profile-image.js';
import type { ProfileImageRepository } from '../ports/profile-image-repository.js';
type Row = {
  id: string;
  tenant_id: string;
  owner_id: string;
  object_key: string;
  content_type: string;
  size_bytes: number;
  checksum: string;
  etag?: string;
  version: number;
  status: ProfileImage['status'];
  uploaded_by: string;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};
const map = (r: Row): ProfileImage => ({
  id: r.id,
  tenantId: r.tenant_id,
  ownerId: r.owner_id,
  objectKey: r.object_key,
  contentType: r.content_type,
  sizeBytes: r.size_bytes,
  checksum: r.checksum,
  etag: r.etag,
  version: r.version,
  status: r.status,
  uploadedBy: r.uploaded_by,
  idempotencyKey: r.idempotency_key,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
export class D1ProfileImageRepository implements ProfileImageRepository {
  constructor(private readonly db: D1DatabaseLike) {}
  async metadataForOwners(tenantId: string, ownerIds: string[]) {
    if (!ownerIds.length) return new Map();
    const rows = await this.db
      .prepare(
        `SELECT s.owner_id AS slot_owner_id,s.version AS slot_version,p.* FROM profile_image_slots s LEFT JOIN profile_images p ON p.tenant_id=s.tenant_id AND p.id=s.image_id AND p.status='AVAILABLE' WHERE s.tenant_id=? AND s.owner_id IN (${ownerIds.map(() => '?').join(',')})`,
      )
      .bind(tenantId, ...ownerIds)
      .all<Row & { slot_owner_id: string; slot_version: number }>();
    return new Map(
      rows.results.map((row) => [
        row.slot_owner_id,
        {
          version: row.slot_version,
          image: row.id ? profileMetadata(map(row)) : null,
        },
      ]),
    );
  }
  async customerExists(t: string, id: string) {
    return !!(await this.db
      .prepare('SELECT id FROM customers WHERE tenant_id=? AND id=?')
      .bind(t, id)
      .first());
  }
  async current(t: string, id: string) {
    const slot = await this.db
      .prepare(
        "SELECT version,image_id FROM profile_image_slots WHERE tenant_id=? AND owner_id=? AND image_role='PROFILE'",
      )
      .bind(t, id)
      .first<{ version: number; image_id: string | null }>();
    return {
      version: slot?.version ?? 0,
      image: slot?.image_id ? await this.find(t, slot.image_id) : null,
    };
  }
  async find(t: string, id: string) {
    const row = await this.db
      .prepare('SELECT * FROM profile_images WHERE tenant_id=? AND id=?')
      .bind(t, id)
      .first<Row>();
    return row ? map(row) : null;
  }
  create(p: ProfileImage, t: TransactionContext) {
    reserveMedia(
      {
        objectKey: p.objectKey,
        tenantId: p.tenantId,
        domain: 'profile',
        resourceId: p.id,
        operation: 'UPLOAD_PROFILE_IMAGE',
        idempotencyKey: p.idempotencyKey,
        sizeBytes: p.sizeBytes,
      },
      t.persistence,
    );
    t.persistence.add({
      kind: 'D1_SQL',
      sql: "INSERT INTO profile_image_slots (tenant_id,owner_id,image_role,version) VALUES (?,?,'PROFILE',0) ON CONFLICT DO NOTHING",
      params: [p.tenantId, p.ownerId],
    });
    t.persistence.add({
      kind: 'D1_SQL',
      expectedChanges: 1,
      sql: "INSERT INTO profile_images (id,tenant_id,owner_type,owner_id,image_role,object_key,content_type,size_bytes,checksum,etag,version,status,uploaded_by,idempotency_key,created_at,updated_at) VALUES (?,?,'customer',?,'PROFILE',?,?,?,?,NULL,?,'PENDING',?,?,?,?)",
      params: [
        p.id,
        p.tenantId,
        p.ownerId,
        p.objectKey,
        p.contentType,
        p.sizeBytes,
        p.checksum,
        p.version,
        p.uploadedBy,
        p.idempotencyKey,
        p.createdAt,
        p.updatedAt,
      ],
    });
  }
  activate(
    p: ProfileImage,
    etag: string | undefined,
    previous: ProfileImage | null,
    t: TransactionContext,
  ) {
    const now = new Date().toISOString();
    t.persistence.add({
      kind: 'D1_SQL',
      expectedChanges: 1,
      sql: "UPDATE profile_image_slots SET version=?,image_id=? WHERE tenant_id=? AND owner_id=? AND image_role='PROFILE' AND version=?",
      params: [p.version, p.id, p.tenantId, p.ownerId, p.version - 1],
    });
    if (previous) this.retire(previous, t);
    t.persistence.add({
      kind: 'D1_SQL',
      expectedChanges: 1,
      sql: "UPDATE profile_images SET status='AVAILABLE',etag=?,updated_at=? WHERE tenant_id=? AND id=? AND status='PENDING'",
      params: [etag ?? null, now, p.tenantId, p.id],
    });
    transitionMedia(
      p.tenantId,
      p.objectKey,
      'RESERVED',
      'STORED',
      t.persistence,
    );
  }
  retire(p: ProfileImage, t: TransactionContext) {
    t.persistence.add({
      kind: 'D1_SQL',
      expectedChanges: 1,
      sql: "UPDATE profile_images SET status='RETIRED',updated_at=? WHERE tenant_id=? AND id=? AND status IN ('AVAILABLE','PENDING')",
      params: [new Date().toISOString(), p.tenantId, p.id],
    });
    transitionMedia(
      p.tenantId,
      p.objectKey,
      p.status === 'PENDING' ? 'RESERVED' : 'STORED',
      'DELETE_PENDING',
      t.persistence,
    );
  }
  remove(
    tenantId: string,
    ownerId: string,
    version: number,
    image: ProfileImage | null,
    t: TransactionContext,
  ) {
    t.persistence.add({
      kind: 'D1_SQL',
      expectedChanges: 1,
      sql: "UPDATE profile_image_slots SET image_id=NULL,version=version+1 WHERE tenant_id=? AND owner_id=? AND image_role='PROFILE' AND version=?",
      params: [tenantId, ownerId, version],
    });
    if (image) this.retire(image, t);
  }
  async released(t: string, id: string) {
    const row = await this.db
      .prepare(
        "SELECT status FROM media_objects WHERE tenant_id=? AND domain='profile' AND resource_id=?",
      )
      .bind(t, id)
      .first<{ status: string }>();
    return row?.status === 'RELEASED';
  }
  release(p: ProfileImage, t: TransactionContext) {
    t.persistence.add({
      kind: 'D1_SQL',
      expectedChanges: 1,
      sql: "UPDATE profile_images SET status='REMOVED',updated_at=? WHERE tenant_id=? AND id=? AND status='RETIRED' AND NOT EXISTS (SELECT 1 FROM profile_image_slots WHERE tenant_id=? AND image_id=?)",
      params: [new Date().toISOString(), p.tenantId, p.id, p.tenantId, p.id],
    });
    transitionMedia(
      p.tenantId,
      p.objectKey,
      'DELETE_PENDING',
      'RELEASED',
      t.persistence,
    );
  }
}
