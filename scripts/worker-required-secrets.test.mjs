import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  requireRemoteSecrets,
  requiredBindingsFailure,
} from './worker-required-secrets.mjs';
import { deploymentOutcome } from './worker-deployment-output.mjs';
import {
  readConfiguration,
  requiredJwtSecretNames,
  workerConfigurations,
  requiredProductionText,
} from './worker-deployment-config.mjs';

const configurations = () =>
  Object.fromEntries(
    Object.entries(workerConfigurations).map(([name, path]) => [
      name,
      readConfiguration(path),
    ]),
  );
const secrets = () =>
  requiredJwtSecretNames.map((name) => ({ name, type: 'secret_text' }));
const options = { accountId: 'test-account', apiToken: 'fixture-token' };
const response = (result) => ({
  ok: true,
  json: async () => ({ success: true, result }),
});

function remoteFixture(overrides = {}) {
  return async (url) => {
    if (overrides[url.split('/').at(-1)])
      return response(overrides[url.split('/').at(-1)]);
    if (url.endsWith('/query'))
      return response([
        {
          success: true,
          results: [
            {
              inventory_approved: 1,
              policy_approved: 1,
              writers_coordinated: 1,
              approval_reference: 'approved-fixture',
            },
          ],
        },
      ]);
    if (url.endsWith('/secrets')) return response(secrets());
    if (url.endsWith('/subdomain'))
      return response({ enabled: false, previews_enabled: false });
    if (url.endsWith('/schedules')) return response({ schedules: [] });
    if (url.endsWith('/settings')) {
      const name = url.match(/beauty-(operations|billing|clinical)-worker/)[1];
      return response({
        bindings: Object.entries(requiredProductionText(name)).map(
          ([name, text]) => ({ name, type: 'plain_text', text }),
        ),
      });
    }
    if (url.includes('/d1/database/')) return response({ name: 'beauty_db' });
    if (url.endsWith('/managed')) return response({ enabled: false });
    if (url.endsWith('/custom')) return response({ domains: [] });
    if (url.endsWith('/beauty-r2')) return response({ name: 'beauty-r2' });
    throw new Error('Unexpected endpoint');
  };
}
test('checks secret names and Text configuration without returning remote values', async () => {
  const calls = [];
  const fixture = remoteFixture();
  assert.equal(
    await requireRemoteSecrets(configurations(), 'billing', {
      ...options,
      fetchImpl: async (...args) => {
        calls.push(args);
        return fixture(...args);
      },
    }),
    undefined,
  );
  assert.equal(calls.length, 3);
  assert.ok(calls[0][0].endsWith('/beauty-billing-worker/secrets'));
  assert.deepEqual(calls[0][1], {
    method: 'GET',
    redirect: 'error',
    headers: { authorization: 'Bearer fixture-token' },
  });
});
test('clinical preflight does not request R2 and missing Text produces a safe actionable code', async () => {
  const calls = [],
    fixture = remoteFixture();
  await requireRemoteSecrets(configurations(), 'clinical', {
    ...options,
    fetchImpl: async (url, ...args) => {
      calls.push(url);
      return fixture(url, ...args);
    },
  });
  assert.ok(calls.every((url) => !url.includes('/r2/')));
  await assert.rejects(
    requireRemoteSecrets(configurations(), 'operations', {
      ...options,
      fetchImpl: remoteFixture({ settings: { bindings: [] } }),
    }),
    (error) => {
      assert.equal(error.code, 'BINDING_MISSING');
      assert.equal(error.phase, 'preflight');
      assert.equal(error.worker, 'billing');
      assert.equal(error.binding, 'APP_ENV');
      return true;
    },
  );
});
test('preflights receivers and storage before publishing Operations', async () => {
  const calls = [];
  const fixture = remoteFixture();
  await requireRemoteSecrets(configurations(), 'operations', {
    ...options,
    fetchImpl: async (url, ...rest) => {
      calls.push(url);
      return fixture(url, ...rest);
    },
  });
  assert.deepEqual(
    calls
      .filter((url) => url.endsWith('/secrets'))
      .map((url) => url.split('/').at(-2)),
    [
      'beauty-billing-worker',
      'beauty-clinical-worker',
      'beauty-operations-worker',
    ],
  );
  assert.ok(calls.some((url) => url.endsWith('/domains/managed')));
});
test('verifies the published SHA, applied bindings, triggers and private exposure', async () => {
  const configs = configurations(),
    sha = 'a'.repeat(40);
  const settings = {
    bindings: [
      ...Object.entries(requiredProductionText('billing')).map(
        ([name, text]) => ({ name, type: 'plain_text', text }),
      ),
      { name: 'SERVICE_VERSION', type: 'plain_text', text: sha },
      {
        name: 'D1_DATABASE',
        type: 'd1',
        id: configs.billing.d1_databases[0].database_id,
      },
      {
        name: 'OPERATIONS_SERVICE',
        type: 'service',
        service: 'beauty-operations-worker',
      },
    ],
  };
  await requireRemoteSecrets(configs, 'billing', {
    ...options,
    publishedSha: sha,
    fetchImpl: remoteFixture({ settings }),
  });
  for (const overrides of [
    { subdomain: { enabled: true, previews_enabled: false } },
    { schedules: { schedules: [{ cron: '* * * * *' }] } },
    {
      settings: {
        bindings: settings.bindings.filter(
          (binding) => binding.name !== 'D1_DATABASE',
        ),
      },
    },
  ]) {
    await assert.rejects(
      requireRemoteSecrets(configs, 'billing', {
        ...options,
        publishedSha: sha,
        fetchImpl: remoteFixture({ settings, ...overrides }),
      }),
      { message: requiredBindingsFailure },
    );
  }
});
test('fails closed for invalid Text configuration, missing resources and public buckets', async () => {
  for (const overrides of [
    { settings: { bindings: [] } },
    { managed: { enabled: true } },
    { custom: { domains: [{ enabled: true }] } },
    { 'beauty-r2': { name: 'wrong' } },
    { query: [{ success: true, results: [{ inventory_approved: 0 }] }] },
  ]) {
    await assert.rejects(
      requireRemoteSecrets(configurations(), 'all', {
        ...options,
        fetchImpl: remoteFixture(overrides),
      }),
      { message: requiredBindingsFailure },
    );
  }
});
test('rejects every missing or plaintext auth binding and does not leak upstream errors', async () => {
  for (const name of requiredJwtSecretNames) {
    for (const result of [
      secrets().filter((secret) => secret.name !== name),
      secrets().map((secret) =>
        secret.name === name ? { ...secret, type: 'plain_text' } : secret,
      ),
    ]) {
      await assert.rejects(
        requireRemoteSecrets(configurations(), 'operations', {
          ...options,
          fetchImpl: async () => response(result),
        }),
        { message: requiredBindingsFailure },
      );
    }
  }
  const sensitive = 'private-upstream-content-fixture';
  for (const fetchImpl of [
    async () => {
      throw new Error(sensitive);
    },
    async () => ({
      ok: false,
      json: async () => {
        throw new Error(sensitive);
      },
    }),
    async () => ({
      ok: true,
      json: async () => {
        throw new Error(sensitive);
      },
    }),
    async () => ({
      ok: true,
      json: async () => ({ success: false, errors: [sensitive] }),
    }),
    async () => ({
      ok: true,
      json: async () => ({ success: true, result: { unexpected: sensitive } }),
    }),
  ]) {
    await assert.rejects(
      requireRemoteSecrets(configurations(), 'all', { ...options, fetchImpl }),
      (error) => {
        assert.equal(error.message, requiredBindingsFailure);
        assert.equal(error.cause, undefined);
        assert.ok(!error.stack.includes(sensitive));
        return true;
      },
    );
  }
});

test('stops when a selected destination is missing and rejects absent credentials without network access', async () => {
  let calls = 0;
  await assert.rejects(
    requireRemoteSecrets(configurations(), 'all', {
      ...options,
      fetchImpl: async () => {
        calls++;
        return calls === 1 ? response(secrets()) : { ok: false, status: 404 };
      },
    }),
    { message: requiredBindingsFailure },
  );
  assert.equal(calls, 2);
  for (const credentials of [
    {},
    { accountId: 'account' },
    { apiToken: 'token' },
  ]) {
    await assert.rejects(
      requireRemoteSecrets(configurations(), 'all', {
        ...credentials,
        fetchImpl: () => {
          assert.fail('Network must not be accessed');
        },
      }),
      { message: requiredBindingsFailure },
    );
  }
});

test('standalone preflight fails with a generic message without credentials', () => {
  const env = { ...process.env };
  delete env.CLOUDFLARE_ACCOUNT_ID;
  delete env.CLOUDFLARE_API_TOKEN;
  const result = spawnSync(
    process.execPath,
    ['scripts/worker-required-secrets.mjs'],
    { env, encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr.trim()), {
    code: 'REMOTE_CREDENTIALS_UNAVAILABLE',
    phase: 'preflight',
  });
});

test('deployment evidence allowlists version/status and discards raw Wrangler diagnostics', () => {
  const version = '12345678-1234-1234-1234-123456789abc';
  const sensitive = 'private-upstream-content-fixture';
  const outcome = deploymentOutcome({
    status: 0,
    stdout: `Current Version ID: ${version}\n${sensitive}`,
    stderr: sensitive,
  });
  assert.deepEqual(outcome, { status: 'published', version, exitCode: 0 });
  assert.ok(!JSON.stringify(outcome).includes(sensitive));
  for (const result of [
    { status: 1, stdout: sensitive },
    { status: 0, stdout: sensitive },
    { status: null, error: new Error(sensitive) },
  ]) {
    const failure = deploymentOutcome(result);
    assert.equal(failure.status, 'failed');
    assert.ok(!JSON.stringify(failure).includes(sensitive));
  }
});
