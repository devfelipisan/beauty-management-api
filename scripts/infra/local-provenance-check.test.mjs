import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLocalEnvironment,
  diagnoseProvenance,
} from './local-provenance-check.mjs';
import { manifest, sha, version } from '../deploy/fixtures.mjs';
import { digest } from '../deploy/manifest.mjs';
const env = {
  CLOUDFLARE_ACCOUNT_ID: '9'.repeat(32),
  CLOUDFLARE_API_TOKEN: 'private-cloudflare-fixture',
  GITHUB_TOKEN: 'private-github-fixture',
};
const json = (value) => ({ ok: true, status: 200, json: async () => value });
function remote({
  noRecords = false,
  denied = false,
  maliciousId = false,
} = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method ?? 'GET' });
      if (url.includes('api.cloudflare.com')) {
        if (denied && url.includes('beauty-billing-worker'))
          return { ok: false, status: 403 };
        if (url.endsWith('/settings'))
          return json({ success: true, result: { bindings: [] } });
        if (url.endsWith('/deployments'))
          return json({
            success: true,
            result: {
              deployments: [
                {
                  id: maliciousId ? env.CLOUDFLARE_API_TOKEN : version,
                  versions: [{ version_id: version, percentage: 100 }],
                },
              ],
            },
          });
      }
      if (url.includes('/deployments?')) {
        const worker = /task=beauty-release-([^&]+)/.exec(url)[1];
        return json(
          noRecords
            ? []
            : [
                {
                  id: 1,
                  sha,
                  creator: { login: 'github-actions[bot]' },
                  payload: {
                    worker,
                    commitSha: sha,
                    versionId: version,
                    manifestDigest: digest(manifest),
                    runId: '99',
                    baseline: false,
                  },
                },
              ],
        );
      }
      if (url.includes('/deployments/1/statuses'))
        return json([{ state: 'success' }]);
      if (url.endsWith('/actions/runs/99'))
        return json({
          event: 'workflow_dispatch',
          head_branch: 'feature/microsservices',
          path: '.github/workflows/deploy-workers.yml',
          repository: { full_name: 'devfelipisan/beauty-management-api' },
        });
      if (url.includes('/contents/scripts/deploy/manifest.json'))
        return json({
          encoding: 'base64',
          content: Buffer.from(JSON.stringify(manifest)).toString('base64'),
        });
      assert.fail(`Unexpected fixture ${url}`);
    },
  };
}
test('absent exports, whitespace tokens and malformed Account ID block all network requests', async () => {
  for (const value of [
    {},
    { ...env, CLOUDFLARE_ACCOUNT_ID: 'invalid id' },
    { ...env, CLOUDFLARE_ACCOUNT_ID: ` ${'a'.repeat(32)}` },
    { ...env, CLOUDFLARE_API_TOKEN: '  ' },
    { ...env, GITHUB_TOKEN: '' },
  ]) {
    let calls = 0;
    const report = await diagnoseProvenance({
      env: value,
      fetchImpl: async () => {
        calls++;
        throw new Error('must not fetch');
      },
    });
    assert.equal(report.status, 'LOCAL_CONFIGURATION_INVALID');
    assert.equal(calls, 0);
  }
  assert.equal(
    validateLocalEnvironment({}).checks.CLOUDFLARE_ACCOUNT_ID.visibleToNode,
    false,
  );
  const invalid = validateLocalEnvironment({
    ...env,
    CLOUDFLARE_ACCOUNT_ID: 'bad',
  });
  assert.equal(invalid.checks.CLOUDFLARE_ACCOUNT_ID.present, true);
  assert.equal(invalid.checks.CLOUDFLARE_ACCOUNT_ID.validFormat, false);
});
test('all Workers use the real clients, verify provenance and make only GET requests', async () => {
  const f = remote();
  const report = await diagnoseProvenance({ env, fetchImpl: f.fetchImpl });
  assert.equal(report.status, 'PROVENANCE_CHECK_PASSED');
  assert.equal(report.failures, 0);
  assert.deepEqual(
    report.workers.map((worker) => worker.worker),
    ['billing', 'clinical', 'operations'],
  );
  assert.ok(
    report.workers.every(
      (worker) => worker.provenance === 'verified' && worker.commitSha === sha,
    ),
  );
  assert.ok(
    f.calls.length > 0 && f.calls.every((call) => call.method === 'GET'),
  );
  for (const secret of Object.values(env))
    assert.ok(!JSON.stringify(report).includes(secret));
});
test('valid credentials do not imply provenance; NO_RECORDS is reported for all Workers', async () => {
  const f = remote({ noRecords: true });
  const report = await diagnoseProvenance({ env, fetchImpl: f.fetchImpl });
  assert.equal(report.status, 'PROVENANCE_CHECK_FAILED');
  assert.equal(report.failures, 3);
  assert.ok(
    report.workers.every(
      (worker) =>
        worker.cloudflare === 'connected' &&
        worker.failure.provenanceReason === 'NO_RECORDS',
    ),
  );
});
test('denied access does not prevent diagnosing the other Workers or leak untrusted metadata', async () => {
  const f = remote({ denied: true, maliciousId: true });
  const report = await diagnoseProvenance({ env, fetchImpl: f.fetchImpl });
  assert.equal(report.failures, 1);
  assert.equal(report.workers[0].failure.code, 'REMOTE_ACCESS_DENIED');
  assert.equal(report.workers[1].provenance, 'verified');
  assert.equal(report.workers[2].provenance, 'verified');
  for (const secret of Object.values(env))
    assert.ok(!JSON.stringify(report).includes(secret));
});
test('transport errors are sanitized and do not stop the remaining independent checks', async () => {
  const report = await diagnoseProvenance({
    env,
    fetchImpl: async () => {
      throw new Error(env.GITHUB_TOKEN);
    },
  });
  assert.equal(report.failures, 3);
  assert.ok(
    report.workers.every(
      (worker) => worker.failure.code === 'REMOTE_TRANSPORT_ERROR',
    ),
  );
  assert.ok(!JSON.stringify(report).includes(env.GITHUB_TOKEN));
});
