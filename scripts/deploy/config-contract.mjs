export const workerConfigurations = Object.freeze({
  operations: 'apps/operations-worker/wrangler.jsonc',
  billing: 'apps/billing-worker/wrangler.jsonc',
  clinical: 'apps/clinical-worker/wrangler.jsonc',
});
export const workerSpecifications = Object.freeze({
  operations: {
    services: {
      CLINICAL_SERVICE: 'beauty-clinical-worker',
      BILLING_SERVICE: 'beauty-billing-worker',
    },
    r2: [{ binding: 'PROFILE_MEDIA', bucket_name: 'beauty-r2' }],
    crons: [],
    minMigration: '0030',
  },
  billing: {
    services: { OPERATIONS_SERVICE: 'beauty-operations-worker' },
    r2: [],
    crons: [],
    minMigration: '0026',
  },
  clinical: {
    services: {
      OPERATIONS_SERVICE: 'beauty-operations-worker',
      BILLING_SERVICE: 'beauty-billing-worker',
    },
    r2: [],
    crons: [],
    minMigration: '0026',
  },
});
export const requiredJwtSecretNames = Object.freeze([
  'AUTH_ISSUER',
  'AUTH_AUDIENCE',
  'AUTH_JWKS_URL',
  'AUTH_ALGORITHM',
]);
export function requiredProductionText(name) {
  return {
    APP_ENV: 'production',
    AUTH_PROVIDER: 'jwt',
    OBSERVE_ENABLED: 'true',
    OUTBOX_BATCH_SIZE: '5',
    OUTBOX_LEASE_SECONDS: '60',
    ...(name === 'operations' ? { MAX_PROFILE_IMAGE_BYTES: '300000' } : {}),
  };
}
export function selectedWorkers(target) {
  if (target === 'all') return [...releaseOrder];
  if (!Object.hasOwn(workerConfigurations, target))
    throw new Error('Invalid Worker target');
  return [target];
}

export const releaseOrder = Object.freeze([
  'billing',
  'clinical',
  'operations',
]);
export const releaseBranch = 'feature/microsservices';
export const manifestPath = 'scripts/deploy/manifest.json';
