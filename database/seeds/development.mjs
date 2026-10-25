// Synthetic development fixtures, not product defaults or medical guidance.
// No appointments, financial movements, audit events or outbox events are fabricated.
export const primaryTenant = 'tenant-dev-001';
export const secondaryTenant = 'tenant-other';
export const anchorService = 'mock-service-consulta';

const literal = (value) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${String(value).replaceAll("'", "''")}'`;

export function buildDevelopmentSeed(
  referenceDate = new Date().toISOString().slice(0, 10),
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) ||
    !Number.isFinite(Date.parse(referenceDate)) ||
    new Date(referenceDate).toISOString().slice(0, 10) !== referenceDate
  )
    throw new Error('Data de referência inválida (YYYY-MM-DD).');
  const day = (offset) =>
    new Date(
      Date.parse(`${referenceDate}T00:00:00.000Z`) + offset * 86400000,
    ).toISOString();
  const at = day(0);
  const records = [];
  const add = (table, row, conflict = ['id']) =>
    records.push({ table, row, conflict });
  for (const [id, display, document] of [
    [primaryTenant, 'Clínica Aurora — ambiente sintético', 'MOCK-TENANT-001'],
    [
      secondaryTenant,
      'Clínica Horizonte — isolamento sintético',
      'MOCK-TENANT-OTHER',
    ],
  ]) {
    add('tenants', {
      id,
      legal_name: display,
      display_name: display,
      document,
      timezone: 'America/Sao_Paulo',
      status: 'ACTIVE',
      created_at: at,
      updated_at: at,
    });
    add('licenses', {
      id: `mock-license-${id}`,
      tenant_id: id,
      plan_id: 'plan-appointment',
      starts_at: day(-30),
      expires_at: day(365),
      status: 'ACTIVE',
      limits_json: '{}',
      enabled_resources_json: '["APPOINTMENT_ADMISSION"]',
    });
  }

  const customers = [
    ['maria', 'Maria Clara Almeida', 'NEW', 'ACTIVE', 0],
    ['joao', 'João Pedro Santos', 'LOYAL', 'ACTIVE', 0],
    ['luisa', "Luísa D'Ávila", 'REGULAR', 'ACTIVE', 0],
    ['ana', 'Ana Beatriz Lima', 'OLD', 'ACTIVE', 0],
    ['bruna', 'Bruna Carvalho', 'NEW', 'ACTIVE', 0],
    ['rafael', 'Rafael Oliveira', 'REGULAR', 'ACTIVE', 0],
    ['perfil-inativo', 'Helena Costa', 'INACTIVE', 'ACTIVE', 0],
    ['faltas', 'Marcos Pereira', 'RECURRING_ABSENCES', 'ACTIVE', 0],
    ['bloqueado', 'Paula Ribeiro', 'OLD', 'ACTIVE', 1],
    ['inativo', 'Ricardo Mendes', 'OLD', 'INACTIVE', 0],
    ['avaliacao-vencida', 'Fernanda Martins', 'OLD', 'ACTIVE', 0],
    ['nao-apto', 'Carlos Eduardo Rocha', 'NEW', 'ACTIVE', 0],
    ['sem-avaliacao', 'Juliana Ferreira', 'NEW', 'ACTIVE', 0],
  ];
  for (const [key, name, profile, status, blocked] of customers)
    add('customers', {
      id: `mock-customer-${key}`,
      tenant_id: primaryTenant,
      full_name: `${name} (sintético)`,
      email: `${key}@example.test`,
      status,
      relationship_profile: profile,
      blocked_for_new_appointments: blocked,
      created_at: at,
      updated_at: at,
    });
  add('customers', {
    id: 'mock-customer-outro-tenant',
    tenant_id: secondaryTenant,
    full_name: 'Cliente de isolamento (sintético)',
    status: 'ACTIVE',
    relationship_profile: 'NEW',
    blocked_for_new_appointments: 0,
    created_at: at,
    updated_at: at,
  });

  for (const [key, name, status] of [
    ['ana', 'Ana Souza', 'ACTIVE'],
    ['bruno', 'Bruno Nascimento', 'ACTIVE'],
    ['camila', 'Camila Azevedo', 'ACTIVE'],
    ['inativo', 'Roberto Dias', 'INACTIVE'],
  ])
    add('professionals', {
      id: `mock-professional-${key}`,
      tenant_id: primaryTenant,
      name: `${name} (sintético)`,
      status,
      public_visible: 1,
      created_at: at,
      updated_at: at,
    });
  const services = [
    ['consulta', 'Consulta estética de acompanhamento', 60, 20000, {}],
    [
      'avaliacao',
      'Atendimento com avaliação obrigatória',
      30,
      10000,
      { requires_assessment: 1 },
    ],
    [
      'procedimento',
      'Procedimento demonstrativo com ficha e equipamento',
      60,
      30000,
      { requires_assessment: 1, requires_equipment: 1, has_technical_form: 1 },
    ],
    [
      'sinal',
      'Atendimento com sinal percentual de demonstração',
      45,
      25000,
      { deposit_mode: 'PERCENTAGE', deposit_percentage_basis_points: 2000 },
    ],
    [
      'desconto',
      'Atendimento com benefício de demonstração',
      60,
      20000,
      { allows_discount: 1, minimum_price_cents: 18000 },
    ],
    [
      'inativo',
      'Serviço desativado de demonstração',
      30,
      10000,
      { status: 'INACTIVE' },
    ],
  ];
  for (const [key, name, duration, price, extra] of services)
    add('services', {
      id: `mock-service-${key}`,
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
      created_at: at,
      updated_at: at,
      ...extra,
    });
  add('services', {
    id: 'mock-service-outro-tenant',
    tenant_id: secondaryTenant,
    name: 'Serviço de isolamento sintético',
    category: 'GENERAL',
    duration_minutes: 30,
    base_price_cents: 10000,
    status: 'ACTIVE',
    created_at: at,
    updated_at: at,
  });

  for (const [professional, keys] of [
    ['ana', services.map((s) => s[0])],
    ['bruno', ['consulta', 'sinal', 'desconto']],
    ['camila', ['consulta']],
    ['inativo', ['consulta']],
  ]) {
    for (const key of keys)
      add(
        'professional_services',
        {
          tenant_id: primaryTenant,
          professional_id: `mock-professional-${professional}`,
          service_id: `mock-service-${key}`,
          created_at: at,
        },
        ['tenant_id', 'professional_id', 'service_id'],
      );
  }
  for (const [customer, result, expiry] of [
    ['maria', 'APTO', 30],
    ['avaliacao-vencida', 'APTO', -1],
    ['nao-apto', 'NAO_APTO', 30],
  ]) {
    for (const service of ['avaliacao', 'procedimento'])
      add('assessments', {
        id: `mock-assessment-${customer}-${service}`,
        tenant_id: primaryTenant,
        customer_id: `mock-customer-${customer}`,
        service_id: `mock-service-${service}`,
        professional_id: 'mock-professional-ana',
        result,
        performed_at: day(expiry < 0 ? -60 : -7),
        valid_until: day(expiry),
        created_at: at,
      });
  }
  add('discount_policies', {
    id: 'mock-discount-loyal',
    tenant_id: primaryTenant,
    customer_profile: 'LOYAL',
    discount_type: 'PERCENTAGE',
    discount_value: 1000,
    eligible_services_json: '["mock-service-desconto"]',
    requires_approval: 0,
    single_use: 0,
    stackable: 0,
    priority: 1,
    valid_from: day(-30),
    valid_until: day(365),
    created_at: at,
    updated_at: at,
  });
  add('technical_forms', {
    id: 'mock-form-procedimento',
    tenant_id: primaryTenant,
    service_id: 'mock-service-procedimento',
    version: 1,
    status: 'ACTIVE',
    created_at: at,
    created_by: 'actor-dev-admin',
  });
  add('technical_form_fields', {
    id: 'mock-field-observacao',
    tenant_id: primaryTenant,
    form_id: 'mock-form-procedimento',
    field_key: 'observacao',
    name: 'Observação da simulação',
    field_type: 'SHORT_TEXT',
    field_order: 1,
    required: 1,
    status: 'ACTIVE',
  });
  add('technical_form_fields', {
    id: 'mock-field-conforto',
    tenant_id: primaryTenant,
    form_id: 'mock-form-procedimento',
    field_key: 'conforto',
    name: 'Conforto informado na simulação',
    field_type: 'INTEGER',
    field_order: 2,
    required: 0,
    minimum: '0',
    maximum: '10',
    status: 'ACTIVE',
  });
  for (const [key, name, status] of [
    ['disponivel', 'Equipamento demonstrativo A', 'AVAILABLE'],
    ['manutencao', 'Equipamento demonstrativo B', 'MAINTENANCE'],
  ]) {
    add('equipment', {
      id: `mock-equipment-${key}`,
      tenant_id: primaryTenant,
      name,
      model: 'MODELO-MOCK',
      serial_number: `MOCK-${key}`,
      status,
      notes:
        'Equipamento fictício. Não representa dispositivo ou protocolo clínico real.',
      created_at: at,
      updated_at: at,
    });
    add(
      'equipment_service_compatibility',
      {
        tenant_id: primaryTenant,
        equipment_id: `mock-equipment-${key}`,
        service_id: 'mock-service-procedimento',
        created_at: at,
      },
      ['tenant_id', 'equipment_id', 'service_id'],
    );
  }

  // Check global fixture IDs before writing. No fixture may silently adopt another tenant's row.
  const guards = records
    .filter(({ row }) => row.id && row.tenant_id)
    .map(
      ({ table, row }) =>
        `SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM ${table} WHERE id=${literal(row.id)} AND tenant_id<>${literal(row.tenant_id)}) THEN 1 ELSE json('MOCK_SEED_TENANT_COLLISION') END`,
    );
  const inserts = records.map(({ table, row, conflict }) => {
    const values = Object.values(row).map(literal).join(',');
    // Do not supersede an existing tenant license by introducing a newer fixture.
    const source =
      table === 'licenses'
        ? `SELECT ${values} WHERE NOT EXISTS (SELECT 1 FROM licenses WHERE tenant_id=${literal(row.tenant_id)})`
        : `VALUES (${values})`;
    return `INSERT INTO ${table} (${Object.keys(row).join(',')}) ${source} ON CONFLICT (${conflict.join(',')}) DO NOTHING`;
  });
  const scenarios = [
    ['consulta', 'Consulta sem sinal', {}, 201, null],
    [
      'desconto',
      'Cliente fidelizado com desconto de demonstração',
      { customerId: 'mock-customer-joao', serviceId: 'mock-service-desconto' },
      201,
      null,
    ],
    [
      'sinal',
      'Agendamento aguardando sinal',
      { serviceId: 'mock-service-sinal' },
      201,
      null,
    ],
    [
      'avaliacao-valida',
      'Avaliação válida',
      { serviceId: 'mock-service-avaliacao' },
      201,
      null,
    ],
    [
      'procedimento',
      'Ficha técnica e equipamento necessários na sessão',
      { serviceId: 'mock-service-procedimento' },
      201,
      null,
    ],
    [
      'cliente-inativo',
      'Cliente operacionalmente inativo',
      { customerId: 'mock-customer-inativo' },
      500,
      'CUSTOMER_INACTIVE',
    ],
    [
      'cliente-bloqueado',
      'Cliente bloqueado para novo agendamento',
      { customerId: 'mock-customer-bloqueado' },
      500,
      'CUSTOMER_RESTRICTED',
    ],
    [
      'servico-inativo',
      'Serviço inativo',
      { serviceId: 'mock-service-inativo' },
      500,
      'SERVICE_INACTIVE',
    ],
    [
      'profissional-inativo',
      'Profissional inativo',
      { professionalId: 'mock-professional-inativo' },
      500,
      'PROFESSIONAL_INACTIVE',
    ],
    [
      'profissional-incompativel',
      'Profissional sem vínculo com serviço',
      {
        professionalId: 'mock-professional-camila',
        serviceId: 'mock-service-avaliacao',
      },
      500,
      'PROFESSIONAL_NOT_ENABLED',
    ],
    [
      'avaliacao-vencida',
      'Avaliação vencida',
      {
        customerId: 'mock-customer-avaliacao-vencida',
        serviceId: 'mock-service-avaliacao',
      },
      400,
      'ASSESSMENT_INVALID',
    ],
    [
      'sem-avaliacao',
      'Avaliação obrigatória ausente',
      {
        customerId: 'mock-customer-sem-avaliacao',
        serviceId: 'mock-service-avaliacao',
      },
      400,
      'ASSESSMENT_INVALID',
    ],
    [
      'nao-apto',
      'Avaliação não apta',
      {
        customerId: 'mock-customer-nao-apto',
        serviceId: 'mock-service-avaliacao',
      },
      400,
      'ASSESSMENT_INVALID',
    ],
  ].map(([id, description, overrides, status, code], index) => ({
    id,
    description,
    method: 'POST',
    path: `/tenants/${primaryTenant}/appointments`,
    headers: { 'Idempotency-Key': `mock-scenario-${id}` },
    body: {
      customerId: 'mock-customer-maria',
      serviceId: anchorService,
      professionalId: 'mock-professional-ana',
      startsAt: day(7 + index).replace('T00:', 'T12:'),
      origin: 'RECEPTION',
      ...overrides,
    },
    expected: { status, ...(code ? { code } : {}) },
  }));
  return {
    statements: [...guards, ...inserts],
    manifest: {
      version: 1,
      referenceDate,
      tenantId: primaryTenant,
      authorization: 'Bearer actor-dev-admin',
      synthetic: true,
      overwrite: false,
      behaviorBaseline:
        'current-runtime; HTTP status divergences are findings, not desired business rules',
      counts: records.reduce(
        (counts, { table }) => ({
          ...counts,
          [table]: (counts[table] ?? 0) + 1,
        }),
        {},
      ),
      records: records.map(({ table, row }) => ({ table, ...row })),
      scenarios,
    },
  };
}
