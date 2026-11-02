import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const base = process.argv[2],
  head = process.argv[3];
const local = base === '--local';
if (
  !local &&
  (!/^[0-9a-f]{40}$/.test(base ?? '') ||
    !/^(?:[0-9a-f]{40}|HEAD)$/.test(head ?? ''))
)
  throw new Error('Immutable format range required');
const gitPaths = (args) =>
  execFileSync('git', args, { encoding: 'utf8' }).split('\0').filter(Boolean);
let paths;
if (local) {
  const previous = spawnSync('git', ['rev-parse', '--verify', 'HEAD^'], {
    encoding: 'utf8',
  });
  const baseline =
    previous.status === 0
      ? previous.stdout.trim()
      : '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  paths = [
    ...gitPaths([
      'diff',
      '--name-only',
      '-z',
      '--diff-filter=ACMR',
      baseline,
      'HEAD',
    ]),
    ...gitPaths(['diff', '--name-only', '-z', '--diff-filter=ACMR', 'HEAD']),
    ...gitPaths(['ls-files', '--others', '--exclude-standard', '-z']),
  ];
} else
  paths = gitPaths([
    'diff',
    '--name-only',
    '-z',
    '--diff-filter=ACMR',
    base,
    head,
  ]);
paths = [...new Set(paths)].filter(
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
