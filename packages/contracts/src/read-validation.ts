function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('RESPONSE_CONTRACT_INVALID');
  return value as Record<string, unknown>;
}
function text(value: unknown): void {
  if (typeof value !== 'string' || !value)
    throw new Error('RESPONSE_CONTRACT_INVALID');
}
function cents(value: unknown): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('RESPONSE_CONTRACT_INVALID');
}
export function assertCatalogResponse(kind: string, value: unknown): void {
  const result = record(value);
  if (!Array.isArray(result.data)) throw new Error('RESPONSE_CONTRACT_INVALID');
  const page = record(result.page);
  if (
    typeof page.hasMore !== 'boolean' ||
    (page.hasMore
      ? typeof page.nextCursor !== 'string' || !page.nextCursor
      : page.nextCursor !== null)
  )
    throw new Error('RESPONSE_CONTRACT_INVALID');
  for (const value of result.data) {
    const row = record(value);
    for (const key of ['id', 'tenantId', 'status', 'createdAt']) text(row[key]);
    text(kind === 'customers' ? row.fullName : row.name);
    if (kind !== 'customers') {
      const links = row[kind === 'services' ? 'professionalIds' : 'serviceIds'];
      if (!Array.isArray(links)) throw new Error('RESPONSE_CONTRACT_INVALID');
      links.forEach(text);
    }
    if (kind === 'services') {
      cents(row.basePriceCents);
      text(row.category);
      text(row.depositMode);
      if (
        typeof row.requiresAssessment !== 'boolean' ||
        !Number.isSafeInteger(row.durationMinutes) ||
        Number(row.durationMinutes) < 1
      )
        throw new Error('RESPONSE_CONTRACT_INVALID');
    }
  }
}
export function assertAgendaRead(value: unknown): void {
  const result = record(value);
  const rows = Array.isArray(result.appointments)
    ? result.appointments
    : [result];
  for (const value of rows) {
    const row = record(value);
    for (const key of [
      'id',
      'tenantId',
      'startsAt',
      'endsAt',
      'status',
      'origin',
      'createdAt',
      'updatedAt',
    ])
      text(row[key]);
    for (const key of ['customer', 'professional', 'service'])
      text(record(row[key]).id);
    // Older records may have no monetary snapshot. Preserve absence; never invent it.
    for (const key of [
      'basePriceCents',
      'discountCents',
      'finalPriceCents',
      'depositCents',
    ])
      if (row[key] !== null && row[key] !== undefined) cents(row[key]);
  }
}
