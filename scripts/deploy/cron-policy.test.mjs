import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cronPolicy, scheduledConfiguration } from './cron-policy.mjs';
import { wranglerDeployArgs } from './wrangler-command.mjs';
const sha = 'a'.repeat(40);

test('cron is disabled when activation is absent, blank or false even if a schedule exists', () => {
  for (const CRONJOB_ENABLED of [undefined, '', ' ', 'false', 'FALSE']) {
    const policy = cronPolicy({ CRONJOB_ENABLED, CRONJOB: '*/1 * * * *' });
    assert.deepEqual(policy, { enabled: false, crons: [] });
    assert.ok(
      !wranglerDeployArgs('operations', sha, { cron: policy }).includes(
        '--triggers',
      ),
    );
  }
});
test('enabled cron defaults to midnight Sao Paulo expressed in UTC', () => {
  for (const CRONJOB of [undefined, '', ' '])
    assert.deepEqual(cronPolicy({ CRONJOB_ENABLED: 'true', CRONJOB }), {
      enabled: true,
      crons: ['0 3 * * *'],
    });
});
test('schedule override only affects Operations and dry-run uses the exact deployment schedule', () => {
  for (const expression of [
    '*/30 * * * *',
    '0 * * * *',
    '0 3 * * *',
    '0,30 1-5/2 * 1-12 1-7',
  ]) {
    const policy = cronPolicy({ CRONJOB_ENABLED: 'true', CRONJOB: expression });
    for (const worker of ['operations', 'billing', 'clinical']) {
      const args = wranglerDeployArgs(worker, sha, { cron: policy });
      assert.deepEqual(
        wranglerDeployArgs(worker, sha, { cron: policy, dryRun: true }),
        [...args, '--dry-run'],
      );
      assert.equal(args.includes('--triggers'), worker === 'operations');
      if (worker === 'operations')
        assert.equal(args[args.indexOf('--triggers') + 1], expression);
    }
  }
});
test('invalid activation and schedules fail closed before producing publish arguments', () => {
  for (const CRONJOB_ENABLED of ['1', 'yes', 'enabled'])
    assert.throws(() => cronPolicy({ CRONJOB_ENABLED }), {
      code: 'INVALID_VERSIONED_CONFIGURATION',
    });
  for (const CRONJOB of [
    '* * * *',
    '60 * * * *',
    '* 24 * * *',
    '* * 0 * *',
    '* * * 13 *',
    '* * * * 8',
    '*/0 * * * *',
    '5-1 * * * *',
    '0 3 * * * --force',
    '0 3 * * *; command',
    '0,,1 * * * *',
  ])
    assert.throws(() => cronPolicy({ CRONJOB_ENABLED: 'true', CRONJOB }), {
      code: 'INVALID_VERSIONED_CONFIGURATION',
    });
});
test('postcheck configuration uses the effective schedule without mutating versioned config', () => {
  const config = { triggers: { crons: [] } };
  const policy = cronPolicy({ CRONJOB_ENABLED: 'true' });
  assert.deepEqual(
    scheduledConfiguration('operations', config, policy).triggers.crons,
    ['0 3 * * *'],
  );
  assert.deepEqual(config.triggers.crons, []);
  assert.equal(scheduledConfiguration('billing', config, policy), config);
});
