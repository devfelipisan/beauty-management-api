import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestedReleaseSha } from './prepare.mjs';
const sha = 'a'.repeat(40);
const env = { GITHUB_SHA: sha };

test('manual dispatch selects the immutable GitHub event SHA without manual input', () => {
  assert.equal(requestedReleaseSha([], env), sha);
  assert.equal(requestedReleaseSha(['--sha', ''], env), sha);
});
test('explicit CI or recovery SHA is preserved and never silently falls back', () => {
  const candidate = 'b'.repeat(40);
  assert.equal(requestedReleaseSha(['--sha', candidate], env), candidate);
  assert.equal(requestedReleaseSha(['--sha', 'invalid'], env), 'invalid');
  assert.equal(requestedReleaseSha([], {}), undefined);
});
test('unsupported CLI arguments cannot select an unreviewed target', () => {
  for (const args of [['--latest'], ['--sha'], ['--sha', sha, 'extra']])
    assert.throws(() => requestedReleaseSha(args, env), {
      code: 'INVALID_REQUEST',
    });
});
