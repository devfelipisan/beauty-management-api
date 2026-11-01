import { test } from 'node:test';
import assert from 'node:assert/strict';
import { githubClient } from './github-client.mjs';
import { digest } from './manifest.mjs';
import { sha, version, manifest } from './fixtures.mjs';
const repository = 'owner/beauty',
  request = { mode: 'deploy', worker: 'all', requestId: 'fixture-release' };
const json = (value) => ({ ok: true, json: async () => value });
const file = (value) =>
  json({
    encoding: 'base64',
    content: Buffer.from(JSON.stringify(value)).toString('base64'),
  });
function eligibleFixture(overrides = {}) {
  const calls = [];
  const client = githubClient({
    repository,
    token: 'fixture',
    execution: {
      event: 'workflow_dispatch',
      runId: '99',
      runAttempt: '1',
      controlSha: 'b'.repeat(40),
      repository,
      ref: 'refs/heads/feature/microsservices',
    },
    fetchImpl: async (url) => {
      const path = url.replace(
        `https://api.github.com/repos/${repository}`,
        '',
      );
      calls.push(path);
      if (path === '/actions/runs/99')
        return json({
          id: 99,
          run_attempt: 1,
          event: 'workflow_dispatch',
          head_sha: 'b'.repeat(40),
          head_branch: 'feature/microsservices',
          repository: { full_name: repository },
          path: '.github/workflows/deploy-workers.yml',
        });
      if (path.includes('/attempts/') && path.endsWith('page=1'))
        return json({
          jobs: [
            {
              id: 42,
              run_id: 12,
              name: 'verify',
              head_sha: sha,
              status: 'completed',
              conclusion: overrides.verifyConclusion ?? 'success',
            },
          ],
        });
      if (path.startsWith('/compare/'))
        return json(
          overrides.comparison ?? {
            status: 'ahead',
            merge_base_commit: { sha },
          },
        );
      if (path.startsWith('/actions/workflows/'))
        return json({
          workflow_runs: overrides.runs ?? [
            {
              id: 12,
              head_sha: sha,
              head_branch: 'feature/microsservices',
              event: 'push',
              repository: { full_name: repository },
              path: '.github/workflows/ci.yml',
              status: 'completed',
              conclusion: 'success',
              run_number: 1,
              run_attempt: 1,
            },
          ],
        });
      if (path === `/contents/.github/deploy/request.json?ref=${sha}`)
        return file(request);
      assert.fail(`Unexpected GitHub fixture ${path}`);
    },
  });
  return { client, calls };
}
test('eligibility reads immutable request from selected ancestor SHA after branch advances', async () => {
  const { client, calls } = eligibleFixture();
  assert.deepEqual(await client.eligible(sha), {
    ...request,
    commitSha: sha,
    ciRunId: 12,
    ciRunAttempt: 1,
    verifyJobId: 42,
    releaseOrigin: 'manual',
    releaseRunAttempt: 1,
    controlSha: 'b'.repeat(40),
  });
  assert.ok(calls.includes(`/contents/.github/deploy/request.json?ref=${sha}`));
});
test('invalid SHA, unrelated history and untrusted PR CI cannot authorize release', async () => {
  await assert.rejects(eligibleFixture().client.eligible('main'), {
    code: 'SHA_INELIGIBLE',
  });
  await assert.rejects(
    eligibleFixture({
      comparison: { status: 'diverged', merge_base_commit: { sha } },
    }).client.eligible(sha),
    { code: 'SHA_INELIGIBLE' },
  );
  for (const runs of [
    [],
    [
      {
        head_sha: sha,
        event: 'pull_request',
        status: 'completed',
        conclusion: 'success',
      },
    ],
  ])
    await assert.rejects(eligibleFixture({ runs }).client.eligible(sha), {
      code: 'CI_NOT_APPROVED',
    });
});
test('latest failed CI attempt blocks release despite an older success', async () => {
  const template = {
    id: 12,
    head_sha: sha,
    head_branch: 'feature/microsservices',
    event: 'push',
    repository: { full_name: repository },
    path: '.github/workflows/ci.yml',
    status: 'completed',
    run_number: 1,
  };
  await assert.rejects(
    eligibleFixture({
      verifyConclusion: 'failure',
      runs: [
        { ...template, run_attempt: 1, conclusion: 'success' },
        { ...template, run_attempt: 2, conclusion: 'failure' },
      ],
    }).client.eligible(sha),
    { code: 'CI_NOT_APPROVED' },
  );
});
function provenanceFixture({
  baseline = false,
  reference = 'approved-record',
  creator = 'github-actions[bot]',
  state = 'success',
  hash = digest(manifest),
  runPath,
  runConclusion = 'failure',
} = {}) {
  const calls = [];
  const payload = {
    worker: 'billing',
    commitSha: sha,
    versionId: version,
    packageVersion: manifest.workers.billing.packageVersion,
    manifestDigest: hash,
    runId: '99',
    baseline,
    ...(baseline
      ? { manifest, qualificationReference: 'approved-record' }
      : {}),
  };
  const client = githubClient({
    repository,
    token: 'fixture',
    fetchImpl: async (url) => {
      const path = url.replace(
        `https://api.github.com/repos/${repository}`,
        '',
      );
      calls.push(path);
      if (path.startsWith('/deployments?'))
        return json([{ id: 3, creator: { login: creator }, sha, payload }]);
      if (path === '/deployments/3/statuses?per_page=1')
        return json([{ state }]);
      if (path === '/actions/runs/99')
        return json({
          event: 'workflow_dispatch',
          head_branch: 'feature/microsservices',
          head_sha: 'b'.repeat(40),
          path:
            runPath ??
            (baseline
              ? '.github/workflows/infrastructure-readiness.yml'
              : '.github/workflows/deploy-workers.yml'),
          repository: { full_name: repository },
          conclusion: runConclusion,
        });
      if (path.includes('/contents/.github/deploy/baseline.json'))
        return file({
          workers: {
            billing: {
              commitSha: sha,
              versionId: version,
              qualificationReference: reference,
            },
          },
        });
      if (path.includes('/contents/scripts/deploy/manifest.json'))
        return file(manifest);
      assert.fail(`Unexpected GitHub fixture ${path}`);
    },
  });
  return { client, calls };
}
test('verified destination in a partially failed run retains independent provenance', async () => {
  const { client } = provenanceFixture();
  assert.deepEqual(
    (await client.provenanceByVersion('billing', version)).workerManifest,
    manifest.workers.billing,
  );
});
test('baseline qualification is bound to a versioned reviewed inventory', async () => {
  assert.deepEqual(
    (
      await provenanceFixture({ baseline: true }).client.provenanceByVersion(
        'billing',
        version,
      )
    ).workerManifest,
    manifest.workers.billing,
  );
  await assert.rejects(
    provenanceFixture({
      baseline: true,
      reference: 'different-record',
    }).client.provenanceByVersion('billing', version),
    { code: 'PROVENANCE_UNAVAILABLE' },
  );
});
test('unassociated versions, altered manifests and unrelated workflows fail closed', async () => {
  for (const options of [
    { creator: 'unknown' },
    { state: 'failure' },
    { hash: '0'.repeat(64) },
    { runPath: '.github/workflows/ci.yml' },
  ])
    await assert.rejects(
      provenanceFixture(options).client.provenanceByVersion('billing', version),
      { code: 'PROVENANCE_UNAVAILABLE' },
    );
});
