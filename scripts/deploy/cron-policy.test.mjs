import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cronPolicy, workerCronPolicy } from './cron-policy.mjs';
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
test('code deployment never supplies triggers even when a cron override is requested', () => {
  for (const worker of ['operations', 'billing', 'clinical']) {
    const args = wranglerDeployArgs(worker, sha, {
      cron: cronPolicy({ CRONJOB_ENABLED: 'true' }),
    });
    assert.ok(!args.includes('--triggers'));
    assert.deepEqual(wranglerDeployArgs(worker, sha, { dryRun: true }), [
      ...args,
      '--dry-run',
    ]);
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
test('Worker settings are the source of optional cron controls with safe type and value checks', () => {
  assert.deepEqual(workerCronPolicy({ bindings: [] }), {
    enabled: false,
    crons: [],
  });
  assert.deepEqual(
    workerCronPolicy({
      bindings: [{ name: 'CRONJOB_ENABLED', type: 'plain_text', text: 'true' }],
    }).crons,
    ['0 3 * * *'],
  );
  for (const binding of [
    { name: 'CRONJOB_ENABLED', type: 'secret_text' },
    { name: 'CRONJOB_ENABLED', type: 'plain_text', text: 'yes' },
    { name: 'CRONJOB_ENABLED', type: 'plain_text' },
  ])
    assert.throws(() => workerCronPolicy({ bindings: [binding] }));
  assert.throws(
    () =>
      workerCronPolicy({
        bindings: [
          { name: 'CRONJOB_ENABLED', type: 'plain_text', text: 'true' },
          {
            name: 'CRONJOB',
            type: 'plain_text',
            text: 'invalid-private-value',
          },
        ],
      }),
    { code: 'BINDING_VALUE_INVALID', binding: 'CRONJOB' },
  );
});
