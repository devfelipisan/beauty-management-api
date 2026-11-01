import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

type ClinicalService = {
  uploadSessionPhoto(input: Record<string, unknown>): Promise<any>;
  listSessionPhotos(input: Record<string, unknown>): Promise<any[]>;
  getClinicalPhoto(input: Record<string, unknown>): Promise<any>;
  evaluateSessionPhotoRequirement(input: Record<string, unknown>): Promise<any>;
  checkSessionCompletionEligibility(
    input: Record<string, unknown>,
  ): Promise<any>;
};
const db = env.D1_DATABASE;
const clinical = env.CLINICAL_SERVICE as unknown as ClinicalService;
const run = crypto.randomUUID();
const tenantId = `photo-tenant-${run}`;
const sessionId = `photo-session-${run}`;
const serviceId = `photo-service-${run}`;
const professionalId = `photo-professional-${run}`;
async function seed() {
  await db.batch([
    db
      .prepare(
        "INSERT INTO tenants (id,legal_name,display_name,document,timezone,status,created_at,updated_at) VALUES (?, 'Photo Tenant', 'Photo', ?, 'America/Sao_Paulo', 'ACTIVE', ?, ?)",
      )
      .bind(
        tenantId,
        `9${run.replaceAll('-', '').slice(0, 13)}`,
        '2029-01-01',
        '2029-01-01',
      ),
    db
      .prepare(
        "INSERT INTO customers (id,tenant_id,full_name,status,relationship_profile,blocked_for_new_appointments,created_at,updated_at) VALUES (?,?,'Photo Customer','ACTIVE','NEW',0,?,?)",
      )
      .bind(`photo-customer-${run}`, tenantId, '2029-01-01', '2029-01-01'),
    db
      .prepare(
        "INSERT INTO services (id,tenant_id,name,category,duration_minutes,base_price_cents,status,requires_photography,created_at,updated_at) VALUES (?,?,'Photo Service','GENERAL',60,10000,'ACTIVE',1,?,?)",
      )
      .bind(serviceId, tenantId, '2029-01-01', '2029-01-01'),
    db
      .prepare(
        "INSERT INTO professionals (id,tenant_id,name,status,public_visible,created_at,updated_at) VALUES (?,?,'Photo Professional','ACTIVE',1,?,?)",
      )
      .bind(professionalId, tenantId, '2029-01-01', '2029-01-01'),
    db
      .prepare(
        "INSERT INTO sessions (id,tenant_id,appointment_id,customer_id,service_id,professional_id,status,started_at,started_by,created_at,updated_at) VALUES (?,?,?,?,?,?,'IN_PROGRESS',?,?,?,?)",
      )
      .bind(
        sessionId,
        tenantId,
        `photo-appointment-${run}`,
        `photo-customer-${run}`,
        serviceId,
        professionalId,
        '2029-01-01',
        'actor-dev-admin',
        '2029-01-01',
        '2029-01-01',
      ),
  ]);
}
describe('Clinical photos without R2', () => {
  it('preserves a confirmed BEFORE in D1 without access to R2', async () => {
    await seed();
    const actorId = 'actor-dev-admin';
    expect(
      await clinical.checkSessionCompletionEligibility({
        tenantId,
        sessionId,
        actorId,
      }),
    ).toMatchObject({ status: 'BLOCKED' });
    await db
      .prepare(
        "INSERT INTO clinical_photo_attachments (id,tenant_id,session_id,purpose,object_key,content_type,size_bytes,status,uploaded_by,created_at,updated_at) VALUES (?, ?, ?, 'BEFORE', ?, 'image/jpeg', 14, 'AVAILABLE', ?, '2029-01-01','2029-01-01')",
      )
      .bind('historical-' + run, tenantId, sessionId, 'legacy/' + run, actorId)
      .run();
    expect(
      await clinical.listSessionPhotos({ tenantId, sessionId, actorId }),
    ).toHaveLength(1);
    expect(
      await clinical.evaluateSessionPhotoRequirement({
        tenantId,
        sessionId,
        actorId,
      }),
    ).toMatchObject({ status: 'REQUIRED_SATISFIED' });
    expect(
      await clinical.checkSessionCompletionEligibility({
        tenantId,
        sessionId,
        actorId,
      }),
    ).toMatchObject({ status: 'READY' });
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM idempotency_records WHERE tenant_id=? AND operation='UPLOAD_SESSION_PHOTO'",
        )
        .bind(tenantId)
        .first(),
    ).toMatchObject({ count: 0 });
  });
});
