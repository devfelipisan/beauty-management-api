import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { deploymentOutcome } from './worker-deployment-output.mjs';
import { requireRemoteSecrets } from './worker-required-secrets.mjs';
import {
  configurations,
  manifest,
  fixture,
  sha,
  version,
} from './deploy/fixtures.mjs';

test('compatibility wrapper delegates to a directed postcheck without secret listing', async () => {
  const { client, calls } = fixture();
  await requireRemoteSecrets(configurations, 'billing', {
    client,
    publishedSha: sha,
    versionId: version,
  });
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.path.includes('beauty-billing-worker')));
  assert.ok(calls.every((call) => !call.path.includes('/secrets')));
});
test('compatibility wrapper delegates preflight without a second validation pass', async () => {
  const { client, github, calls } = fixture();
  await requireRemoteSecrets(configurations, 'clinical', {
    client,
    github,
    manifest,
  });
  assert.equal(calls.filter((call) => call.path.endsWith('/query')).length, 1);
  assert.ok(calls.every((call) => !call.path.includes('/r2/')));
});
test('standalone preflight fails safely without credentials', () => {
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
  assert.equal(
    JSON.parse(result.stderr.trim()).code,
    'REMOTE_CREDENTIALS_UNAVAILABLE',
  );
});
test('Wrangler output is allowlisted and failure diagnostics are discarded', () => {
  const sensitive = 'private-upstream-fixture';
  assert.deepEqual(
    deploymentOutcome({
      status: 0,
      stdout: `Current Version ID: ${version}\n${sensitive}`,
      stderr: sensitive,
    }),
    { status: 'published', version, exitCode: 0 },
  );
  for (const result of [
    { status: 1, stdout: sensitive },
    { status: 0, stdout: sensitive },
    { status: null, error: new Error(sensitive) },
  ]) {
    const outcome = deploymentOutcome(result);
    assert.equal(outcome.status, 'failed');
    assert.ok(!JSON.stringify(outcome).includes(sensitive));
  }
});
