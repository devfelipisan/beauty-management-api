export type DemoCatalogKind = 'customers' | 'professionals' | 'services';
export type DemoCatalogInput =
  | { kind: 'customers'; fullName: string; phone: string; email?: string }
  | {
      kind: 'professionals';
      displayName: string;
      specialty?: string;
      active: boolean;
      serviceIds: string[];
    }
  | {
      kind: 'services';
      name: string;
      category: string;
      durationMinutes: number;
      priceCents: number;
      active: boolean;
      professionalIds: string[];
      assessmentRequired: boolean;
      deposit: {
        required: boolean;
        type: 'none' | 'fixed' | 'percentage';
        value: number;
      };
    };

export function parseDemoCatalogInput(
  kind: DemoCatalogKind,
  value: unknown,
): DemoCatalogInput {
  const invalid = (): never => {
    throw new Error('VALIDATION_ERROR');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return invalid();
  const row = value as Record<string, unknown>;
  const text = (key: string, required = true): string | undefined => {
    if (!required && row[key] === undefined) return undefined;
    if (
      typeof row[key] !== 'string' ||
      (required && !row[key].trim()) ||
      row[key].length > 500
    )
      return invalid();
    return row[key].trim();
  };
  const flag = (key: string, fallback: boolean) =>
    row[key] === undefined
      ? fallback
      : typeof row[key] === 'boolean'
        ? row[key]
        : invalid();
  const ids = (key: string): string[] => {
    const items = row[key] ?? [];
    if (
      !Array.isArray(items) ||
      items.length > 100 ||
      !items.every(
        (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id),
      ) ||
      new Set(items).size !== items.length
    )
      return invalid();
    return [...items].sort();
  };
  const allowed =
    kind === 'customers'
      ? ['fullName', 'phone', 'email']
      : kind === 'professionals'
        ? ['displayName', 'specialty', 'active', 'serviceIds']
        : [
            'name',
            'category',
            'durationMinutes',
            'priceCents',
            'active',
            'professionalIds',
            'assessmentRequired',
            'deposit',
          ];
  if (Object.keys(row).some((key) => !allowed.includes(key))) return invalid();
  if (kind === 'customers')
    return {
      kind,
      fullName: text('fullName')!,
      phone: text('phone')!,
      email: text('email', false),
    };
  if (kind === 'professionals')
    return {
      kind,
      displayName: text('displayName')!,
      specialty: text('specialty', false),
      active: flag('active', true),
      serviceIds: ids('serviceIds'),
    };
  const durationMinutes = row.durationMinutes;
  const priceCents = row.priceCents;
  if (
    typeof durationMinutes !== 'number' ||
    !Number.isSafeInteger(durationMinutes) ||
    durationMinutes < 1 ||
    typeof priceCents !== 'number' ||
    !Number.isSafeInteger(priceCents) ||
    priceCents < 0
  )
    return invalid();
  let deposit: Extract<DemoCatalogInput, { kind: 'services' }>['deposit'] = {
    required: false,
    type: 'none',
    value: 0,
  };
  if (row.deposit !== undefined) {
    if (
      !row.deposit ||
      typeof row.deposit !== 'object' ||
      Array.isArray(row.deposit)
    )
      return invalid();
    const d = row.deposit as Record<string, unknown>;
    if (
      Object.keys(d).some(
        (key) => !['required', 'type', 'value'].includes(key),
      ) ||
      typeof d.required !== 'boolean' ||
      !['none', 'fixed', 'percentage'].includes(String(d.type)) ||
      typeof d.value !== 'number' ||
      !Number.isFinite(d.value) ||
      d.value < 0
    )
      return invalid();
    if (
      d.required !== (d.type !== 'none') ||
      (d.type === 'none' && d.value !== 0) ||
      (d.type === 'fixed' && !Number.isSafeInteger(d.value)) ||
      (d.type === 'percentage' &&
        (d.value > 100 ||
          Math.abs(d.value * 100 - Math.round(d.value * 100)) > 1e-8))
    )
      return invalid();
    deposit = {
      required: d.required,
      type: d.type as typeof deposit.type,
      value: d.value,
    };
  }
  return {
    kind,
    name: text('name')!,
    category: text('category')!,
    durationMinutes,
    priceCents,
    active: flag('active', true),
    professionalIds: ids('professionalIds'),
    assessmentRequired: flag('assessmentRequired', false),
    deposit,
  };
}

export function demoCatalogCapabilities(
  permissions: readonly string[],
  enabled: boolean,
  professionalId?: string,
) {
  const actions =
    enabled && !professionalId
      ? ['customer.create', 'professional.create', 'service.create'].filter(
          (permission) => permissions.includes(permission),
        )
      : [];
  return {
    mode: 'demo' as const,
    shared: true,
    persistent: true,
    canWrite: actions.length > 0,
    actions,
  };
}
