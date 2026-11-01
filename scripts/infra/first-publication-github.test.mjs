import { test } from 'node:test';
import assert from 'node:assert/strict';
import { githubClient } from '../deploy/github-client.mjs';
import { digest } from '../deploy/manifest.mjs';
import { firstPublicationWorkflow } from './first-publication-request.mjs';
import {
  configurations,
  manifest,
  sha,
  version,
  fixture,
} from '../deploy/fixtures.mjs';
import { preflight } from '../deploy/preflight.mjs';
const repository = 'owner/beauty',
  controlSha = 'b'.repeat(40);
const json = (value) => ({ ok: true, json: async () => value });
const file = (value) =>
  json({
    encoding: 'base64',
    content: Buffer.from(JSON.stringify(value)).toString('base64'),
  });
function scenario(mutate = () => {}) {
  const requested = {
    commitSha: sha,
    authorizationReference: 'review-auth',
    compatibilityReference: 'review-rpc',
    recoveryReference: 'review-recovery',
    maintenanceReference: 'review-window',
    workers: Object.fromEntries(
      Object.keys(configurations).map((worker) => [
        worker,
        { versionId: '11111111-1111-1111-1111-111111111111' },
      ]),
    ),
  };
  const own = {
    id: 99,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    head_sha: controlSha,
    event: 'workflow_dispatch',
    head_branch: 'feature/microsservices',
    repository: { full_name: repository },
    path: firstPublicationWorkflow,
  };
  const ci = {
    id: 10,
    run_attempt: 1,
    run_number: 5,
    status: 'completed',
    conclusion: 'failure',
    event: 'push',
    head_sha: sha,
    head_branch: 'feature/microsservices',
    repository: { full_name: repository },
    path: '.github/workflows/ci.yml',
  };
  const job = {
    id: 30,
    run_id: 10,
    name: 'verify',
    status: 'completed',
    conclusion: 'success',
    head_sha: sha,
  };
  const execution = {
    event: 'workflow_dispatch',
    runId: '99',
    runAttempt: '1',
    controlSha,
    repository,
    ref: 'refs/heads/feature/microsservices',
  };
  const values = { own, ci, job, execution, requested };
  mutate(values);
  const records = [],
    calls = [];
  const client = githubClient({
    repository,
    token: 'fixture',
    execution,
    fetchImpl: async (url, options) => {
      const path = url.replace(
        `https://api.github.com/repos/${repository}`,
        '',
      );
      calls.push(path);
      if (path === '/actions/runs/99' || path === '/actions/runs/99/attempts/1')
        return json(own);
      if (path.startsWith('/compare/'))
        return json({ status: 'ahead', merge_base_commit: { sha } });
      if (path.startsWith('/actions/workflows/ci.yml/runs'))
        return json({ workflow_runs: [ci] });
      if (path === '/actions/runs/10/attempts/1') return json(ci);
      if (path.startsWith('/actions/runs/10/attempts/1/jobs'))
        return json({ jobs: [job] });
      if (
        path ===
        `/contents/.github/deploy/first-publication.json?ref=${controlSha}`
      )
        return file(requested);
      if (path === `/contents/scripts/deploy/manifest.json?ref=${sha}`)
        return file(manifest);
      if (path.startsWith('/deployments?')) {
        const worker = /task=beauty-release-([^&]+)/.exec(path)[1];
        return json(
          records.filter((record) => record.payload.worker === worker),
        );
      }
      if (path === '/deployments' && options.method === 'POST') {
        const body = JSON.parse(options.body);
        const record = {
          id: records.length + 1,
          sha: body.ref,
          creator: { login: 'github-actions[bot]' },
          payload: body.payload,
        };
        records.push(record);
        return json(record);
      }
      if (/^\/deployments\/\d+\/statuses/.test(path))
        return json(
          options.method === 'POST'
            ? { state: 'success' }
            : [{ state: 'success' }],
        );
      assert.fail(`Unexpected GitHub fixture ${path}`);
    },
  });
  return { ...values, client, calls, records };
}
test('first eligibility accepts a failed normal release when its immutable verify job passed', async () => {
  const f = scenario();
  const proof = await f.client.firstPublicationEligible(sha);
  assert.equal(proof.releaseOrigin, 'first-publication');
  assert.equal(proof.ciRunId, 10);
  assert.equal(proof.requested.commitSha, sha);
  assert.ok(!f.calls.some((path) => path.startsWith('/deployments')));
});
test('first eligibility rejects wrong workflow, branch, SHA, review request and failed CI', async () => {
  for (const mutate of [
    (v) => {
      v.own.path = '.github/workflows/deploy-workers.yml';
    },
    (v) => {
      v.own.event = 'push';
    },
    (v) => {
      v.execution.ref = 'refs/heads/main';
    },
    (v) => {
      v.own.head_sha = sha;
    },
    (v) => {
      v.requested.commitSha = 'c'.repeat(40);
    },
    (v) => {
      v.requested.recoveryReference = '';
    },
    (v) => {
      v.job.conclusion = 'failure';
    },
    (v) => {
      v.ci.status = 'in_progress';
    },
  ])
    await assert.rejects(scenario(mutate).client.firstPublicationEligible(sha));
});
async function register(f) {
  const context = await f.client.firstPublicationEligible(sha);
  for (const worker of Object.keys(configurations))
    await f.client.recordPublished({
      ...context,
      worker,
      versionId: version,
      manifest,
      packageVersion: manifest.workers[worker].packageVersion,
      firstPublication: {
        requestDigest: digest(f.requested),
        previousVersionId: f.requested.workers[worker].versionId,
      },
    });
}
test('NO_RECORDS becomes accepted provenance after successful controlled publication and normal preflight works', async () => {
  const f = scenario();
  await assert.rejects(f.client.provenanceByVersion('billing', version), {
    code: 'PROVENANCE_UNAVAILABLE',
    provenanceReason: 'NO_RECORDS',
  });
  await register(f);
  const proof = await f.client.provenanceByVersion('billing', version);
  assert.equal(proof.commitSha, sha);
  const cloud = fixture();
  assert.equal(
    (
      await preflight({
        client: cloud.client,
        github: f.client,
        configurations,
        manifest,
        context: { worker: 'all', commitSha: sha },
      })
    ).valid,
    true,
  );
  await assert.rejects(
    f.client.provenanceByVersion(
      'billing',
      '22222222-2222-2222-2222-222222222222',
    ),
    { code: 'PROVENANCE_UNAVAILABLE' },
  );
});
test('failed first workflow or altered approval digest cannot establish provenance', async () => {
  for (const mutate of [
    (f) => {
      f.own.conclusion = 'failure';
    },
    (f) => {
      f.records.find(
        (record) => record.payload.worker === 'billing',
      ).payload.firstPublication.requestDigest = '0'.repeat(64);
    },
    (f) => {
      f.own.path = '.github/workflows/deploy-workers.yml';
    },
  ]) {
    const f = scenario();
    await register(f);
    mutate(f);
    await assert.rejects(f.client.provenanceByVersion('billing', version), {
      code: 'PROVENANCE_UNAVAILABLE',
    });
  }
});
test('first publication is unavailable after all active versions have accepted provenance', async () => {
  const f = scenario();
  const versions = Object.fromEntries(
    Object.keys(configurations).map((worker) => [worker, version]),
  );
  await f.client.assertFirstPublicationNeeded(versions);
  await register(f);
  await assert.rejects(f.client.assertFirstPublicationNeeded(versions), {
    code: 'FIRST_PUBLICATION_NOT_APPROVED',
  });
});
test('GitHub access failures cannot be treated as permission for first publication', async () => {
  const client = githubClient({
    repository,
    token: 'fixture',
    fetchImpl: async () => ({ ok: false, status: 403 }),
  });
  await assert.rejects(
    client.assertFirstPublicationNeeded(
      Object.fromEntries(
        Object.keys(configurations).map((worker) => [worker, version]),
      ),
    ),
    { code: 'REMOTE_ACCESS_DENIED' },
  );
});

test('existing rejected records and mixed trusted/untracked topology require recovery', async () => {
  const versions = Object.fromEntries(
    Object.keys(configurations).map((worker) => [worker, version]),
  );
  const rejected = scenario();
  rejected.records.push({
    id: 1,
    payload: { worker: 'billing', commitSha: 'invalid' },
  });
  await assert.rejects(rejected.client.assertFirstPublicationNeeded(versions), {
    code: 'PROVENANCE_UNAVAILABLE',
    provenanceReason: 'NO_ACCEPTED_RECORD',
  });
  const mixed = scenario();
  await register(mixed);
  const billing = mixed.records.filter(
    (record) => record.payload.worker === 'billing',
  );
  mixed.records.splice(0, mixed.records.length, ...billing);
  await assert.rejects(mixed.client.assertFirstPublicationNeeded(versions), {
    code: 'FIRST_PUBLICATION_NOT_APPROVED',
  });
});

test('incomplete or malformed first-publication snapshots cannot authorize the initial path', async () => {
  const f = scenario();
  for (const value of [
    {},
    { billing: version },
    { billing: 'invalid', clinical: version, operations: version },
  ])
    await assert.rejects(f.client.assertFirstPublicationNeeded(value), {
      code: 'FIRST_PUBLICATION_NOT_APPROVED',
    });
});
