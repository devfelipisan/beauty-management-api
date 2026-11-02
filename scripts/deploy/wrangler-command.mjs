import { resolve } from 'node:path';
import { workerConfigurations } from './config-contract.mjs';
import { cronPolicy } from './cron-policy.mjs';
import { fail } from './errors.mjs';

export function wranglerDeployArgs(
  worker,
  commitSha,
  { dryRun = false, cron = cronPolicy() } = {},
) {
  if (
    !Object.hasOwn(workerConfigurations, worker) ||
    !/^[0-9a-f]{40}$/.test(commitSha ?? '')
  )
    fail('INVALID_REQUEST', {
      phase: 'validation',
      operation: 'configuration',
    });
  return [
    resolve('node_modules/wrangler/bin/wrangler.js'),
    'deploy',
    '--experimental-provision=false',
    '--experimental-auto-create=false',
    '--env',
    '',
    '--config',
    workerConfigurations[worker],
    '--tag',
    `git-${commitSha}`,
    '--message',
    `beauty-release ${worker}`,
    ...(worker === 'operations' && cron.enabled
      ? ['--triggers', ...cron.crons]
      : []),
    ...(dryRun ? ['--dry-run'] : []),
  ];
}
