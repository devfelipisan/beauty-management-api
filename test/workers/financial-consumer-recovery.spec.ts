import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { BuildFinancialDecisionSnapshot } from '@beauty/billing/modules/appointment-change-policies/application/build-financial-decision-snapshot';
import { D1AppointmentChangePoliciesPersistence } from '@beauty/billing/modules/appointment-change-policies/infrastructure/d1-persistence';
import { BillingAppointmentChangeDelivery } from '@beauty/operations/infrastructure/outbox/billing-appointment-change-delivery';
import { D1OutboxDeliveryRepository } from '@beauty/reliability/d1/d1-outbox-delivery-repository';
import { DispatchOutboxBatch } from '@beauty/reliability/outbox/dispatch-outbox-batch';
import type {
  AppointmentFinancialEffectEvent,
  FinancialEffectResult,
  DepositDisposition,
} from '@beauty/contracts';

type Billing = {
  applyAppointmentCanceledFinancialEffects(
    event: AppointmentFinancialEffectEvent,
  ): Promise<FinancialEffectResult>;
  applyAppointmentNoShowFinancialEffects(
    event: AppointmentFinancialEffectEvent,
  ): Promise<FinancialEffectResult>;
};
const billing = env.BILLING_SERVICE as unknown as Billing;

async function fixture(
  disposition: DepositDisposition,
): Promise<AppointmentFinancialEffectEvent> {
  const tenantId = crypto.randomUUID();
  const appointmentId = crypto.randomUUID();
  await env.D1_DATABASE.batch([
    env.D1_DATABASE.prepare(
      "INSERT INTO tenants (id,legal_name,display_name,document,timezone,status,created_at,updated_at) VALUES (?,'Recovery','Recovery',?,'UTC','ACTIVE','2028-01-01','2028-01-01')",
    ).bind(tenantId, tenantId),
    env.D1_DATABASE.prepare(
      "INSERT INTO deposits (id,tenant_id,appointment_id,amount_cents,status,confirmed_at,created_at,updated_at) VALUES (?,?,?,1000,'CONFIRMED','2028-01-01','2028-01-01','2028-01-01')",
    ).bind(crypto.randomUUID(), tenantId, appointmentId),
  ]);
  const financialDecisionSnapshot = await new BuildFinancialDecisionSnapshot(
    new D1AppointmentChangePoliciesPersistence(env.D1_DATABASE),
  ).execute({
    tenantId,
    appointmentId,
    customerId: 'fixture-customer',
    depositDisposition: disposition,
    paymentDisposition: 'NONE',
    receivableDisposition: 'KEEP',
    policyId: 'fixture-policy',
    policyVersion: 1,
    evaluatedAt: '2028-01-01T00:00:00.000Z',
    relationshipImpact: 'NONE',
  });
  return {
    eventId: crypto.randomUUID(),
    tenantId,
    appointmentId,
    customerId: 'fixture-customer',
    serviceId: 'fixture-service',
    financialDecisionSnapshot,
    correlationId: crypto.randomUUID(),
  };
}

describe('financial consumer recovery through real Billing RPC and D1', () => {
  it('recovers ACK loss without treating its own retention as a stale decision', async () => {
    const event = await fixture('RETAIN');
    await env.D1_DATABASE.prepare(
      "INSERT INTO outbox_events (id,tenant_id,event_type,aggregate_type,aggregate_id,correlation_id,payload_json,status,created_at,available_at) VALUES (?,?,'AppointmentCanceled','APPOINTMENT',?,?,?,'PENDING','2028-01-01','2028-01-01')",
    )
      .bind(
        event.eventId,
        event.tenantId,
        event.appointmentId,
        event.correlationId,
        JSON.stringify(event),
      )
      .run();
    let loseAcknowledgement = true;
    const delivery = new BillingAppointmentChangeDelivery({
      applyAppointmentCanceledFinancialEffects: async (input) => {
        const result =
          await billing.applyAppointmentCanceledFinancialEffects(input);
        if (loseAcknowledgement) {
          loseAcknowledgement = false;
          throw new Error('ACK_LOST');
        }
        return result;
      },
      applyAppointmentNoShowFinancialEffects: (input) =>
        billing.applyAppointmentNoShowFinancialEffects(input),
    });
    const dispatcher = new DispatchOutboxBatch(
      new D1OutboxDeliveryRepository(env.D1_DATABASE, ['AppointmentCanceled']),
      delivery,
    );
    expect(
      await dispatcher.execute({
        workerId: 'coordinator',
        batchSize: 1,
        leaseSeconds: 60,
        now: '2030-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({ retried: 1 });
    expect(
      await dispatcher.execute({
        workerId: 'coordinator',
        batchSize: 1,
        leaseSeconds: 60,
        now: '2030-01-01T00:01:00.000Z',
      }),
    ).toMatchObject({ sent: 1 });
    expect(
      await env.D1_DATABASE.prepare(
        'SELECT status,version FROM deposits WHERE tenant_id=? AND appointment_id=?',
      )
        .bind(event.tenantId, event.appointmentId)
        .first(),
    ).toEqual({ status: 'RETAINED', version: 2 });
    expect(
      (
        await env.D1_DATABASE.prepare(
          'SELECT COUNT(*) AS count FROM financial_reconciliation_issues WHERE tenant_id=?',
        )
          .bind(event.tenantId)
          .first<{ count: number }>()
      )?.count,
    ).toBe(0);
    expect(
      (
        await env.D1_DATABASE.prepare(
          "SELECT COUNT(*) AS count FROM audit_events WHERE tenant_id=? AND action='appointment.financial_effect_applied'",
        )
          .bind(event.tenantId)
          .first<{ count: number }>()
      )?.count,
    ).toBe(1);
  });

  it('durably reconciles unsupported effects without claiming that money moved', async () => {
    const event = await fixture('RETURN');
    const first = await billing.applyAppointmentCanceledFinancialEffects(event);
    expect(first).toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
      reason: 'FINANCIAL_EFFECT_UNAVAILABLE',
    });
    expect(
      await billing.applyAppointmentCanceledFinancialEffects(event),
    ).toEqual(first);
    expect(
      await env.D1_DATABASE.prepare(
        'SELECT status,version FROM deposits WHERE tenant_id=? AND appointment_id=?',
      )
        .bind(event.tenantId, event.appointmentId)
        .first(),
    ).toEqual({ status: 'CONFIRMED', version: 1 });
    expect(
      await env.D1_DATABASE.prepare(
        'SELECT issue_type,reason_code,status FROM financial_reconciliation_issues WHERE tenant_id=? AND source_event_id=?',
      )
        .bind(event.tenantId, event.eventId)
        .first(),
    ).toEqual({
      issue_type: 'FINANCIAL_STATE_INCONSISTENT',
      reason_code: 'FINANCIAL_EFFECT_UNAVAILABLE',
      status: 'OPEN',
    });
    expect(
      (
        await env.D1_DATABASE.prepare(
          'SELECT COUNT(*) AS count FROM financial_reconciliation_issues WHERE tenant_id=?',
        )
          .bind(event.tenantId)
          .first<{ count: number }>()
      )?.count,
    ).toBe(1);
  });

  it('persists a stale decision before returning reconciliation', async () => {
    const event = await fixture('RETAIN');
    await env.D1_DATABASE.prepare(
      'UPDATE deposits SET version=version+1 WHERE tenant_id=? AND appointment_id=?',
    )
      .bind(event.tenantId, event.appointmentId)
      .run();
    expect(
      await billing.applyAppointmentNoShowFinancialEffects(event),
    ).toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
      reason: 'DEPOSIT_VERSION_CHANGED',
    });
    const issue = await env.D1_DATABASE.prepare(
      'SELECT issue_type,expected_fingerprint,actual_fingerprint FROM financial_reconciliation_issues WHERE tenant_id=? AND source_event_id=?',
    )
      .bind(event.tenantId, event.eventId)
      .first<{
        issue_type: string;
        expected_fingerprint: string;
        actual_fingerprint: string;
      }>();
    expect(issue?.issue_type).toBe('STALE_FINANCIAL_DECISION');
    expect(issue?.expected_fingerprint).not.toBe(issue?.actual_fingerprint);
  });
});
