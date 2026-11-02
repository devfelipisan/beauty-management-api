import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synchronizeCron, scheduleWriter } from './manage-cron.mjs';

function fixture(bindings = [], current = ['*/1 * * * *']) {
  let schedules = current.map((cron) => ({ cron }));
  const reads = [],
    writes = [];
  return {
    reads,
    writes,
    client: {
      request: async (path) => {
        reads.push(path);
        return path.endsWith('/settings') ? { bindings } : { schedules };
      },
    },
    replaceSchedules: async (crons) => {
      writes.push(crons);
      schedules = crons.map((cron) => ({ cron }));
    },
  };
}
const enabled = [{ name: 'CRONJOB_ENABLED', type: 'plain_text', text: 'true' }];

test('inspection reads only Operations settings and schedules and never writes', async () => {
  const f = fixture(enabled);
  const report = await synchronizeCron(f);
  assert.equal(report.status, 'pending');
  assert.deepEqual(report.expected, ['0 3 * * *']);
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.reads, [
    '/workers/scripts/beauty-operations-worker/settings',
    '/workers/scripts/beauty-operations-worker/schedules',
  ]);
});
test('sync removes triggers when controls are absent or disabled and is idempotent', async () => {
  for (const bindings of [[], [{ ...enabled[0], text: 'false' }]]) {
    const f = fixture(bindings);
    const report = await synchronizeCron({ ...f, apply: true });
    assert.equal(report.status, 'updated');
    assert.deepEqual(f.writes, [[]]);
    assert.equal(
      (await synchronizeCron({ ...f, apply: true })).status,
      'in_sync',
    );
    assert.equal(f.writes.length, 1);
  }
});
test('sync applies daily default or custom Worker expression and verifies the remote result', async () => {
  for (const cron of ['0 3 * * *', '*/30 * * * *']) {
    const f = fixture([
      ...enabled,
      { name: 'CRONJOB', type: 'plain_text', text: cron },
    ]);
    assert.equal(
      (await synchronizeCron({ ...f, apply: true })).status,
      'updated',
    );
    assert.deepEqual(f.writes, [[cron]]);
  }
});
test('invalid bindings, concurrent settings changes and failed updates never report success', async () => {
  const invalid = fixture([{ ...enabled[0], text: 'invalid' }]);
  await assert.rejects(synchronizeCron({ ...invalid, apply: true }), {
    code: 'BINDING_VALUE_INVALID',
  });
  assert.equal(invalid.writes.length, 0);
  const changed = fixture(enabled);
  let reads = 0;
  const read = changed.client.request;
  changed.client.request = async (path) =>
    path.endsWith('/settings') && ++reads > 1 ? { bindings: [] } : read(path);
  await assert.rejects(synchronizeCron({ ...changed, apply: true }), {
    code: 'INVALID_REQUEST',
  });
  assert.equal(changed.writes.length, 0);
  const stale = fixture(enabled);
  await assert.rejects(
    synchronizeCron({
      ...stale,
      apply: true,
      replaceSchedules: async () => {},
    }),
    { code: 'SCHEDULE_MISMATCH' },
  );
});
test('schedule writer only calls the schedules PUT endpoint and never creates a code deployment', async () => {
  const calls = [];
  const write = scheduleWriter({
    accountId: 'fixture',
    apiToken: 'private',
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options });
      return { ok: true, json: async () => ({ success: true }) };
    },
  });
  await write(['0 3 * * *']);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://api.cloudflare.com/client/v4/accounts/fixture/workers/scripts/beauty-operations-worker/schedules',
  );
  assert.equal(calls[0].method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].body), [{ cron: '0 3 * * *' }]);
  const forbidden = scheduleWriter({
    accountId: 'fixture',
    apiToken: 'private',
    fetchImpl: async () => ({ ok: false, status: 403 }),
  });
  await assert.rejects(forbidden([]), { code: 'REMOTE_ACCESS_DENIED' });
});
