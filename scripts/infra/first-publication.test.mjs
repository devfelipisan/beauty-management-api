import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstPublication } from './first-publication.mjs';
import { firstPublicationRequest } from './first-publication-request.mjs';
import {
  fixture,
  sha,
  version,
  configurations,
  manifest,
  response,
} from '../deploy/fixtures.mjs';
import { releaseOrder } from '../deploy/config-contract.mjs';
import { release } from '../deploy/release.mjs';
const requested = () => ({
  commitSha: sha,
  authorizationReference: 'review-authorization',
  compatibilityReference: 'review-rpc-compatibility',
  recoveryReference: 'review-recovery',
  maintenanceReference: 'review-quiesced-window',
  workers: Object.fromEntries(
    releaseOrder.map((worker) => [worker, { versionId: version }]),
  ),
});
const context = () => ({
  commitSha: sha,
  controlSha: 'b'.repeat(40),
  runId: '99',
  ciRunId: 10,
  ciRunAttempt: 1,
  verifyJobId: 30,
  releaseRunAttempt: 1,
  releaseOrigin: 'first-publication',
  requested: requested(),
  phase: 'preflight',
});
const next = Object.fromEntries(
  releaseOrder.map((worker, index) => [
    worker,
    `${index + 1}`.repeat(8) + '-1111-1111-1111-111111111111',
  ]),
);
function scenario() {
  const active = Object.fromEntries(
    releaseOrder.map((worker) => [worker, version]),
  );
  const f = fixture((path, body) => {
    if (path.endsWith('/deployments')) {
      const worker = path.match(
        /beauty-(operations|billing|clinical)-worker/,
      )[1];
      return response({
        deployments: [
          {
            id: `deployment-${worker}`,
            versions: [{ version_id: active[worker], percentage: 100 }],
          },
        ],
      });
    }
    if (body?.sql.includes('media_capacity'))
      return response([
        {
          success: true,
          results: [
            {
              inventory_approved: 1,
              policy_approved: 1,
              writers_coordinated: 1,
              approval_reference: 'approved',
              charged_bytes: 0,
              limit_bytes: 8_000_000_000,
            },
          ],
        },
      ]);
  });
  const records = [],
    published = [],
    saved = [];
  f.github.provenanceByVersion = async () => {
    throw new Error('Unknown old versions must not be attested');
  };
  f.github.assertFirstPublicationNeeded = async () => {};
  f.github.recordPublished = async (entry) => {
    assert.deepEqual(active, next);
    records.push(entry);
    return records.length;
  };
  return {
    ...f,
    active,
    records,
    published,
    saved,
    context: context(),
    configurations,
    manifest,
    publish: async (worker) => {
      published.push(worker);
      active[worker] = next[worker];
      return { status: 0, stdout: `Current Version ID: ${next[worker]}` };
    },
    persist: (report) => saved.push(structuredClone(report)),
  };
}
test('controlled first publication creates new traceable versions without assigning a SHA to unknown versions', async () => {
  const f = scenario();
  const report = await firstPublication(f);
  assert.equal(report.status, 'success');
  assert.deepEqual(f.published, releaseOrder);
  assert.equal(f.records.length, 3);
  assert.ok(
    Object.values(report.previousVersions).every(
      (item) =>
        item.provenance === 'unverified' &&
        !item.commitSha &&
        item.percentage === 100,
    ),
  );
  assert.ok(
    f.records.every(
      (entry) =>
        entry.releaseOrigin === 'first-publication' &&
        entry.firstPublication.previousVersionId === version &&
        entry.versionId === next[entry.worker],
    ),
  );
  assert.ok(
    f.saved.some(
      (entry) =>
        entry.workers.length === 0 &&
        Object.keys(entry.previousVersions).length === 3,
    ),
  );
});
test('empty request, mismatched candidate, missing approval or missing recovery references stop before mutation', async () => {
  for (const mutate of [
    (f) => {
      f.context.requested = { workers: {} };
    },
    (f) => {
      f.context.requested.commitSha = 'c'.repeat(40);
    },
    (f) => {
      f.context.requested.recoveryReference = '';
    },
    (f) => {
      f.context.requested.maintenanceReference = '';
    },
    (f) => {
      f.context.releaseOrigin = 'manual';
    },
    (f) => {
      f.context.requested.workers.billing.worker = 'clinical';
    },
  ]) {
    const f = scenario();
    mutate(f);
    const report = await firstPublication(f);
    assert.equal(report.status, 'failed');
    assert.equal(f.published.length, 0);
    assert.equal(f.records.length, 0);
  }
});
test('snapshot drift, incomplete migrations and missing media approvals block all publication', async () => {
  for (const mode of ['drift', 'schema', 'media']) {
    const f = scenario();
    if (mode === 'drift') f.active.billing = next.billing;
    const request = f.client.request;
    f.client.request = (path, options = {}) => {
      if (
        (mode === 'schema' && options.body?.sql.includes('d1_migrations')) ||
        (mode === 'media' && options.body?.sql.includes('media_capacity'))
      )
        return Promise.resolve([{ success: true, results: [] }]);
      return request(path, options);
    };
    const report = await firstPublication(f);
    assert.equal(report.status, 'failed');
    assert.equal(f.published.length, 0);
    assert.equal(f.records.length, 0);
  }
});
test('a split traffic snapshot is rejected before a first deployment', async () => {
  const f = scenario();
  const request = f.client.request;
  f.client.request = (path, options) =>
    path.endsWith('/deployments')
      ? Promise.resolve({
          deployments: [
            { versions: [{ version_id: version, percentage: 50 }] },
          ],
        })
      : request(path, options);
  assert.equal((await firstPublication(f)).status, 'failed');
  assert.equal(f.published.length, 0);
});
test('partial publication stops the sequence, records no provenance and preserves the recovery snapshot', async () => {
  const f = scenario(),
    publish = f.publish;
  f.publish = (worker) =>
    worker === 'clinical'
      ? { status: 1, stdout: 'PRIVATE_FAILURE' }
      : publish(worker);
  const report = await firstPublication(f);
  assert.equal(report.status, 'recovery_required');
  assert.deepEqual(f.published, ['billing']);
  assert.equal(f.records.length, 0);
  assert.equal(report.previousVersions.billing.versionId, version);
  assert.equal(report.workers[0].version, next.billing);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_FAILURE'));
});
test('drift during rollout stops later Workers and blocks any GitHub record', async () => {
  const f = scenario(),
    publish = f.publish;
  f.publish = async (worker) => {
    const result = await publish(worker);
    if (worker === 'billing') f.active.operations = next.operations;
    return result;
  };
  const report = await firstPublication(f);
  assert.equal(report.status, 'recovery_required');
  assert.deepEqual(f.published, ['billing']);
  assert.equal(f.records.length, 0);
});
test('a postcheck failure never attests a newly uploaded Worker', async () => {
  const f = scenario();
  f.publish = async (worker) => {
    f.published.push(worker);
    return { status: 0, stdout: `Current Version ID: ${next[worker]}` };
  };
  const report = await firstPublication(f);
  assert.equal(report.status, 'recovery_required');
  assert.equal(f.records.length, 0);
  assert.equal(report.workers[0].verification, 'published_unverified');
});
test('partial GitHub registration remains a failed operation with recovery evidence', async () => {
  const f = scenario(),
    record = f.github.recordPublished;
  f.github.recordPublished = (entry) =>
    f.records.length ? Promise.reject(new Error('denied')) : record(entry);
  const report = await firstPublication(f);
  assert.equal(report.status, 'recovery_required');
  assert.equal(report.records.length, 1);
  assert.equal(report.workers.length, 3);
});
test('normal release still blocks unknown active versions and never falls back to first publication', async () => {
  const f = scenario();
  f.context = {
    ...f.context,
    releaseOrigin: 'ci',
    mode: 'deploy',
    worker: 'all',
  };
  const report = await release(f);
  assert.equal(report.status, 'failed');
  assert.equal(f.published.length, 0);
  assert.throws(
    () => firstPublicationRequest({ ...requested(), bypass: true }, sha),
    { code: 'FIRST_PUBLICATION_NOT_APPROVED' },
  );
});
test('normal trusted topology cannot use exceptional publication and GitHub failures block mutations', async () => {
  const f = scenario();
  f.github.assertFirstPublicationNeeded = async () => {
    throw new Error('normal release required or GitHub unavailable');
  };
  const report = await firstPublication(f);
  assert.equal(report.status, 'failed');
  assert.equal(f.published.length, 0);
  assert.equal(f.records.length, 0);
});
