import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wranglerDeployArgs } from './wrangler-command.mjs';
import { releaseOrder, workerConfigurations } from './config-contract.mjs';
const sha = 'a'.repeat(40);
test('each dry-run uses exactly the real publication arguments plus dry-run', () => {
  for (const worker of releaseOrder) {
    const actual = wranglerDeployArgs(worker, sha);
    const dry = wranglerDeployArgs(worker, sha, { dryRun: true });
    assert.deepEqual(dry, [...actual, '--dry-run']);
    assert.equal(
      actual[actual.indexOf('--config') + 1],
      workerConfigurations[worker],
    );
    assert.ok(actual.includes('--experimental-provision=false'));
    assert.ok(actual.includes('--experimental-auto-create=false'));
    assert.equal(actual[actual.indexOf('--env') + 1], '');
    assert.equal(actual[actual.indexOf('--tag') + 1], `git-${sha}`);
  }
});
test('unknown targets and mutable refs cannot form a publication command', () => {
  assert.throws(() => wranglerDeployArgs('unknown', sha), {
    code: 'INVALID_REQUEST',
  });
  assert.throws(() => wranglerDeployArgs('billing', 'main'), {
    code: 'INVALID_REQUEST',
  });
});
