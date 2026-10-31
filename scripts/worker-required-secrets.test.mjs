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

test('checks only secret metadata for the selected Worker and never returns secret data', async () => {
  const calls = [];
  const result = await requireRemoteSecrets(configurations(), 'billing', {
    ...options,
    fetchImpl: async (...args) => {
      calls.push(args);
      return response(secrets());
    },
  });
  assert.equal(result, undefined);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0][0],
    'https://api.cloudflare.com/client/v4/accounts/test-account/workers/scripts/beauty-billing-worker/secrets',
  );
  assert.deepEqual(calls[0][1], {
    method: 'GET',
    redirect: 'error',
    headers: { authorization: 'Bearer fixture-token' },
  });
});

test('preflights all destinations in publication order before reporting success', async () => {
  const calls = [];
  await requireRemoteSecrets(configurations(), 'all', {
    ...options,
    fetchImpl: async (url) => {
      calls.push(url);
      return response(secrets());
    },
  });
  assert.deepEqual(
    calls.map((url) => url.split('/').at(-2)),
    [
      'beauty-billing-worker',
      'beauty-clinical-worker',
      'beauty-operations-worker',
    ],
  );
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
  assert.equal(result.stderr.trim(), requiredBindingsFailure);
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
