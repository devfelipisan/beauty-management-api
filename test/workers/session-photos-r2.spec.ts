import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

type ClinicalService = {
  uploadSessionPhoto(input: Record<string, unknown>): Promise<any>;
  listSessionPhotos(input: Record<string, unknown>): Promise<any[]>;
  getClinicalPhoto(input: Record<string, unknown>): Promise<any>;
  evaluateSessionPhotoRequirement(input: Record<string, unknown>): Promise<any>;
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
const jpeg = () =>
  new Response(
    new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9,
    ]),
  ).body!;
async function approveCapacity() {
  await db.batch([
    db.prepare(
      "UPDATE media_capacity SET inventory_approved=1,policy_approved=1,writers_coordinated=1,approval_reference='test-fixture' WHERE bucket='beauty-r2'",
    ),
    db
      .prepare(
        'INSERT INTO tenant_media_capacity (tenant_id,limit_bytes) VALUES (?,1000000)',
      )
      .bind(tenantId),
  ]);
}
describe('Session photos on the real workerd R2 binding', () => {
  it('persists metadata, streams bytes and is idempotent', async () => {
    await seed();
    await approveCapacity();
    const input = {
      tenantId,
      sessionId,
      purpose: 'BEFORE',
      contentType: 'image/jpeg',
      contentLength: 14,
      actorId: 'actor-dev-admin',
      idempotencyKey: `photo-${run}`,
      requestId: `request-${run}`,
      correlationId: `correlation-${run}`,
      body: jpeg(),
      maxBytes: 1024,
    };
    const first = await clinical.uploadSessionPhoto(input);
    const replay = await clinical.uploadSessionPhoto({
      ...input,
      body: jpeg(),
    });
    expect(first).toMatchObject({
      status: 'AVAILABLE',
      purpose: 'BEFORE',
      sizeBytes: 14,
    });
    expect(replay).toEqual(first);
    expect(
      await clinical.listSessionPhotos({
        tenantId,
        sessionId,
        actorId: 'actor-dev-admin',
      }),
    ).toHaveLength(1);
    const read = await clinical.getClinicalPhoto({
      tenantId,
      sessionId,
      photoId: first.id,
      actorId: 'actor-dev-admin',
    });
    expect(
      new Uint8Array(await new Response(read.object.body).arrayBuffer())[0],
    ).toBe(0xff);
    expect(
      await clinical.evaluateSessionPhotoRequirement({
        tenantId,
        sessionId,
        actorId: 'actor-dev-admin',
      }),
    ).toMatchObject({ status: 'REQUIRED_SATISFIED' });
    expect(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM audit_events WHERE tenant_id = ? AND resource_id = ? AND action = 'SessionPhotoUploaded'",
          )
          .bind(tenantId, first.id)
          .first<{ count: number }>()
      )?.count,
    ).toBe(1);
  });
});
