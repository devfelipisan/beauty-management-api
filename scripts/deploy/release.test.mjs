import { test } from 'node:test';
import assert from 'node:assert/strict';
import { release } from './release.mjs';
import { preflight } from './preflight.mjs';
import { postcheck } from './postcheck.mjs';
import { activeVersion } from './worker-state.mjs';
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
test('active version rejects malformed UUIDs and split traffic', () => {
  for (const versions of [
    [{ version_id: '-'.repeat(36), percentage: 100 }],
    [{ version_id: version, percentage: 50 }],
  ]) {
    assert.throws(() => activeVersion({ deployments: [{ versions }] }, {}), {
      code: 'PUBLISHED_VERSION_MISMATCH',
    });
  }
});
test('complete release validates provenance once, postchecks every Worker and never queries R2', async () => {
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
  assert.ok(records.every((record) => record.verificationMethod === undefined));
  assert.equal(result.verificationPolicy, 'provenance-and-postcheck');
  assert.ok(
    f.calls.every(
      (c) =>
        !c.path.includes('/secrets') &&
        !c.path.includes('/domains/') &&
        !c.path.includes('/r2/') &&
        !c.body?.sql.includes('media_capacity'),
    ),
  );
});
test('complete release accepts normalized production service selectors', async () => {
  const f = fixture((path) => {
    if (!path.endsWith('/settings')) return;
    const name = path.match(/beauty-(operations|billing|clinical)-worker/)[1];
    const value = settings(name);
    value.bindings = value.bindings.map((binding) =>
      binding.type === 'service'
        ? { ...binding, environment: 'production' }
        : binding,
    );
    return response(value);
  });
  const order = [];
  const result = await release({
    ...f,
    context,
    configurations,
    manifest,
    publish: (name) => {
      order.push(name);
      return published();
    },
  });
  assert.equal(result.status, 'success');
  assert.deepEqual(order, ['billing', 'clinical', 'operations']);
  assert.equal(f.client.metrics.calls, 20);
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
    context: { ...context, worker: 'billing' },
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
  assert.equal(result.workers[0].verification, 'published_unverified');
  assert.equal(result.status, 'published_unverified');
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
  await assert.rejects(
    preflight({
      ...f,
      context: { ...context, worker: 'clinical' },
      configurations,
      manifest,
    }),
    {
      code: 'SCHEMA_NOT_READY',
    },
  );
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
            bindings: [
              ...settings('billing').bindings,
              {
                name: 'SERVICE_VERSION',
                type: 'plain_text',
                text: 'b'.repeat(40),
              },
            ],
          })
        : undefined,
  ]) {
    const f = fixture(override);
    await assert.rejects(
      postcheck({
        client: f.client,
        worker: 'billing',
        versionId: version,
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
test('missing previous provenance blocks all Workers before any publication', async () => {
  const f = fixture();
  f.github.provenanceByVersion = async () =>
    fail('PROVENANCE_UNAVAILABLE', {
      phase: 'provenance',
      operation: 'github.deployment',
      worker: 'billing',
    });
  const result = await release({
    ...f,
    context,
    configurations,
    manifest,
    publish: () =>
      assert.fail('must not publish without trusted previous versions'),
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.failure.code, 'PROVENANCE_UNAVAILABLE');
  assert.equal(result.workers.length, 0);
});
test('full publication retains actual versions and stops if GitHub registration fails', async () => {
  const f = fixture();
  const order = [];
  f.github.recordPublished = async () => {
    throw new Error('registration unavailable');
  };
  const result = await release({
    ...f,
    context,
    configurations,
    manifest,
    publish: (worker) => {
      order.push(worker);
      return published();
    },
  });
  assert.deepEqual(order, ['billing']);
  assert.equal(result.status, 'published_unverified');
  assert.equal(result.workers[0].version, version);
  assert.equal(result.cloudflare.calls, 12);
});
test('native publication failures preserve sanitized cause and exit code in the release report', async () => {
  const f = fixture();
  const result = await release({
    ...f,
    context,
    configurations,
    manifest,
    publish: () => ({
      status: 1,
      stderr: 'Cloudflare API failed [code: 10021] PRIVATE_VALUE',
    }),
  });
  assert.equal(result.failure.code, 'WRANGLER_FAILED');
  assert.equal(result.failure.wranglerReason, 'CLOUDFLARE_API_ERROR');
  assert.equal(result.failure.exitCode, 1);
  assert.equal(result.failure.upstreamCode, 10021);
  assert.equal(result.workers.length, 1);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_VALUE'));
  assert.equal(result.cloudflare.calls, 8);
});
test('schema not ready and incompatible active contracts prevent every Worker upload', async () => {
  for (const mode of ['schema', 'contracts']) {
    const f = fixture((path) =>
      mode === 'schema' && path.endsWith('/query')
        ? response([{ success: true, results: [] }])
        : undefined,
    );
    if (mode === 'contracts') {
      const lookup = f.github.provenanceByVersion;
      f.github.provenanceByVersion = async (name) => {
        const proof = structuredClone(await lookup(name));
        if (name === 'billing')
          proof.workerManifest.provided.revision = 'f'.repeat(64);
        return proof;
      };
    }
    const result = await release({
      ...f,
      context,
      configurations,
      manifest,
      publish: () => assert.fail('must stop before upload'),
    });
    assert.equal(result.status, 'failed');
    assert.equal(
      result.failure.code,
      mode === 'schema' ? 'SCHEMA_NOT_READY' : 'CONTRACT_INCOMPATIBLE',
    );
    assert.equal(result.workers.length, 0);
  }
});
test('full release stops after a stale published version without touching the next Worker or R2', async () => {
  let billingReads = 0;
  const f = fixture((path) => {
    if (
      path.includes('beauty-billing-worker/deployments') &&
      ++billingReads > 1
    )
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
  });
  const order = [];
  const result = await release({
    ...f,
    context,
    configurations,
    manifest,
    publish: (name) => {
      order.push(name);
      return published();
    },
  });
  assert.equal(result.status, 'published_unverified');
  assert.equal(result.failure.code, 'PUBLISHED_VERSION_MISMATCH');
  assert.deepEqual(order, ['billing']);
  assert.ok(f.calls.every((call) => !call.path.includes('/r2/')));
});

test('D1 HTTP 400 blocks every upload and distinguishes absent migration history', async () => {
  for (const [message, code, databaseReason] of [
    [
      'D1_ERROR: no such table: d1_migrations: SQLITE_ERROR',
      'SCHEMA_NOT_READY',
      'MIGRATION_HISTORY_MISSING',
    ],
    ['SQL rejected; sensitive response', 'REMOTE_HTTP_ERROR', 'QUERY_REJECTED'],
  ]) {
    const f = fixture((path) =>
      path.endsWith('/query')
        ? {
            ok: false,
            status: 400,
            json: async () => ({
              success: false,
              errors: [{ code: 7500, message }],
            }),
          }
        : undefined,
    );
    let uploads = 0;
    const result = await release({
      ...f,
      context,
      configurations,
      manifest,
      publish: () => {
        uploads++;
        return published();
      },
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.code, code);
    assert.equal(result.failure.databaseReason, databaseReason);
    assert.equal(result.failure.operation, 'database.schema');
    assert.equal(result.failure.status, 400);
    assert.ok(!JSON.stringify(result).includes(message));
    assert.equal(uploads, 0);
    assert.ok(!f.calls.some(({ path }) => path.includes('/r2/')));
    assert.equal(
      f.calls.filter(({ path }) => path.endsWith('/query')).length,
      1,
    );
  }
});

test('release preserves and verifies the schedule configured in Worker bindings', async () => {
  const f = fixture((path) => {
    if (path.includes('beauty-operations-worker/settings')) {
      const state = settings('operations');
      state.bindings.push({
        name: 'CRONJOB_ENABLED',
        type: 'plain_text',
        text: 'true',
      });
      return response(state);
    }
    if (path.includes('beauty-operations-worker/schedules'))
      return response({ schedules: [{ cron: '0 3 * * *' }] });
  });
  const records = [];
  f.github.recordPublished = async (record) => {
    records.push(record);
    return 1;
  };
  const report = await release({
    ...f,
    context,
    configurations,
    manifest,
    publish: published,
  });
  assert.equal(report.status, 'success');
  assert.equal(report.cronManagement, 'worker-settings-and-triggers');
  assert.deepEqual(
    records.find((record) => record.worker === 'operations').scheduledCrons,
    ['0 3 * * *'],
  );
  assert.equal(report.workers.length, 3);
});

test('unexpected remote schedule blocks release without overwriting it', async () => {
  const f = fixture((path) =>
    path.includes('beauty-operations-worker/schedules')
      ? response({ schedules: [{ cron: '*/1 * * * *' }] })
      : undefined,
  );
  const report = await release({
    ...f,
    context,
    configurations,
    manifest,
    publish: published,
  });
  assert.equal(report.status, 'failed');
  assert.equal(report.workers.length, 0);
  assert.equal(report.failure.code, 'SCHEDULE_MISMATCH');
  assert.ok(
    f.calls.every(
      (call) => call.method === 'GET' || call.body?.sql?.startsWith('SELECT'),
    ),
  );
});
