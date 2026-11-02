import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deploymentRequest,
  selectedWorkers,
  validateWorkerConfigurations,
  readConfiguration,
  workerConfigurations,
  requiredJwtSecretNames,
} from './worker-deployment-config.mjs';

test('selects only approved configs and orders all sequentially', () => {
  assert.deepEqual(selectedWorkers('all'), [
    'billing',
    'clinical',
    'operations',
  ]);
  assert.deepEqual(selectedWorkers('billing'), ['billing']);
  for (const target of ['../other', '__proto__', 'constructor', '', undefined])
    assert.throws(() => selectedWorkers(target));
});
test('limits R2 and Cron to their owning Workers and requires an immutable production build profile', () => {
  const configs = Object.fromEntries(
    Object.entries(workerConfigurations).map(([name, path]) => [
      name,
      readConfiguration(path),
    ]),
  );
  for (const mutate of [
    (value) =>
      (value.billing.r2_buckets = [
        { binding: 'PROFILE_MEDIA', bucket_name: 'beauty-r2' },
      ]),
    (value) => (value.operations.r2_buckets[0].binding = 'SESSION_MEDIA'),
    (value) =>
      (value.clinical.r2_buckets = [
        { binding: 'SESSION_MEDIA', bucket_name: 'beauty-r2' },
      ]),
    (value) => (value.billing.triggers = { crons: ['*/1 * * * *'] }),
    (value) => (value.operations.triggers = { crons: ['*/1 * * * *'] }),
    (value) => (value.operations.keep_vars = false),
    (value) => (value.clinical.define.__BEAUTY_LOCAL__ = 'true'),
  ]) {
    const candidate = structuredClone(configs);
    mutate(candidate);
    assert.throws(() => validateWorkerConfigurations(candidate, true));
  }
});
test('rejects unknown request fields and output injection', () => {
  assert.equal(
    deploymentRequest({
      mode: 'validate',
      worker: 'all',
      requestId: 'request-1',
    }).mode,
    'validate',
  );
  assert.throws(() =>
    deploymentRequest({
      mode: 'deploy',
      worker: 'all',
      requestId: 'a\nmode=deploy',
    }),
  );
  assert.throws(() =>
    deploymentRequest({
      mode: 'deploy',
      worker: 'all',
      requestId: 'a',
      ref: 'main',
    }),
  );
});
test('validates JSONC declarations without requiring authentication values in the repository', () => {
  const configs = Object.fromEntries(
    Object.entries(workerConfigurations).map(([name, path]) => [
      name,
      readConfiguration(path),
    ]),
  );
  assert.doesNotThrow(() => validateWorkerConfigurations(configs));
  // Make the missing-UUID case explicit, even after production config is filled.
  delete configs.operations.d1_databases[0].database_id;
  assert.throws(() => validateWorkerConfigurations(configs, true));
  for (const config of Object.values(configs)) {
    config.d1_databases[0].database_id = '12345678-1234-1234-1234-123456789abc';
  }
  assert.doesNotThrow(() => validateWorkerConfigurations(configs, true));
  configs.clinical.workers_dev = true;
  assert.throws(() => validateWorkerConfigurations(configs, true));
  configs.clinical.workers_dev = false;
  configs.billing.d1_databases[0].database_id =
    '12345678-1234-1234-1234-123456789abd';
  assert.throws(() => validateWorkerConfigurations(configs, true));
});

test('identifies the exact missing D1 configuration without weakening the production gate', () => {
  const configs = Object.fromEntries(
    Object.entries(workerConfigurations).map(([name, path]) => [
      name,
      readConfiguration(path),
    ]),
  );
  for (const config of Object.values(configs)) {
    config.d1_databases[0].database_id = '12345678-1234-1234-1234-123456789abc';
  }
  for (const [name, path] of Object.entries(workerConfigurations)) {
    for (const invalid of [
      undefined,
      '',
      '<UUID_REAL_BEAUTY_DB>',
      '00000000-0000-0000-0000-000000000000',
    ]) {
      const candidate = JSON.parse(JSON.stringify(configs));
      candidate[name].d1_databases[0].database_id = invalid;
      assert.throws(
        () => validateWorkerConfigurations(candidate, true),
        (error) => {
          assert.match(
            error.message,
            new RegExp(`Real D1 UUID required: ${name}`),
          );
          assert.ok(error.message.includes(path));
          return true;
        },
      );
    }
  }
});

test('requires all four secret names on every production Worker and rejects checked-in JWT values', () => {
  const configs = Object.fromEntries(
    Object.entries(workerConfigurations).map(([name, path]) => [
      name,
      readConfiguration(path),
    ]),
  );
  assert.deepEqual(requiredJwtSecretNames, [
    'AUTH_ISSUER',
    'AUTH_AUDIENCE',
    'AUTH_JWKS_URL',
    'AUTH_ALGORITHM',
  ]);
  assert.doesNotThrow(() => validateWorkerConfigurations(configs, true));
  for (const name of Object.keys(configs)) {
    for (const secret of requiredJwtSecretNames) {
      const missing = structuredClone(configs);
      missing[name].secrets.required = missing[name].secrets.required.filter(
        (value) => value !== secret,
      );
      assert.throws(
        () => validateWorkerConfigurations(missing, true),
        /Required JWT secret declarations missing or invalid/,
      );
      const inline = structuredClone(configs);
      inline[name].vars[secret] = 'sensitive-fixture-value';
      assert.throws(
        () => validateWorkerConfigurations(inline, true),
        (error) => {
          assert.match(
            error.message,
            /JWT values must be remote secret bindings/,
          );
          assert.ok(!error.message.includes('sensitive-fixture-value'));
          return true;
        },
      );
      const named = structuredClone(configs);
      named[name].env.local.vars[secret] = 'sensitive-fixture-value';
      assert.throws(
        () => validateWorkerConfigurations(named, true),
        /JWT values must be remote secret bindings/,
      );
    }
    for (const required of [
      undefined,
      [],
      [...requiredJwtSecretNames, requiredJwtSecretNames[0]],
      [...requiredJwtSecretNames, 1],
    ]) {
      const invalid = structuredClone(configs);
      invalid[name].secrets = { required };
      assert.throws(
        () => validateWorkerConfigurations(invalid, true),
        /Required JWT secret declarations missing or invalid/,
      );
    }
    const mock = structuredClone(configs);
    mock[name].vars.AUTH_PROVIDER = 'mock';
    assert.throws(
      () => validateWorkerConfigurations(mock, true),
      /Production configuration must be Dashboard-managed/,
    );
  }
});
