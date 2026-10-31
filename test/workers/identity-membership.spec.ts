import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { D1TenantMembershipProvider } from '@beauty/tenancy/adapters/d1-tenant-membership-provider';
import { workerSecurity } from '@beauty/tenancy/adapters/worker-security';
import { authorizeWorkerRpc } from '@beauty/tenancy/adapters/rpc-security';

describe('D1 identity, membership and current grants', () => {
  it('accepts only matching persisted system events and reconstructs authoritative data', async () => {
    const id = crypto.randomUUID();
    const tenantId = `event-tenant-${id}`;
    const payload = {
      tenantId,
      appointmentId: 'appointment',
      depositId: 'deposit',
      amountCents: 123,
    };
    await env.D1_DATABASE.prepare(
      "INSERT INTO outbox_events (id,tenant_id,event_type,aggregate_type,aggregate_id,correlation_id,payload_json,status,created_at) VALUES (?,?,'DepositConfirmed','DEPOSIT','deposit','correlation',?,'PENDING','2028-01-01')",
    )
      .bind(id, tenantId, JSON.stringify(payload))
      .run();
    const production = {
      D1_DATABASE: env.D1_DATABASE,
      APP_ENV: 'production',
      AUTH_PROVIDER: 'jwt',
    };
    const input = {
      tenantId,
      appointmentId: 'appointment',
      depositId: 'deposit',
      eventId: id,
      correlationId: 'untrusted',
    };
    const accepted = await authorizeWorkerRpc(
      production,
      { eventType: 'DepositConfirmed' },
      input,
    );
    expect(accepted.input).toEqual({
      ...payload,
      eventId: id,
      correlationId: 'correlation',
    });
    await expect(
      authorizeWorkerRpc(
        production,
        { eventType: 'DepositConfirmed' },
        { ...input, amountCents: 999 },
      ),
    ).rejects.toThrow('PERMISSION_DENIED');
    await expect(
      authorizeWorkerRpc(
        production,
        { eventType: 'DepositConfirmed' },
        { ...input, tenantId: 'another-tenant' },
      ),
    ).rejects.toThrow('PERMISSION_DENIED');
    await expect(
      authorizeWorkerRpc(production, { eventType: 'DepositExpired' }, input),
    ).rejects.toThrow('PERMISSION_DENIED');
  });
  it('requires an active identity, tenant and membership and observes revocation immediately', async () => {
    const id = crypto.randomUUID();
    const db = env.D1_DATABASE;
    const directory = new D1TenantMembershipProvider(db);
    await db.batch([
      db
        .prepare(
          "INSERT INTO tenants (id,legal_name,display_name,document,timezone,status,created_at,updated_at) VALUES (?, 'Identity', 'Identity', ?, 'UTC', 'ACTIVE', 'now', 'now')",
        )
        .bind(id, id),
      db
        .prepare(
          "INSERT INTO identities (id,issuer,subject,active,created_at,updated_at) VALUES (?, 'https://identity.test', ?, 1, 'now', 'now')",
        )
        .bind(id, id),
      db
        .prepare(
          "INSERT INTO tenant_memberships (tenant_id,actor_id,active,created_at,updated_at) VALUES (?,?,1,'now','now')",
        )
        .bind(id, id),
      db
        .prepare(
          "INSERT INTO roles (tenant_id,name,active) VALUES (?,'reader',1)",
        )
        .bind(id),
      db.prepare(
        "INSERT OR IGNORE INTO permissions (code) VALUES ('customer.read')",
      ),
      db
        .prepare(
          "INSERT INTO role_permissions (tenant_id,role_name,permission_code) VALUES (?,'reader','customer.read')",
        )
        .bind(id),
      db
        .prepare(
          "INSERT INTO membership_roles (tenant_id,actor_id,role_name) VALUES (?,?,'reader')",
        )
        .bind(id, id),
    ]);
    expect(await directory.findIdentity('https://identity.test', id)).toEqual({
      actorId: id,
      subject: id,
    });
    expect(await directory.findIdentity('https://other.test', id)).toBeNull();
    expect(
      await directory.findActiveMembership(id, 'another-tenant'),
    ).toBeNull();
    expect(await directory.findActiveMembership(id, id)).toMatchObject({
      permissions: ['customer.read'],
      roles: ['reader'],
    });
    await db
      .prepare('DELETE FROM role_permissions WHERE tenant_id=?')
      .bind(id)
      .run();
    expect(await directory.findActiveMembership(id, id)).toMatchObject({
      permissions: [],
    });
    await db
      .prepare(
        'UPDATE tenant_memberships SET active=0 WHERE tenant_id=? AND actor_id=?',
      )
      .bind(id, id)
      .run();
    expect(await directory.findActiveMembership(id, id)).toBeNull();
    await db
      .prepare(
        'UPDATE tenant_memberships SET active=1 WHERE tenant_id=? AND actor_id=?',
      )
      .bind(id, id)
      .run();
    await db
      .prepare("UPDATE tenants SET status='SUSPENDED' WHERE id=?")
      .bind(id)
      .run();
    expect(await directory.findActiveMembership(id, id)).toBeNull();
    await db
      .prepare('UPDATE identities SET active=0 WHERE id=?')
      .bind(id)
      .run();
    expect(
      await directory.findIdentity('https://identity.test', id),
    ).toBeNull();
  });

  it('does not fall back to mocks with missing or remote configuration', () => {
    expect(() => workerSecurity({ D1_DATABASE: env.D1_DATABASE })).toThrow(
      'INVALID_AUTHENTICATION_CONFIGURATION',
    );
    expect(() =>
      workerSecurity({
        D1_DATABASE: env.D1_DATABASE,
        APP_ENV: 'production',
        AUTH_PROVIDER: 'mock',
      }),
    ).toThrow('INVALID_AUTHENTICATION_CONFIGURATION');
  });
});
