import { buildDevelopmentSeed, primaryTenant } from './development.mjs';

// Synthetic demonstration catalogue. Never populate transactional tables here.
// Appointment mutations must pass through Operations and its idempotency gates.
const firstNames = [
  'Alice',
  'Beatriz',
  'Carolina',
  'Daniela',
  'Elisa',
  'Fabiana',
  'Gabriela',
  'Isabela',
  'Júlia',
  'Larissa',
  'Marina',
  'Natália',
];
const lastNames = [
  'Andrade',
  'Barbosa',
  'Castro',
  'Duarte',
  'Ferreira',
  'Gomes',
  'Lopes',
  'Moraes',
  'Nogueira',
  'Pereira',
  'Ramos',
  'Teixeira',
];
const relationshipProfiles = ['NEW', 'REGULAR', 'LOYAL', 'OLD'];
const demoProfessionals = [
  ['01', 'Bianca Freitas'],
  ['02', 'Eduardo Costa'],
  ['03', 'Patrícia Moura'],
  ['04', 'Renata Alves'],
];
const demoServices = [
  ['01', 'Limpeza de pele demonstrativa', 60, 16000],
  ['02', 'Hidratação facial demonstrativa', 45, 13000],
  ['03', 'Massagem relaxante demonstrativa', 60, 18000],
  ['04', 'Manicure demonstrativa', 45, 7000],
  ['05', 'Pedicure demonstrativa', 45, 7500],
  ['06', 'Design de sobrancelhas demonstrativo', 30, 6500],
  ['07', 'Cuidados corporais demonstrativos', 60, 22000],
  ['08', 'Consulta de retorno demonstrativa', 30, 9000],
];

function sqlLiteral(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insert(table, row, conflict = ['id']) {
  return `INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(sqlLiteral).join(',')}) ON CONFLICT (${conflict.join(',')}) DO NOTHING`;
}

function utcDate(referenceDate, dayOffset, hour = 12) {
  const instant = new Date(
    Date.parse(`${referenceDate}T00:00:00.000Z`) + dayOffset * 86_400_000,
  );
  instant.setUTCHours(hour, 0, 0, 0);
  return instant.toISOString();
}

export function buildDemoDataset(
  referenceDate = new Date().toISOString().slice(0, 10),
) {
  // Reuse the authoritative seed validation instead of accepting arbitrary SQL dates.
  buildDevelopmentSeed(referenceDate);
  const createdAt = utcDate(referenceDate, 0, 0);
  const statements = [];
  const customerIds = [
    'mock-customer-maria',
    'mock-customer-joao',
    'mock-customer-luisa',
    'mock-customer-ana',
    'mock-customer-bruna',
    'mock-customer-rafael',
  ];
  for (let i = 0; i < 46; i++) {
    const suffix = String(i + 1).padStart(3, '0');
    const id = `demo-customer-${suffix}`;
    customerIds.push(id);
    statements.push(
      insert('customers', {
        id,
        tenant_id: primaryTenant,
        full_name: `${firstNames[i % firstNames.length]} ${lastNames[Math.floor(i / firstNames.length)]} (sintético)`,
        email: `demo.cliente.${suffix}@example.test`,
        status: 'ACTIVE',
        relationship_profile:
          relationshipProfiles[i % relationshipProfiles.length],
        blocked_for_new_appointments: 0,
        created_at: createdAt,
        updated_at: createdAt,
      }),
    );
  }

  const associations = [];
  const professionalIds = [
    'mock-professional-ana',
    'mock-professional-bruno',
    'mock-professional-camila',
  ];
  for (const [suffix, name] of demoProfessionals) {
    const id = `demo-professional-${suffix}`;
    professionalIds.push(id);
    statements.push(
      insert('professionals', {
        id,
        tenant_id: primaryTenant,
        name: `${name} (sintético)`,
        status: 'ACTIVE',
        public_visible: 1,
        created_at: createdAt,
        updated_at: createdAt,
      }),
    );
    for (const service of demoServices) {
      associations.push(
        insert(
          'professional_services',
          {
            tenant_id: primaryTenant,
            professional_id: id,
            service_id: `demo-service-${service[0]}`,
            created_at: createdAt,
          },
          ['tenant_id', 'professional_id', 'service_id'],
        ),
      );
    }
    associations.push(
      insert(
        'professional_services',
        {
          tenant_id: primaryTenant,
          professional_id: id,
          service_id: 'mock-service-consulta',
          created_at: createdAt,
        },
        ['tenant_id', 'professional_id', 'service_id'],
      ),
    );
  }
  for (const [suffix, name, duration, price] of demoServices) {
    statements.push(
      insert('services', {
        id: `demo-service-${suffix}`,
        tenant_id: primaryTenant,
        name,
        category: 'GENERAL',
        duration_minutes: duration,
        base_price_cents: price,
        status: 'ACTIVE',
        requires_assessment: 0,
        allows_discount: 0,
        requires_equipment: 0,
        requires_photography: 0,
        has_technical_form: 0,
        deposit_mode: 'NOT_REQUIRED',
        created_at: createdAt,
        updated_at: createdAt,
      }),
    );
  }
  // Insert services before their links so future FK enforcement stays valid.
  statements.push(...associations);
  const appointments = [];
  for (let day = 1; day <= 30; day++) {
    for (let slot = 0; slot < 6; slot++) {
      const index = (day - 1) * 6 + slot;
      const professionalId =
        professionalIds[(day + slot) % professionalIds.length];
      const serviceId = professionalId.startsWith('demo-')
        ? `demo-service-${demoServices[(day + slot) % demoServices.length][0]}`
        : 'mock-service-consulta';
      const startsAt = utcDate(referenceDate, day, 12 + (slot % 3) * 2);
      appointments.push({
        id: `demo-appointment-${String(index + 1).padStart(3, '0')}`,
        idempotencyKey: `demo-v1-${referenceDate}-${String(index + 1).padStart(3, '0')}`,
        tenantId: primaryTenant,
        body: {
          customerId: customerIds[index % customerIds.length],
          serviceId,
          professionalId,
          startsAt,
          origin: 'RECEPTION',
        },
        confirm: index % 3 !== 0,
      });
    }
  }
  return {
    statements,
    manifest: {
      version: 1,
      synthetic: true,
      localOnly: true,
      referenceDate,
      tenantId: primaryTenant,
      totals: {
        tenants: 2,
        customers: 60,
        professionals: 8,
        services: 15,
        appointments: 180,
      },
      extraCatalogue: { customers: 46, professionals: 4, services: 8 },
      plannedStatuses: { awaitingConfirmation: 60, confirmed: 120 },
      appointments,
    },
  };
}
