import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const base = process.argv[2],
  head = process.argv[3];
if (
  !/^[0-9a-f]{40}$/.test(base ?? '') ||
  !/^(?:[0-9a-f]{40}|HEAD)$/.test(head ?? '')
)
  throw new Error('Immutable format range required');
const paths = execFileSync(
  'git',
  ['diff', '--name-only', '--diff-filter=ACMR', base, head],
  { encoding: 'utf8' },
)
  .trim()
  .split(/\r?\n/)
  .filter(
    (path) =>
      existsSync(path) &&
      /\.(ts|js|mjs|json|jsonc|md|yml|yaml)$/.test(path) &&
      !path.endsWith('worker-configuration.d.ts'),
  );
if (paths.length) {
  const result = spawnSync(
    process.execPath,
    [resolve('node_modules/prettier/bin/prettier.cjs'), '--check', ...paths],
    { stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
}
