import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  deploymentOutcome,
  wranglerFailure,
} from './worker-deployment-output.mjs';
import { DeploymentValidationError, diagnostic } from './deploy/errors.mjs';
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
test('colored successful version output is recognized without leaking native logs', () => {
  const outcome = deploymentOutcome({
    status: 0,
    stdout: `Current Version ID: \u001b[32m${version}\u001b[0m\nPRIVATE_VALUE`,
  });
  assert.equal(outcome.status, 'published');
  assert.equal(outcome.version, version);
  assert.ok(!JSON.stringify(outcome).includes('PRIVATE_VALUE'));
});
test('Wrangler failures expose only fixed categories and numeric codes', () => {
  for (const [result, reason] of [
    [
      {
        status: 1,
        stderr:
          'The following required secrets have not been set: AUTH_ISSUER PRIVATE_VALUE',
      },
      'MISSING_REQUIRED_SECRETS',
    ],
    [
      { status: 1, stderr: 'Authentication error [code: 10000] PRIVATE_VALUE' },
      'AUTHORIZATION_FAILED',
    ],
    [
      {
        status: 1,
        stderr:
          'A request to the Cloudflare API failed [code: 10021] PRIVATE_VALUE',
      },
      'CLOUDFLARE_API_ERROR',
    ],
    [
      { status: 1, stderr: 'Unknown arguments: private-option PRIVATE_VALUE' },
      'CLI_ARGUMENT_ERROR',
    ],
    [{ status: 1, stderr: 'Build failed PRIVATE_VALUE' }, 'BUILD_FAILED'],
    [
      {
        status: null,
        error: Object.assign(new Error('PRIVATE_VALUE'), { code: 'ENOBUFS' }),
      },
      'OUTPUT_LIMIT',
    ],
    [{ status: null, error: new Error('PRIVATE_VALUE') }, 'PROCESS_FAILED'],
    [{ status: 0, stdout: 'PRIVATE_VALUE' }, 'VERSION_ID_UNCONFIRMED'],
    [{ status: 1, stderr: 'PRIVATE_VALUE' }, 'UNKNOWN'],
  ]) {
    const fields = wranglerFailure(result);
    assert.equal(fields.wranglerReason, reason);
    const safe = diagnostic(
      new DeploymentValidationError('WRANGLER_FAILED', {
        phase: 'publish',
        operation: 'wrangler.deploy',
        worker: 'billing',
        ...fields,
      }),
    );
    assert.equal(safe.wranglerReason, reason);
    assert.ok(!JSON.stringify(safe).includes('PRIVATE_VALUE'));
  }
  assert.equal(
    wranglerFailure({ status: 1, stderr: 'API failed [code: 10021]' })
      .upstreamCode,
    10021,
  );
});
test('unapproved diagnostic values cannot expose native error strings', () => {
  const value = new DeploymentValidationError('WRANGLER_FAILED', {
    operation: 'wrangler.deploy',
    wranglerReason: 'PRIVATE_VALUE',
    exitCode: 'PRIVATE_VALUE',
    upstreamCode: 'PRIVATE_VALUE',
  });
  value.wranglerReason = 'PRIVATE_VALUE';
  value.exitCode = 'PRIVATE_VALUE';
  assert.ok(!JSON.stringify(diagnostic(value)).includes('PRIVATE_VALUE'));
  const unrelated = new DeploymentValidationError('REMOTE_HTTP_ERROR', {
    wranglerReason: 'BUILD_FAILED',
    exitCode: 1,
    upstreamCode: 10021,
  });
  assert.equal(diagnostic(unrelated).wranglerReason, undefined);
});
