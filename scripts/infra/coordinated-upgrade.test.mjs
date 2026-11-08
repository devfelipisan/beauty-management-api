import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coordinatedUpgrade } from './coordinated-upgrade.mjs';
import { coordinatedUpgradeRequest } from './coordinated-upgrade-request.mjs';
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
    releaseOrder.map((worker) => [
      worker,
      { versionId: version, commitSha: 'c'.repeat(40) },
    ]),
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
  releaseOrigin: 'coordinated-upgrade',
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
  f.github.provenanceByVersion = async (worker) => ({
    commitSha: 'c'.repeat(40),
    workerManifest: manifest.workers[worker],
  });
  f.github.assertFirstPublicationNeeded = () =>
    assert.fail('managed upgrade cannot use first publication');
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
test('coordinated upgrade verifies managed snapshots and records only the complete new set', async () => {
  const f = scenario();
  const report = await coordinatedUpgrade(f);
  assert.equal(report.status, 'success');
  assert.deepEqual(f.published, releaseOrder);
  assert.equal(f.records.length, 3);
  assert.ok(
    Object.values(report.previousVersions).every(
      (item) =>
        item.provenance === 'verified' &&
        item.commitSha === 'c'.repeat(40) &&
        item.percentage === 100,
    ),
  );
  assert.ok(
    f.records.every(
      (entry) =>
        entry.releaseOrigin === 'coordinated-upgrade' &&
        entry.coordinatedUpgrade.previousVersionId === version &&
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
    const report = await coordinatedUpgrade(f);
    assert.equal(report.status, 'failed');
    assert.equal(f.published.length, 0);
    assert.equal(f.records.length, 0);
  }
});
test('snapshot drift and incomplete migrations block all publication', async () => {
  for (const mode of ['drift', 'schema']) {
    const f = scenario();
    if (mode === 'drift') f.active.billing = next.billing;
    const request = f.client.request;
    f.client.request = (path, options = {}) => {
      if (mode === 'schema' && options.body?.sql.includes('d1_migrations'))
        return Promise.resolve([{ success: true, results: [] }]);
      return request(path, options);
    };
    const report = await coordinatedUpgrade(f);
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
  assert.equal((await coordinatedUpgrade(f)).status, 'failed');
  assert.equal(f.published.length, 0);
});
test('partial publication stops the sequence, records no provenance and preserves the recovery snapshot', async () => {
  const f = scenario(),
    publish = f.publish;
  f.publish = (worker) =>
    worker === 'clinical'
      ? { status: 1, stdout: 'PRIVATE_FAILURE' }
      : publish(worker);
  const report = await coordinatedUpgrade(f);
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
  const report = await coordinatedUpgrade(f);
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
  const report = await coordinatedUpgrade(f);
  assert.equal(report.status, 'recovery_required');
  assert.equal(f.records.length, 0);
  assert.equal(report.workers[0].verification, 'published_unverified');
});
test('partial GitHub registration remains a failed operation with recovery evidence', async () => {
  const f = scenario(),
    record = f.github.recordPublished;
  f.github.recordPublished = (entry) =>
    f.records.length ? Promise.reject(new Error('denied')) : record(entry);
  const report = await coordinatedUpgrade(f);
  assert.equal(report.status, 'recovery_required');
  assert.equal(report.records.length, 1);
  assert.equal(report.workers.length, 3);
});
test('individual release still blocks unknown active versions and never falls back to first publication', async () => {
  const f = scenario();
  f.context = {
    ...f.context,
    releaseOrigin: 'ci',
    mode: 'deploy',
    worker: 'billing',
  };
  f.github.provenanceByVersion = async () => {
    throw new Error('untrusted');
  };
  const report = await release(f);
  assert.equal(report.status, 'failed');
  assert.equal(f.published.length, 0);
  assert.throws(
    () => coordinatedUpgradeRequest({ ...requested(), bypass: true }, sha),
    { code: 'COORDINATED_UPGRADE_NOT_APPROVED' },
  );
});
test('unknown or unavailable prior provenance blocks the coordinated upgrade', async () => {
  const f = scenario();
  f.github.provenanceByVersion = async () => {
    throw new Error('normal release required or GitHub unavailable');
  };
  const report = await coordinatedUpgrade(f);
  assert.equal(report.status, 'failed');
  assert.equal(f.published.length, 0);
  assert.equal(f.records.length, 0);
});
test('deployment performs no beauty-r2 or media-capacity requests', async () => {
  const f = scenario();
  const request = f.client.request;
  f.client.request = (path, options = {}) => {
    assert.ok(!path.includes('/r2/'));
    assert.ok(!options.body?.sql?.includes('media_capacity'));
    assert.ok(!options.body?.params?.includes('beauty-r2'));
    return request(path, options);
  };
  assert.equal((await coordinatedUpgrade(f)).status, 'success');
  assert.equal(f.records.length, 3);
});

test('prior SHA mismatch, inconsistent current set and incompatible final set block before mutation', async () => {
  for (const mode of ['sha', 'current', 'candidate']) {
    const f = scenario();
    if (mode === 'sha')
      f.context.requested.workers.billing.commitSha = 'd'.repeat(40);
    if (mode === 'current')
      f.github.provenanceByVersion = async (worker) => ({
        commitSha: 'c'.repeat(40),
        workerManifest: {
          ...manifest.workers[worker],
          provided: { revision: '0'.repeat(64) },
        },
      });
    if (mode === 'candidate') {
      f.manifest = structuredClone(manifest);
      f.manifest.workers.billing.provided.revision = '0'.repeat(64);
    }
    const report = await coordinatedUpgrade(f);
    assert.equal(report.status, 'failed');
    assert.equal(f.published.length, 0);
    assert.equal(f.records.length, 0);
  }
});

test('maintenance upgrade accepts a coherent V1 set whose rolling V2 rollout remains blocked', async () => {
  const f = scenario();
  const old = structuredClone(manifest.workers);
  for (const [index, worker] of releaseOrder.entries())
    old[worker].provided.revision = String(index).repeat(64);
  for (const entry of Object.values(old))
    for (const dependency of Object.keys(entry.requires))
      entry.requires[dependency] = [old[dependency].provided.revision];
  const { simulateRelease } = await import('../deploy/manifest.mjs');
  assert.throws(() => simulateRelease(old, manifest, releaseOrder), {
    code: 'CONTRACT_INCOMPATIBLE',
  });
  f.github.provenanceByVersion = async (worker) => ({
    commitSha: 'c'.repeat(40),
    workerManifest: old[worker],
  });
  const report = await coordinatedUpgrade(f);
  assert.equal(report.status, 'success');
  assert.equal(f.records.length, 3);
});

test('coordinated request requires exact version and source SHA for every Worker', () => {
  for (const mutate of [
    (r) => {
      delete r.workers.billing.commitSha;
    },
    (r) => {
      r.workers.billing.commitSha = 'invalid';
    },
    (r) => {
      r.workers.billing.versionId = 'invalid';
    },
    (r) => {
      delete r.workers.clinical;
    },
    (r) => {
      r.bypass = true;
    },
    (r) => {
      r.maintenanceReference = '';
    },
  ]) {
    const value = requested();
    mutate(value);
    assert.throws(() => coordinatedUpgradeRequest(value, sha), {
      code: 'COORDINATED_UPGRADE_NOT_APPROVED',
    });
  }
});

test('enabled Operations scheduler blocks maintenance publication before uploads', async () => {
  const f = scenario(),
    request = f.client.request;
  f.client.request = async (path, options) => {
    const value = await request(path, options);
    if (path.includes('beauty-operations-worker') && path.endsWith('/settings'))
      value.bindings.push({
        name: 'CRONJOB_ENABLED',
        type: 'plain_text',
        text: 'true',
      });
    return value;
  };
  const report = await coordinatedUpgrade(f);
  assert.equal(report.status, 'failed');
  assert.equal(report.failure.code, 'SCHEDULE_MISMATCH');
  assert.equal(f.published.length, 0);
});

test('CLI requires explicit maintenance confirmation before eligibility or remote calls', async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const cli = resolve('scripts/infra/coordinated-upgrade.mjs');
  for (const confirmation of ['', 'false']) {
    const cwd = mkdtempSync(join(tmpdir(), 'coordinated-upgrade-'));
    try {
      const result = spawnSync(
        process.execPath,
        [cli, '--sha', sha, '--check'],
        {
          cwd,
          encoding: 'utf8',
          env: {
            GITHUB_ACTIONS: 'true',
            GITHUB_EVENT_NAME: 'workflow_dispatch',
            GITHUB_REF: 'refs/heads/feature/microsservices',
            MAINTENANCE_CONFIRMED: confirmation,
          },
        },
      );
      assert.equal(result.status, 1);
      const report = JSON.parse(
        readFileSync(
          join(cwd, '.cache/coordinated-upgrade/result.json'),
          'utf8',
        ),
      );
      assert.equal(report.failure.code, 'COORDINATED_UPGRADE_NOT_APPROVED');
      assert.deepEqual(report.workers, []);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
});
