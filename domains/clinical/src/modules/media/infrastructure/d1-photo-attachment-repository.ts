import { reserveMedia } from '@beauty/reliability/media/media-capacity';
import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
import type {
  ClinicalPhotoMetadata,
  ClinicalPhotoPurpose,
} from '@beauty/contracts';
import {
  PhotoAttachment,
  type PhotoAttachmentProps,
} from '../domain/photo-attachment.js';
import type { PhotoAttachmentRepository } from '../ports/photo-attachment-repository.js';
type Row = PhotoAttachmentProps & {
  id: string;
  tenant_id: string;
  session_id: string;
  intercurrence_id?: string;
  object_key: string;
  content_type: string;
  size_bytes: number;
  captured_at?: string;
  uploaded_at?: string;
  uploaded_by: string;
  idempotency_key?: string;
  failure_code?: string;
  created_at: string;
  updated_at: string;
};
const view = (r: Row): ClinicalPhotoMetadata => ({
  id: r.id,
  tenantId: r.tenant_id,
  sessionId: r.session_id,
  intercurrenceId: r.intercurrence_id ?? undefined,
  purpose: r.purpose,
  contentType: r.content_type,
  sizeBytes: r.size_bytes,
  capturedAt: r.captured_at ?? undefined,
  uploadedAt: r.uploaded_at ?? undefined,
  status: r.status,
});
export class D1PhotoAttachmentRepository implements PhotoAttachmentRepository {
  constructor(private readonly db: D1DatabaseLike) {}
  async requiresPhotography(tenantId: string, serviceId: string) {
    const row = await this.db
      .prepare(
        'SELECT requires_photography FROM services WHERE tenant_id=? AND id=?',
      )
      .bind(tenantId, serviceId)
      .first<{ requires_photography: number }>();
    return Boolean(row?.requires_photography);
  }
  private map(r: Row) {
    return PhotoAttachment.restore(r.id, {
      idempotencyKey: r.idempotency_key ?? undefined,
      tenantId: r.tenant_id,
      sessionId: r.session_id,
      intercurrenceId: r.intercurrence_id ?? undefined,
      purpose: r.purpose,
      objectKey: r.object_key,
      contentType: r.content_type,
      sizeBytes: r.size_bytes,
      checksum: r.checksum ?? undefined,
      etag: r.etag ?? undefined,
      status: r.status,
      capturedAt: r.captured_at ?? undefined,
      uploadedAt: r.uploaded_at ?? undefined,
      uploadedBy: r.uploaded_by,
      failureCode: r.failure_code ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  }
  async findById(t: string, id: string) {
    const r = await this.db
      .prepare(
        'SELECT * FROM clinical_photo_attachments WHERE tenant_id = ? AND id = ?',
      )
      .bind(t, id)
      .first<Row>();
    return r ? this.map(r) : null;
  }
  async listAvailableBySession(t: string, s: string) {
    const r = await this.db
      .prepare(
        "SELECT * FROM clinical_photo_attachments WHERE tenant_id = ? AND session_id = ? AND status = 'AVAILABLE' ORDER BY uploaded_at, id",
      )
      .bind(t, s)
      .all<Row>();
    return r.results.map(view);
  }
  async listAvailableByIntercurrence(t: string, i: string) {
    const r = await this.db
      .prepare(
        "SELECT * FROM clinical_photo_attachments WHERE tenant_id = ? AND intercurrence_id = ? AND status = 'AVAILABLE' ORDER BY uploaded_at, id",
      )
      .bind(t, i)
      .all<Row>();
    return r.results.map(view);
  }
  async countAvailableByPurpose(t: string, s: string, p: ClinicalPhotoPurpose) {
    const r = await this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM clinical_photo_attachments WHERE tenant_id = ? AND session_id = ? AND purpose = ? AND status = 'AVAILABLE'",
      )
      .bind(t, s, p)
      .first<{ count: number }>();
    return Number(r?.count ?? 0);
  }
  createPending(p: PhotoAttachment, tx: TransactionalWriteContext) {
    const x = p.data;
    reserveMedia(
      {
        objectKey: x.objectKey,
        tenantId: x.tenantId,
        domain: 'clinical',
        resourceId: p.id,
        operation: 'UPLOAD_SESSION_PHOTO',
        idempotencyKey: x.idempotencyKey!,
        sizeBytes: x.sizeBytes,
      },
      tx,
    );
    tx.add({
      kind: 'D1_SQL',
      failureCode: 'PHOTO_INTENT_CREATE_FAILED',
      expectedChanges: 1,
      sql: 'INSERT INTO clinical_photo_attachments (id,tenant_id,session_id,intercurrence_id,purpose,object_key,content_type,size_bytes,checksum,etag,status,captured_at,uploaded_at,uploaded_by,failure_code,created_at,updated_at,idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [
        p.id,
        x.tenantId,
        x.sessionId,
        x.intercurrenceId ?? null,
        x.purpose,
        x.objectKey,
        x.contentType,
        x.sizeBytes,
        x.checksum ?? null,
        x.etag ?? null,
        x.status,
        x.capturedAt ?? null,
        x.uploadedAt ?? null,
        x.uploadedBy,
        x.failureCode ?? null,
        x.createdAt,
        x.updatedAt,
        x.idempotencyKey ?? null,
      ],
    });
  }
  markAvailable(
    t: string,
    id: string,
    info: {
      sizeBytes: number;
      etag?: string;
      checksum?: string;
      uploadedAt: string;
    },
    tx: TransactionalWriteContext,
  ) {
    tx.add({
      kind: 'D1_SQL',
      expectedChanges: 1,
      sql: "UPDATE media_objects SET status='STORED',updated_at=? WHERE tenant_id=? AND domain='clinical' AND resource_id=? AND status='RESERVED'",
      params: [info.uploadedAt, t, id],
    });
    tx.add({
      kind: 'D1_SQL',
      failureCode: 'PHOTO_FINALIZE_FAILED',
      expectedChanges: 1,
      sql: "UPDATE clinical_photo_attachments SET status = 'AVAILABLE', size_bytes = ?, etag = ?, checksum = ?, uploaded_at = ?, failure_code = NULL, updated_at = ? WHERE tenant_id = ? AND id = ? AND status = 'PENDING_UPLOAD'",
      params: [
        info.sizeBytes,
        info.etag ?? null,
        info.checksum ?? null,
        info.uploadedAt,
        info.uploadedAt,
        t,
        id,
      ],
    });
  }
  markFailed(
    t: string,
    id: string,
    code: string,
    tx: TransactionalWriteContext,
  ) {
    tx.add({
      kind: 'D1_SQL',
      expectedChanges: 1,
      sql: "UPDATE media_objects SET status='RELEASED',updated_at=? WHERE tenant_id=? AND domain='clinical' AND resource_id=? AND status='RESERVED'",
      params: [new Date().toISOString(), t, id],
    });
    tx.add({
      kind: 'D1_SQL',
      failureCode: 'PHOTO_FAILURE_UPDATE_FAILED',
      expectedChanges: 1,
      sql: "UPDATE clinical_photo_attachments SET status = 'FAILED', failure_code = ?, updated_at = ? WHERE tenant_id = ? AND id = ? AND status = 'PENDING_UPLOAD'",
      params: [code, new Date().toISOString(), t, id],
    });
  }
}
