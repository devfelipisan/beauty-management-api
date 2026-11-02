import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialAdoption } from './initial-adoption.mjs';
import {
  fixture,
  sha,
  version,
  manifest,
  configurations,
  response,
} from '../deploy/fixtures.mjs';
import { preflight } from '../deploy/preflight.mjs';
const context = { runId: '99', commitSha: sha, phase: 'readiness' };
const baseline = () => ({
  workers: Object.fromEntries(
    Object.keys(configurations).map((worker) => [
      worker,
      {
        commitSha: sha,
        versionId: version,
        qualificationReference: 'reviewed-historical-release',
        evidence: {
          runId: 10,
          runAttempt: 1,
          artifactId: 20,
          artifactDigest: `sha256:${'a'.repeat(64)}`,
        },
      },
    ]),
  ),
});
function scenario() {
  let changed = false;
  const f = fixture((path, body) => {
    if (changed && path.endsWith('/deployments'))
      return response({
        deployments: [
          {
            versions: [
              {
                version_id: '11111111-1111-1111-1111-111111111111',
                percentage: 100,
              },
            ],
          },
        ],
      });
    if (body?.sql.includes('media_capacity'))
      return response([
        {
          success: true,
          results: [
            {
              inventory_approved: 1,
              policy_approved: 1,
              writers_coordinated: 1,
              approval_reference: 'reviewed',
              charged_bytes: 0,
              limit_bytes: 8_000_000_000,
            },
          ],
        },
      ]);
  });
  const records = [];
  f.github.provenanceByVersion = async () => {
    throw new Error('must not query existing provenance');
  };
  f.github.adoptionEvidence = async (_, entry) => entry.evidence;
  f.github.recordPublished = async (entry) => {
    records.push(entry);
    return records.length;
  };
  return {
    ...f,
    baseline: baseline(),
    context,
    source: () => ({
      manifest: structuredClone(manifest),
      configurations: structuredClone(configurations),
    }),
    records,
    mutate: () => {
      changed = true;
    },
  };
}
test('first adoption qualifies all workers without previous records and registers only after final fresh reads', async () => {
  const f = scenario();
  const result = await initialAdoption(f);
  assert.equal(result.length, 3);
  assert.equal(f.records.length, 3);
  assert.ok(
    f.records.every(
      (record) => record.baseline && record.adoptionEvidence && record.manifest,
    ),
  );
  assert.equal(
    f.calls.filter((call) => call.path.endsWith('/deployments')).length,
    6,
  );
});
test('empty baseline, arbitrary SHA and absent independent evidence do not register anything', async () => {
  for (const mutate of [
    (f) => {
      f.baseline.workers.billing.worker = 'clinical';
    },
    (f) => {
      f.baseline = { workers: {} };
    },
    (f) => {
      f.baseline.workers.billing.commitSha = 'arbitrary';
    },
    (f) => {
      f.github.adoptionEvidence = async () => {
        throw new Error('no independent evidence');
      };
    },
  ]) {
    const f = scenario();
    mutate(f);
    await assert.rejects(initialAdoption(f));
    assert.equal(f.records.length, 0);
  }
});
test('version changed while checking historical evidence aborts all registration', async () => {
  const f = scenario();
  f.github.adoptionEvidence = async (_, entry) => {
    f.mutate();
    return entry.evidence;
  };
  await assert.rejects(initialAdoption(f), {
    code: 'PUBLISHED_VERSION_MISMATCH',
  });
  assert.equal(f.records.length, 0);
});
test('fresh final reads detect drift after readiness and invalidate the cached snapshot', async () => {
  const f = scenario();
  f.readiness = async () => {
    f.mutate();
  };
  await assert.rejects(initialAdoption(f), {
    code: 'PUBLISHED_VERSION_MISMATCH',
  });
  assert.equal(f.records.length, 0);
});
test('incompatible historical RPC contracts prevent registration', async () => {
  const f = scenario();
  const original = f.source;
  f.source = () => {
    const value = original();
    value.manifest.workers.billing.requires.operations = ['unapproved'];
    return value;
  };
  await assert.rejects(initialAdoption(f), { code: 'CONTRACT_INCOMPATIBLE' });
  assert.equal(f.records.length, 0);
});
test('schema and readiness failures prevent adoption before any GitHub write', async () => {
  const f = scenario();
  f.readiness = async () => {
    throw new Error('capacity approval pending');
  };
  await assert.rejects(initialAdoption(f));
  assert.equal(f.records.length, 0);
  const s = scenario();
  const request = s.client.request;
  s.client.request = (path, options) =>
    options.body?.sql.includes('d1_migrations')
      ? response([])
          .json()
          .then((v) => v.result)
      : request(path, options);
  await assert.rejects(initialAdoption(s), { code: 'SCHEMA_NOT_READY' });
  assert.equal(s.records.length, 0);
});
test('partial registration failure preserves confirmed records and never reports full success', async () => {
  const f = scenario();
  let saved;
  f.persist = (records) => {
    saved = [...records];
  };
  const record = f.github.recordPublished;
  f.github.recordPublished = (entry) =>
    f.records.length
      ? Promise.reject(new Error('GitHub denied'))
      : record(entry);
  await assert.rejects(initialAdoption(f));
  assert.equal(saved.length, 1);
});
test('individual release still requires provenance, including after manual version replacement', async () => {
  const f = fixture();
  f.github.provenanceByVersion = async () => {
    throw Object.assign(new Error('untrusted active version'), {
      code: 'PROVENANCE_UNAVAILABLE',
    });
  };
  await assert.rejects(
    preflight({
      ...f,
      configurations,
      manifest,
      context: { ...context, worker: 'billing' },
    }),
    { code: 'PROVENANCE_UNAVAILABLE' },
  );
});
