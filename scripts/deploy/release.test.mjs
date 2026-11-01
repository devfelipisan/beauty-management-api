import { test } from 'node:test';
import assert from 'node:assert/strict';
import { release } from './release.mjs';
import { preflight } from './preflight.mjs';
import { postcheck } from './postcheck.mjs';
import { simulateRelease, validateManifest } from './manifest.mjs';
import { fail, diagnostic } from './errors.mjs';
import {
  fixture,
  configurations,
  manifest,
  sha,
  version,
  response,
  settings,
} from './fixtures.mjs';
const context = {
  mode: 'deploy',
  worker: 'all',
  commitSha: sha,
  requestId: 'fixture-release',
  runId: '42',
};
const published = () => ({
  status: 0,
  stdout: `Current Version ID: ${version}`,
});
test('complete release has one preflight, directed postchecks and per-Worker provenance', async () => {
  const f = fixture(),
    order = [],
    records = [];
  let checks = 0;
  f.github.recordPublished = async (record) => {
    records.push(record);
    return records.length;
  };
  const result = await release({
    ...f,
    context,
    configurations,
    manifest,
    publish: (name) => {
      order.push(name);
      return published();
    },
    preflightImpl: async (args) => {
      checks++;
      return preflight(args);
    },
  });
  assert.equal(result.status, 'success');
  assert.equal(checks, 1);
  assert.deepEqual(order, ['billing', 'clinical', 'operations']);
  assert.equal(records.length, 3);
  assert.equal(f.client.metrics.calls, 20);
  assert.equal(f.calls.filter((c) => c.body).length, 1);
  assert.ok(
    f.calls.every(
      (c) =>
        !c.path.includes('/secrets') &&
        !c.path.includes('/domains/') &&
        !c.body?.sql.includes('media_capacity'),
    ),
  );
});
test('failed second publication retains first proof and stops Operations', async () => {
  const f = fixture(),
    order = [],
    snapshots = [];
  const result = await release({
    ...f,
    context,
    configurations,
    manifest,
    publish: (name) => {
      order.push(name);
      return name === 'clinical'
        ? { status: 1, stderr: 'private token' }
        : published();
    },
    persist: (r) => snapshots.push(structuredClone(r)),
  });
  assert.equal(result.status, 'failed');
  assert.deepEqual(order, ['billing', 'clinical']);
  assert.equal(result.workers[0].verification, 'passed');
  assert.equal(result.workers[0].githubDeploymentId, 42);
  assert.equal(result.failure.code, 'WRANGLER_FAILED');
  assert.ok(!JSON.stringify(snapshots).includes('private token'));
});
test('postcheck failure retains actual published version and prevents next destination', async () => {
  const f = fixture(),
    order = [];
  const result = await release({
    ...f,
    context,
    configurations,
    manifest,
    publish: (name) => {
      order.push(name);
      return published();
    },
    postcheckImpl: async () =>
      fail('PUBLIC_EXPOSURE', { phase: 'postcheck', worker: 'billing' }),
  });
  assert.deepEqual(order, ['billing']);
  assert.equal(result.workers[0].version, version);
  assert.equal(result.workers[0].verification, 'failed');
  assert.equal(result.failure.code, 'PUBLIC_EXPOSURE');
});
test('preflight failure prevents every publication', async () => {
  const f = fixture();
  const result = await release({
    ...f,
    context,
    configurations,
    manifest,
    publish: () => assert.fail('must not publish'),
    preflightImpl: async () => fail('SCHEMA_NOT_READY', { phase: 'preflight' }),
  });
  assert.equal(result.workers.length, 0);
  assert.equal(result.failure.code, 'SCHEMA_NOT_READY');
});
test('individual Clinical release requires no bucket or media approvals', async () => {
  const f = fixture();
  await preflight({
    ...f,
    context: { ...context, worker: 'clinical' },
    configurations,
    manifest,
  });
  assert.equal(f.calls.length, 7);
  assert.ok(f.calls.every((c) => !c.path.includes('/r2/')));
});
test('receiver runtime drift blocks publication without checking its bucket readiness', async () => {
  const f = fixture((path) => {
    if (!path.includes('beauty-operations-worker/settings')) return;
    const state = settings('operations');
    state.bindings = state.bindings.map((b) =>
      b.name === 'AUTH_PROVIDER' ? { ...b, text: 'mock' } : b,
    );
    return response(state);
  });
  await assert.rejects(
    preflight({
      ...f,
      context: { ...context, worker: 'clinical' },
      configurations,
      manifest,
    }),
    { code: 'BINDING_VALUE_INVALID', worker: 'operations' },
  );
  assert.ok(f.calls.every((c) => !c.path.includes('/r2/')));
});
test('schema incompatibility blocks before publishing and never writes D1', async () => {
  const f = fixture((path) =>
    path.endsWith('/query')
      ? response([{ success: true, results: [] }])
      : undefined,
  );
  await assert.rejects(preflight({ ...f, context, configurations, manifest }), {
    code: 'SCHEMA_NOT_READY',
  });
  assert.ok(
    f.calls
      .filter((c) => c.body)
      .every((c) => c.method === 'POST' && c.body.sql.startsWith('SELECT')),
  );
});
test('all is rejected if an intermediate topology is incompatible', () => {
  const current = structuredClone(manifest.workers),
    candidate = structuredClone(manifest);
  const revised = 'b'.repeat(64);
  candidate.workers.billing.provided.revision = revised;
  candidate.workers.operations.requires.billing = [revised];
  candidate.workers.clinical.requires.billing = [revised];
  assert.throws(
    () =>
      simulateRelease(current, candidate, [
        'billing',
        'clinical',
        'operations',
      ]),
    { code: 'CONTRACT_INCOMPATIBLE' },
  );
});
test('manifest rejects invented revisions and incomplete transitions', () => {
  const candidate = structuredClone(manifest);
  candidate.workers.billing.provided.revision = 'c'.repeat(64);
  assert.throws(() => validateManifest(candidate, manifest), {
    code: 'MANIFEST_INVALID',
  });
  const transition = structuredClone(manifest);
  transition.workers.operations.transitions = [
    {
      name: 'PROFILE_MEDIA',
      previous: { name: 'PROFILE_MEDIA', type: 'r2_bucket' },
      reason: 'reviewed change',
    },
  ];
  assert.throws(() => validateManifest(transition, manifest), {
    code: 'MANIFEST_INVALID',
  });
});
test('postcheck reads only its Worker and rejects stale version or public exposure', async () => {
  for (const override of [
    (path) =>
      path.endsWith('/subdomain')
        ? response({ enabled: true, previews_enabled: false })
        : undefined,
    (path) =>
      path.endsWith('/settings')
        ? response({
            ...settings('billing'),
            bindings: settings('billing').bindings.map((b) =>
              b.name === 'SERVICE_VERSION' ? { ...b, text: 'b'.repeat(40) } : b,
            ),
          })
        : undefined,
  ]) {
    const f = fixture(override);
    await assert.rejects(
      postcheck({
        client: f.client,
        worker: 'billing',
        versionId: version,
        commitSha: sha,
        configuration: configurations.billing,
      }),
    );
    assert.ok(f.calls.every((c) => c.path.includes('beauty-billing-worker')));
  }
});
test('safe diagnostics exclude unknown upstream data and unapproved fields', () => {
  assert.deepEqual(Object.keys(diagnostic(new Error('private'))), [
    'code',
    'phase',
    'operation',
  ]);
});
