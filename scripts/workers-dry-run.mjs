import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { wranglerDeployArgs } from './deploy/wrangler-command.mjs';
import { releaseOrder } from './deploy/config-contract.mjs';

const configHome = await mkdtemp(join(tmpdir(), 'beauty-wrangler-'));
const executable = process.execPath;
const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();

try {
  for (const worker of releaseOrder) {
    const result = spawnSync(
      executable,
      wranglerDeployArgs(worker, commitSha, { dryRun: true }),
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          XDG_CONFIG_HOME: configHome,
          WRANGLER_SEND_METRICS: 'false',
        },
      },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} finally {
  const target = resolve(configHome);
  const parent = resolve(tmpdir());
  if (target === parent || relative(parent, target).startsWith('..'))
    throw new Error('Refusing cleanup outside the task temporary directory');
  await rm(target, { recursive: true, force: true });
}
