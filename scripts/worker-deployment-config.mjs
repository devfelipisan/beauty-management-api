import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export const workerConfigurations = Object.freeze({
  operations: 'apps/operations-worker/wrangler.jsonc',
  billing: 'apps/billing-worker/wrangler.jsonc',
  clinical: 'apps/clinical-worker/wrangler.jsonc',
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
    ...(name === 'clinical' ? { MAX_CLINICAL_PHOTO_BYTES: '5242880' } : {}),
  };
}
export function selectedWorkers(target) {
  if (target === 'all') return ['billing', 'clinical', 'operations'];
  if (!Object.hasOwn(workerConfigurations, target))
    throw new Error('Invalid Worker target');
  return [target];
}
export function deploymentRequest(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !['mode', 'worker', 'requestId'].includes(key),
    ) ||
    !['validate', 'deploy'].includes(value.mode) ||
    typeof value.requestId !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(value.requestId)
  ) {
    throw new Error('Invalid deployment request');
  }
  selectedWorkers(value.worker);
  return value;
}
export function readConfiguration(path) {
  const parsed = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
  if (parsed.error) throw new Error(`Invalid JSONC: ${path}`);
  return parsed.config;
}
export function validateWorkerConfigurations(
  configurations,
  production = false,
) {
  const ids = new Set();
  const expectedServices = {
    operations: {
      CLINICAL_SERVICE: 'beauty-clinical-worker',
      BILLING_SERVICE: 'beauty-billing-worker',
    },
    billing: { OPERATIONS_SERVICE: 'beauty-operations-worker' },
    clinical: {
      OPERATIONS_SERVICE: 'beauty-operations-worker',
      BILLING_SERVICE: 'beauty-billing-worker',
    },
  };
  for (const name of Object.keys(workerConfigurations)) {
    const config = configurations[name];
    if (
      !config ||
      config.name !== `beauty-${name}-worker` ||
      config.main !== 'src/worker.ts' ||
      config.compatibility_date !== '2026-08-30'
    )
      throw new Error(`Invalid entrypoint: ${name}`);
    if (
      config.workers_dev !== false ||
      config.preview_urls !== false ||
      config.routes?.length ||
      config.route
    )
      throw new Error(`Public access is not disabled: ${name}`);
    const buckets = config.r2_buckets ?? [];
    const expectedBinding =
      name === 'operations' ? 'PROFILE_MEDIA' : 'SESSION_MEDIA';
    if (
      name === 'billing'
        ? buckets.length !== 0
        : buckets.length !== 1 ||
          buckets[0].binding !== expectedBinding ||
          buckets[0].bucket_name !== 'beauty-r2'
    )
      throw new Error(`Invalid R2 configuration: ${name}`);
    const crons = config.triggers?.crons ?? [];
    if (
      name === 'operations'
        ? crons.length !== 1 || crons[0] !== '*/1 * * * *'
        : crons.length !== 0
    )
      throw new Error(`Invalid Cron configuration: ${name}`);
    if (config.d1_databases?.length !== 1)
      throw new Error(`Expected one D1 binding: ${name}`);
    const db = config.d1_databases[0];
    if (
      db.binding !== 'D1_DATABASE' ||
      db.database_name !== 'beauty_db' ||
      db.migrations_dir !== '../../database/d1/migrations'
    )
      throw new Error(`Invalid D1 configuration: ${name}`);
    const services = Object.fromEntries(
      (config.services ?? []).map((service) => [
        service.binding,
        service.service,
      ]),
    );
    if (
      config.services?.length !== Object.keys(expectedServices[name]).length ||
      Object.entries(expectedServices[name]).some(
        ([binding, service]) => services[binding] !== service,
      )
    )
      throw new Error(`Invalid Service Bindings: ${name}`);
    if (
      config.services.some((service) => service.props?.caller !== config.name)
    )
      throw new Error(`Missing trusted caller properties: ${name}`);
    if (production) {
      // Authentication values belong only to remote secret bindings, including
      // named environments. Never accept values in a checked-in vars map.
      if (
        [config, ...Object.values(config.env ?? {})].some((environment) =>
          requiredJwtSecretNames.some((name) =>
            Object.hasOwn(environment.vars ?? {}, name),
          ),
        )
      ) {
        throw new Error(
          `JWT values must be remote secret bindings: ${workerConfigurations[name]}`,
        );
      }
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          db.database_id ?? '',
        ) ||
        /^0{8}-/.test(db.database_id)
      )
        throw new Error(
          `Real D1 UUID required: ${name}. Set d1_databases[0].database_id in ${workerConfigurations[name]} to the existing beauty_db UUID; all three Workers must use the same UUID. database_name alone is insufficient.`,
        );
      if (
        config.keep_vars !== true ||
        !config.compatibility_flags?.includes('nodejs_compat') ||
        config.define?.__BEAUTY_LOCAL__ !== 'false' ||
        Object.keys(requiredProductionText(name)).some((key) =>
          Object.hasOwn(config.vars ?? {}, key),
        )
      )
        throw new Error(
          `Production configuration must be Dashboard-managed: ${name}`,
        );
      const required = config.secrets?.required;
      if (
        !Array.isArray(required) ||
        required.some(
          (secret) => typeof secret !== 'string' || !secret.trim(),
        ) ||
        new Set(required).size !== required.length ||
        requiredJwtSecretNames.some((secret) => !required.includes(secret))
      ) {
        throw new Error(
          `Required JWT secret declarations missing or invalid: ${workerConfigurations[name]}`,
        );
      }
      ids.add(db.database_id);
    }
  }
  if (production && ids.size !== 1)
    throw new Error('Workers use different databases');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const request = deploymentRequest(
    JSON.parse(readFileSync('.github/deploy/request.json', 'utf8')),
  );
  validateWorkerConfigurations(
    Object.fromEntries(
      Object.entries(workerConfigurations).map(([name, path]) => [
        name,
        readConfiguration(path),
      ]),
    ),
    request.mode === 'deploy',
  );
  console.log(
    `Validated ${request.requestId}: ${request.mode}/${request.worker}`,
  );
}
