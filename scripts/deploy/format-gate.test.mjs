import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

test('local release format gate rejects malformed formatting in tracked and untracked files before builds', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'beauty-format-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n');
  writeFileSync(join(root, 'request.json'), '{\n  "mode": "deploy"\n}\n');
  git('add', '.');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'initial',
  );
  mkdirSync(join(root, 'node_modules'));
  symlinkSync(
    resolve('node_modules/prettier'),
    join(root, 'node_modules/prettier'),
    'dir',
  );
  const run = () =>
    spawnSync(
      process.execPath,
      [resolve('scripts/check-format-changes.mjs'), '--local'],
      { cwd: root, encoding: 'utf8' },
    );
  assert.equal(run().status, 0);
  writeFileSync(join(root, 'request.json'), '\n{"mode":"deploy"}\n');
  assert.equal(run().status, 1);
  writeFileSync(join(root, 'request.json'), '{\n  "mode": "deploy"\n}\n');
  writeFileSync(join(root, 'new.json'), '\n{"x":1}\n');
  assert.equal(run().status, 1);
  writeFileSync(join(root, 'new.json'), '{\n  "x": 1\n}\n');
  assert.equal(run().status, 0);
});
