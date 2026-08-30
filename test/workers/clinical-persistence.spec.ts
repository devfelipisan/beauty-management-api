import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { CheckAppointmentEligibility } from '../../apps/operations-worker/src/appointment-eligibility/application/check-appointment-eligibility.js';
import { ClinicalServiceBindingAssessmentEligibilityAdapter } from '../../apps/operations-worker/src/appointment-eligibility/adapters/clinical-service-binding-assessment-eligibility.js';
import { CustomerRestrictionAdapter } from '../../apps/operations-worker/src/appointment-eligibility/adapters/customer-restriction.js';
import { D1ProfessionalServiceEligibility } from '../../apps/operations-worker/src/appointment-eligibility/adapters/d1-professional-service-eligibility.js';
import { D1AvailabilityRepository } from '../../apps/operations-worker/src/appointments/adapters/d1-availability-repository.js';
import { D1CustomerRepository } from '../../apps/operations-worker/src/customers/adapters/d1-customer-repository.js';
import { D1ProfessionalRepository } from '../../apps/operations-worker/src/professionals/adapters/d1-professional-repository.js';
import { D1ServiceRepository } from '../../apps/operations-worker/src/services/adapters/d1-service-repository.js';
import { D1TenantRepository } from '../../apps/operations-worker/src/tenants/adapters/d1-tenant-repository.js';
import { D1LicenseRepository } from '../../apps/operations-worker/src/licensing/adapters/d1-license-repository.js';
import { D1LicenseEligibilityAdapter, D1PlanLimitAdapter } from '../../apps/operations-worker/src/licensing/adapters/appointment-admission-adapters.js';
import { invokeClinicalAssessment } from '../../apps/operations-worker/src/worker.js';

const db = env.D1_DATABASE;
const run = crypto.randomUUID();
const ids = { tenant: `clinical-proof-tenant-a-${run}`, otherTenant: `clinical-proof-tenant-b-${run}`, customer: `clinical-proof-customer-a-${run}`, service: `clinical-proof-service-a-${run}`, otherService: `clinical-proof-service-b-${run}`, noAssessmentService: `clinical-proof-service-no-assessment-${run}`, professional: `clinical-proof-professional-a-${run}` };

async function seedFoundation() {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO tenants (id, legal_name, display_name, document, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)").bind(ids.tenant, 'Clinical Tenant A', 'Clinical A', '11111111111111', 'America/Sao_Paulo', '2026-01-01', '2026-01-01'),
    db.prepare("INSERT OR IGNORE INTO tenants (id, legal_name, display_name, document, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)").bind(ids.otherTenant, 'Clinical Tenant B', 'Clinical B', '22222222222222', 'America/Sao_Paulo', '2026-01-01', '2026-01-01'),
    db.prepare("INSERT OR IGNORE INTO customers (id, tenant_id, full_name, status, relationship_profile, blocked_for_new_appointments, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', 'NEW', 0, ?, ?)").bind(ids.customer, ids.tenant, 'Customer A', '2026-01-01', '2026-01-01'),
    db.prepare("INSERT OR IGNORE INTO services (id, tenant_id, name, category, duration_minutes, base_price_cents, status, requires_assessment, created_at, updated_at) VALUES (?, ?, ?, 'GENERAL', 60, 10000, 'ACTIVE', 1, ?, ?)").bind(ids.service, ids.tenant, 'Service A', '2026-01-01', '2026-01-01'),
    db.prepare("INSERT OR IGNORE INTO services (id, tenant_id, name, category, duration_minutes, base_price_cents, status, requires_assessment, created_at, updated_at) VALUES (?, ?, ?, 'GENERAL', 60, 10000, 'ACTIVE', 1, ?, ?)").bind(ids.otherService, ids.tenant, 'Service B', '2026-01-01', '2026-01-01'),
    db.prepare("INSERT OR IGNORE INTO services (id, tenant_id, name, category, duration_minutes, base_price_cents, status, requires_assessment, created_at, updated_at) VALUES (?, ?, ?, 'GENERAL', 60, 10000, 'ACTIVE', 0, ?, ?)").bind(ids.noAssessmentService, ids.tenant, 'Service Without Assessment', '2026-01-01', '2026-01-01'),
    db.prepare("INSERT OR IGNORE INTO professionals (id, tenant_id, name, status, public_visible, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', 1, ?, ?)").bind(ids.professional, ids.tenant, 'Professional A', '2026-01-01', '2026-01-01'),
    db.prepare('INSERT OR IGNORE INTO professional_services (tenant_id, professional_id, service_id, created_at) VALUES (?, ?, ?, ?)').bind(ids.tenant, ids.professional, ids.service, '2026-01-01'),
    db.prepare('INSERT OR IGNORE INTO professional_services (tenant_id, professional_id, service_id, created_at) VALUES (?, ?, ?, ?)').bind(ids.tenant, ids.professional, ids.noAssessmentService, '2026-01-01'),
    db.prepare("INSERT OR IGNORE INTO licenses (id, tenant_id, plan_id, starts_at, status, limits_json, enabled_resources_json) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)").bind(`clinical-proof-license-a-${run}`, ids.tenant, 'plan-proof', '2026-01-01T00:00:00.000Z', '{}', '["APPOINTMENT_ADMISSION"]'),
  ]);
}

function assessment(id: string, tenantId: string, customerId: string, serviceId: string, result: string, performedAt: string, validUntil: string | null = null) {
  return db.prepare('INSERT INTO assessments (id, tenant_id, customer_id, service_id, professional_id, result, performed_at, valid_until, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, tenantId, customerId, serviceId, ids.professional, result, performedAt, validUntil, performedAt);
}

describe('Clinical persistence qualification through the real Service Binding and D1', () => {
  it('reads APTO, APTO_COM_RESTRICOES and NAO_APTO from D1 and honors latest/validity', async () => {
    await seedFoundation();
    const input = { tenantId: ids.tenant, customerId: ids.customer, serviceId: ids.service, professionalId: ids.professional, correlationId: 'clinical-correlation-proof' };

    await db.batch([assessment(`clinical-proof-apt-${run}`, ids.tenant, ids.customer, ids.service, 'APTO', '2026-01-01T10:00:00.000Z')]);
    expect(await invokeClinicalAssessment(env as never, input)).toMatchObject({ eligible: true, result: 'APTO' });

    await db.batch([assessment(`clinical-proof-restricted-${run}`, ids.tenant, ids.customer, ids.service, 'APTO_COM_RESTRICOES', '2026-01-01T11:00:00.000Z')]);
    expect(await invokeClinicalAssessment(env as never, input)).toMatchObject({ eligible: true, result: 'APTO_COM_RESTRICOES' });

    await db.batch([assessment(`clinical-proof-unfit-${run}`, ids.tenant, ids.customer, ids.service, 'NAO_APTO', '2026-01-01T12:00:00.000Z')]);
    expect(await invokeClinicalAssessment(env as never, input)).toMatchObject({ eligible: false, result: 'NAO_APTO' });

    await db.batch([assessment(`clinical-proof-expired-${run}`, ids.tenant, ids.customer, ids.service, 'APTO', '2026-01-01T13:00:00.000Z', '2020-01-01T00:00:00.000Z')]);
    expect(await invokeClinicalAssessment(env as never, input)).toMatchObject({ eligible: false, result: 'APTO' });
  });

  it('is tenant, service and customer scoped and does not use another tenant assessment', async () => {
    await seedFoundation();
    await db.batch([
      assessment(`clinical-proof-cross-tenant-${run}`, ids.otherTenant, ids.customer, ids.service, 'APTO', '2026-02-01T10:00:00.000Z'),
      assessment(`clinical-proof-cross-service-${run}`, ids.tenant, ids.customer, ids.otherService, 'APTO', '2026-02-01T11:00:00.000Z'),
    ]);

    expect(await invokeClinicalAssessment(env as never, { tenantId: ids.tenant, customerId: ids.customer, serviceId: ids.service, professionalId: ids.professional })).toMatchObject({ eligible: false });
    expect(await invokeClinicalAssessment(env as never, { tenantId: ids.tenant, customerId: 'clinical-proof-customer-b', serviceId: ids.service, professionalId: ids.professional })).toMatchObject({ eligible: false });
  });

  it('integrates the APTO assessment into AppointmentEligibility and short-circuits Clinical for a non-required service', async () => {
    await seedFoundation();
    await db.batch([assessment(`clinical-proof-integrated-${run}`, ids.tenant, ids.customer, ids.service, 'APTO', '2026-03-01T10:00:00.000Z')]);
    const licenseRepository = new D1LicenseRepository(db);
    const eligibility = new CheckAppointmentEligibility(
      new D1TenantRepository(db), new D1CustomerRepository(db), new D1ServiceRepository(db), new D1ProfessionalRepository(db),
      new D1AvailabilityRepository(db), new D1ProfessionalServiceEligibility(db), new D1LicenseEligibilityAdapter(licenseRepository),
      new ClinicalServiceBindingAssessmentEligibilityAdapter(env.CLINICAL_SERVICE as never), new CustomerRestrictionAdapter(new D1CustomerRepository(db)),
      new D1PlanLimitAdapter(licenseRepository),
    );

    expect((await eligibility.execute({ tenantId: ids.tenant, customerId: ids.customer, serviceId: ids.service, professionalId: ids.professional, startsAt: '2027-01-01T10:00:00.000Z', endsAt: '2027-01-01T11:00:00.000Z' })).status).toBe('READY');
    expect((await eligibility.execute({ tenantId: ids.tenant, customerId: ids.customer, serviceId: ids.noAssessmentService, professionalId: ids.professional, startsAt: '2027-01-01T12:00:00.000Z', endsAt: '2027-01-01T13:00:00.000Z' })).status).toBe('READY');
  });
});
