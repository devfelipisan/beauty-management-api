import { isDeepStrictEqual } from 'node:util';
export class BindingShapeError extends Error {
  constructor(code = 'REMOTE_RESPONSE_INVALID') {
    super('Invalid binding representation');
    this.code = code;
  }
}
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) =>
  typeof value === 'string' && value.length > 0 && value.trim() === value;
export function normalizeBinding(value) {
  if (!record(value) || !text(value.name) || !text(value.type))
    throw new BindingShapeError();
  const base = { name: value.name, type: value.type };
  if (value.type === 'd1') {
    const modern = value.database_id !== undefined,
      legacy = value.id !== undefined;
    if (
      (modern && !text(value.database_id)) ||
      (legacy && !text(value.id)) ||
      (!modern && !legacy)
    )
      throw new BindingShapeError();
    if (modern && legacy && value.database_id !== value.id)
      throw new BindingShapeError('BINDING_MISMATCH');
    return { ...base, database_id: modern ? value.database_id : value.id };
  }
  if (value.type === 'service') {
    if (
      !text(value.service) ||
      [value.entrypoint, value.environment].some(
        (field) => field != null && !text(field),
      ) ||
      (value.props !== undefined && !record(value.props))
    )
      throw new BindingShapeError();
    return {
      ...base,
      service: value.service,
      entrypoint: value.entrypoint ?? null,
      environment: value.environment ?? null,
      ...(value.props !== undefined ? { props: value.props } : {}),
    };
  }
  if (value.type === 'r2_bucket') {
    if (!text(value.bucket_name)) throw new BindingShapeError();
    return { ...base, bucket_name: value.bucket_name };
  }
  return base;
}
export function expectedBindings(config) {
  return [
    ...config.d1_databases.map((db) => ({
      type: 'd1',
      name: db.binding,
      database_id: db.database_id,
    })),
    ...config.services.map((service) => ({
      type: 'service',
      name: service.binding,
      service: service.service,
      entrypoint: service.entrypoint,
      environment: service.environment,
      props: service.props,
    })),
    ...(config.r2_buckets ?? []).map((bucket) => ({
      type: 'r2_bucket',
      name: bucket.binding,
      bucket_name: bucket.bucket_name,
    })),
  ].map(normalizeBinding);
}
// undefined means there is no service comparison to classify.
export function serviceMismatchReason(actual, expected) {
  if (!actual || expected?.type !== 'service' || actual.name !== expected.name)
    return undefined;
  if (actual.type !== expected.type) return 'TYPE_MISMATCH';
  if (actual.service !== expected.service) return 'DESTINATION_MISMATCH';
  if (
    actual.entrypoint !== expected.entrypoint ||
    actual.environment !== expected.environment
  )
    return 'SELECTOR_MISMATCH';
  if (
    actual.props !== undefined &&
    expected.props !== undefined &&
    !isDeepStrictEqual(actual.props, expected.props)
  )
    return 'PROPS_MISMATCH';
  return null;
}
export function matchesBinding(actual, expected) {
  if (!actual || actual.name !== expected.name || actual.type !== expected.type)
    return false;
  switch (expected.type) {
    case 'd1':
      return actual.database_id === expected.database_id;
    case 'service':
      return serviceMismatchReason(actual, expected) === null;
    case 'r2_bucket':
      return actual.bucket_name === expected.bucket_name;
    default:
      return false;
  }
}
