import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cronRequest } from './cron-request.mjs';
import { wranglerDeployArgs } from './wrangler-command.mjs';
const sha = 'a'.repeat(40);

test('versioned cron request defaults disabled and daily without inventing runtime secrets', () => {
  assert.deepEqual(cronRequest({}), {
    CRONJOB_ENABLED: 'false',
    CRONJOB: '0 3 * * *',
  });
  assert.deepEqual(cronRequest({ CRONJOB_ENABLED: 'true' }), {
    CRONJOB_ENABLED: 'true',
    CRONJOB: '0 3 * * *',
  });
});
test('unknown fields, nonstrings and invalid stored schedules fail before publication', () => {
  for (const value of [
    null,
    [],
    { token: 'private' },
    { CRONJOB_ENABLED: true },
    { CRONJOB_ENABLED: 'yes' },
    { CRONJOB_ENABLED: 'false', CRONJOB: 'invalid' },
  ])
    assert.throws(() => cronRequest(value), {
      code: 'INVALID_VERSIONED_CONFIGURATION',
    });
});
test('only Operations receives versioned cron variables and dry-run uses identical arguments', () => {
  const cronVariables = { CRONJOB_ENABLED: 'true', CRONJOB: '*/30 * * * *' };
  for (const worker of ['operations', 'billing', 'clinical']) {
    const args = wranglerDeployArgs(worker, sha, { cronVariables });
    assert.deepEqual(
      wranglerDeployArgs(worker, sha, { cronVariables, dryRun: true }),
      [...args, '--dry-run'],
    );
    assert.equal(args.includes('--var'), worker === 'operations');
    assert.ok(!args.includes('--triggers'));
    if (worker === 'operations') {
      assert.ok(args.includes('CRONJOB_ENABLED:true'));
      assert.ok(args.includes('CRONJOB:*/30 * * * *'));
    }
  }
});
