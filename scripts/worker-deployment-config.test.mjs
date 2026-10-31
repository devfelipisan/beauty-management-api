import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deploymentRequest,
  selectedWorkers,
  validateWorkerConfigurations,
  readConfiguration,
  workerConfigurations,
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
test('validates JSONC configs but blocks production without a real database and JWT configuration', () => {
  const configs = Object.fromEntries(
    Object.entries(workerConfigurations).map(([name, path]) => [
      name,
      readConfiguration(path),
    ]),
  );
  assert.doesNotThrow(() => validateWorkerConfigurations(configs));
  assert.throws(() => validateWorkerConfigurations(configs, true));
  for (const config of Object.values(configs)) {
    config.d1_databases[0].database_id = '12345678-1234-1234-1234-123456789abc';
    Object.assign(config.vars, {
      AUTH_ISSUER: 'https://identity.test/auth/v1',
      AUTH_JWKS_URL: 'https://identity.test/auth/v1/.well-known/jwks.json',
      AUTH_AUDIENCE: 'api',
      AUTH_ALGORITHM: 'ES256',
    });
  }
  assert.doesNotThrow(() => validateWorkerConfigurations(configs, true));
  configs.clinical.workers_dev = true;
  assert.throws(() => validateWorkerConfigurations(configs, true));
  configs.clinical.workers_dev = false;
  configs.billing.d1_databases[0].database_id =
    '12345678-1234-1234-1234-123456789abd';
  assert.throws(() => validateWorkerConfigurations(configs, true));
});
