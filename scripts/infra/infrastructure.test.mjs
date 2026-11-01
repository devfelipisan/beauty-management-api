import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { infrastructureReadiness } from './readiness.mjs';
import { auditInfrastructure } from './audit.mjs';
import { migrationHistory } from './migrations.mjs';
import {
  fixture,
  configurations,
  manifest,
  response,
  settings,
} from '../deploy/fixtures.mjs';
const capacity = {
  inventory_approved: 1,
  policy_approved: 1,
  writers_coordinated: 1,
  approval_reference: 'fixture-approval',
  charged_bytes: 100,
  limit_bytes: 8_000_000_000,
};
test('media readiness validates real approvals without changing them or listing objects', async () => {
  for (const [changes, code] of [
    [{ inventory_approved: 0 }, 'CAPACITY_INVENTORY_PENDING'],
    [{ policy_approved: 0 }, 'CAPACITY_POLICY_PENDING'],
    [{ writers_coordinated: 0 }, 'CAPACITY_WRITERS_PENDING'],
    [{ charged_bytes: 9_000_000_000 }, 'CAPACITY_RESPONSE_INVALID'],
  ]) {
    const f = fixture((path, body) =>
      body?.sql.includes('media_capacity')
        ? response([{ success: true, results: [{ ...capacity, ...changes }] }])
        : undefined,
    );
    await assert.rejects(infrastructureReadiness({ ...f, configurations }), {
      code,
    });
    assert.ok(
      f.calls.every(
        (c) =>
          !c.path.includes('/objects') &&
          (!c.body || c.body.sql.startsWith('SELECT')),
      ),
    );
  }
});
test('private bucket is an infrastructure gate rather than an upload approval shortcut', async () => {
  const f = fixture((path) =>
    path.endsWith('/domains/managed') ? response({ enabled: true }) : undefined,
  );
  await assert.rejects(
    infrastructureReadiness({ ...f, configurations, approveMedia: false }),
    { code: 'BUCKET_PUBLIC' },
  );
});
test('audit compares published per-Worker configuration and reuses reads', async () => {
  const f = fixture((path, body) =>
    body?.sql.includes('media_capacity')
      ? response([{ success: true, results: [capacity] }])
      : undefined,
  );
  const read = [];
  f.github.file = async (path, sha) => {
    read.push({ path, sha });
    return readFileSync(path, 'utf8');
  };
  const report = await auditInfrastructure({ ...f });
  assert.equal(report.published.length, 3);
  assert.equal(read.length, 3);
  assert.equal(f.calls.filter((c) => c.path.endsWith('/settings')).length, 3);
  assert.ok(
    f.calls.every((c) => c.method === 'GET' || c.body.sql.startsWith('SELECT')),
  );
  assert.ok(f.calls.every((c) => !c.path.includes('/objects')));
});
test('audit rejects configuration that differs from its actually published manifest', async () => {
  const f = fixture();
  f.github.provenanceByVersion = async (name) => ({
    ...(await fixture().github.provenanceByVersion(name)),
    workerManifest: {
      ...manifest.workers[name],
      configurationHash: '0'.repeat(64),
    },
  });
  f.github.file = async (path) => readFileSync(path, 'utf8');
  await assert.rejects(auditInfrastructure({ ...f }), {
    code: 'MANIFEST_INVALID',
  });
});
test('audit uses published Text contracts rather than unpublished controller changes', async () => {
  const f = fixture((path, body) => {
    if (path.includes('beauty-billing-worker/settings')) {
      const state = settings('billing');
      state.bindings = state.bindings.map((binding) =>
        binding.name === 'OUTBOX_BATCH_SIZE'
          ? { ...binding, text: '4' }
          : binding,
      );
      return response(state);
    }
    if (body?.sql.includes('media_capacity'))
      return response([{ success: true, results: [capacity] }]);
  });
  f.github.provenanceByVersion = async (name) => {
    const contract = structuredClone(manifest.workers[name]);
    if (name === 'billing') contract.productionText.OUTBOX_BATCH_SIZE = '4';
    return {
      ...(await fixture().github.provenanceByVersion(name)),
      workerManifest: contract,
    };
  };
  f.github.file = async (path) => readFileSync(path, 'utf8');
  assert.equal((await auditInfrastructure({ ...f })).published.length, 3);
});
test('migration inspection handles first adoption without requiring application tables', async () => {
  const calls = [];
  const client = {
    request: async (path, options) => {
      calls.push(options.body.sql);
      return [{ success: true, results: [] }];
    },
  };
  assert.deepEqual(await migrationHistory(client, 'fixture'), []);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('sqlite_master'));
});
test('migration inspection does not mistake denied or malformed history for an empty database', async () => {
  await assert.rejects(
    migrationHistory({ request: async () => [{ success: false }] }, 'fixture'),
    { code: 'REMOTE_RESPONSE_INVALID' },
  );
  await assert.rejects(
    migrationHistory(
      {
        request: async () => {
          throw new Error('denied');
        },
      },
      'fixture',
    ),
    /denied/,
  );
});
