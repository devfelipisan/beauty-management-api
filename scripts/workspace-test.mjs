import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { relative, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = relative(root, process.cwd()).replaceAll('\\', '/');
const result = spawnSync(
  process.execPath,
  [
    resolve(root, 'node_modules/vitest/vitest.mjs'),
    'run',
    '--config',
    resolve(root, 'vitest.config.ts'),
    '--passWithNoTests',
    workspace,
  ],
  { cwd: root, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
