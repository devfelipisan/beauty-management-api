import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const configHome = await mkdtemp(join(tmpdir(), 'beauty-wrangler-'));
const executable = process.execPath;
const wrangler = join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const configs = [
  'apps/operations-worker/wrangler.jsonc',
  'apps/clinical-worker/wrangler.jsonc',
  'apps/billing-worker/wrangler.jsonc',
];

try {
  for (const config of configs) {
    const result = spawnSync(executable, [wrangler, 'deploy', '--dry-run', '-c', config], {
      stdio: 'inherit',
      env: { ...process.env, XDG_CONFIG_HOME: configHome },
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} finally {
  await rm(configHome, { recursive: true, force: true });
}
