import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  renameSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  requiresWorkerDeployment,
  deploymentChanges,
} from './changed-files.mjs';

test('docs, tests and unrelated administrative tools do not publish Workers', () => {
  for (const paths of [
    [],
    ['docs/release.md'],
    ['README.md', 'scripts/infra/audit.mjs'],
    ['domains/billing/test/payment.ts'],
    ['apps/billing-worker/src/payment.spec.ts'],
    ['.github/workflows/migrations-d1.yml'],
  ])
    assert.equal(requiresWorkerDeployment(paths), false);
});
test('runtime, contracts, dependencies, build settings and release requests require publication', () => {
  for (const path of [
    'apps/billing-worker/src/worker.ts',
    'apps/clinical-worker/wrangler.jsonc',
    'apps/operations-worker/src/router.ts',
    'domains/billing/src/payment.ts',
    'packages/contracts/src/events.ts',
    'package.json',
    'package-lock.json',
    '.nvmrc',
    'tsconfig.build.json',
    'scripts/deploy/manifest.json',
    '.github/deploy/request.json',
    '.github/deploy/cron.json',
    'scripts/deploy/release.mjs',
    'scripts/deploy/cron-request.mjs',
    'scripts/infra/manage-cron.mjs',
    'scripts/workers-dry-run.mjs',
    '.github/workflows/ci.yml',
    '.github/workflows/deploy-workers.yml',
  ])
    assert.equal(requiresWorkerDeployment(['docs/note.md', path]), true, path);
});
test('actual Git rename/delete detection keeps removed runtime sources deployment-relevant', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'beauty-changes-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  mkdirSync(join(root, 'apps/billing-worker/src'), { recursive: true });
  writeFileSync(
    join(root, 'apps/billing-worker/src/worker.ts'),
    'export const value = 1;\n',
  );
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
  const base = git('rev-parse', 'HEAD');
  mkdirSync(join(root, 'docs'));
  renameSync(
    join(root, 'apps/billing-worker/src/worker.ts'),
    join(root, 'docs/removed-worker.md'),
  );
  git('add', '-A');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'move',
  );
  assert.equal(deploymentChanges(base, 'HEAD', root), true);
  const previous = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'docs/note.md'), 'Documentation only\n');
  git('add', '.');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'docs',
  );
  assert.equal(deploymentChanges(previous, 'HEAD', root), false);
  assert.throws(() => deploymentChanges('HEAD~1', 'HEAD', root));
});
