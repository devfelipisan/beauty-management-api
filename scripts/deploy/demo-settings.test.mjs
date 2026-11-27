import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSettings,
  validateSettings,
  validateRuntimeText,
} from './worker-state.mjs';
import { diagnostic } from './errors.mjs';
import { release } from './release.mjs';
import {
  configurations,
  fixture,
  manifest,
  response,
  settings,
  sha,
  version,
} from './fixtures.mjs';

const binding = 'SELECTOR_DEMO_TENANT_IDS';
const withDemo = (worker, patch = {}) => {
  const value = settings(worker);
  value.bindings.push({
    name: binding,
    type: 'plain_text',
    text: '["tenant-demo-private"]',
    ...patch,
  });
  return value;
};

test('Operations accepts absent or valid optional demo Text in every settings phase and receiver runtime checks', () => {
  for (const value of [
    settings('operations'),
    withDemo('operations'),
    withDemo('operations', {
      text: JSON.stringify(Array.from({ length: 10 }, (_, i) => `demo_${i}-A`)),
    }),
    withDemo('operations', { text: JSON.stringify(['a'.repeat(128)]) }),
  ]) {
    for (const phase of [
      'preflight',
      'postcheck',
      'readiness',
      'audit',
      'inventory',
    ])
      assert.doesNotThrow(() =>
        validateSettings(value, 'operations', configurations.operations, {
          phase,
        }),
      );
    assert.doesNotThrow(() => validateRuntimeText(value, 'operations'));
    const report = analyzeSettings(
      value,
      'operations',
      configurations.operations,
    );
    assert.equal(report.unknownBindingCount, 0);
    assert.deepEqual(report.findings, []);
  }
});

test('invalid demo Text types and values are rejected without exposing the configured IDs', () => {
  const invalid = [
    { type: 'secret_text' },
    { type: 'json', json: ['tenant-demo-private'] },
    { type: 'service', service: 'private-worker' },
    { text: undefined },
    { text: 12 },
    { text: '' },
    { text: 'not-json' },
    ...[
      null,
      {},
      'tenant-demo-private',
      [],
      ['same', 'same'],
      [12],
      [''],
      ['a b'],
      ['a'.repeat(129)],
      Array.from({ length: 11 }, (_, i) => `demo-${i}`),
    ].map((value) => ({ text: JSON.stringify(value) })),
  ];
  for (const patch of invalid) {
    const code = patch.type ? 'BINDING_TYPE_INVALID' : 'BINDING_VALUE_INVALID';
    const value = withDemo('operations', patch);
    for (const phase of ['preflight', 'postcheck'])
      assert.throws(
        () =>
          validateSettings(value, 'operations', configurations.operations, {
            phase,
          }),
        (error) => {
          assert.deepEqual(diagnostic(error), {
            code,
            phase,
            operation: 'worker.settings',
            worker: 'operations',
            binding,
          });
          return true;
        },
      );
    assert.throws(() => validateRuntimeText(value, 'operations'), { code });
    const serialized = JSON.stringify(
      analyzeSettings(value, 'operations', configurations.operations),
    );
    assert.ok(!serialized.includes('tenant-demo-private'));
    assert.ok(!serialized.includes('private-worker'));
  }
});

test('demo Text is not permitted on other Workers and unrelated unknown names stay redacted', () => {
  for (const worker of ['billing', 'clinical', 'operations']) {
    const value = withDemo(
      worker,
      worker === 'operations' ? { name: 'PRIVATE_UNKNOWN_NAME' } : {},
    );
    assert.throws(
      () => validateSettings(value, worker, configurations[worker]),
      (error) => {
        assert.deepEqual(diagnostic(error), {
          code: 'BINDING_MISMATCH',
          phase: 'preflight',
          operation: 'worker.settings',
          worker,
        });
        return true;
      },
    );
    const report = analyzeSettings(value, worker, configurations[worker]);
    assert.equal(report.unknownBindingCount, 1);
    assert.ok(!JSON.stringify(report).includes('PRIVATE_UNKNOWN_NAME'));
    assert.ok(!JSON.stringify(report).includes('tenant-demo-private'));
  }
});

test('duplicate demo bindings remain invalid', () => {
  const value = withDemo('operations');
  value.bindings.push({ ...value.bindings.at(-1) });
  assert.throws(
    () => validateSettings(value, 'operations', configurations.operations),
    { code: 'REMOTE_RESPONSE_INVALID' },
  );
});

test('release with remote demo Text reaches provenance and completes the existing gates without extra calls', async () => {
  const f = fixture((path) =>
    path.endsWith('/beauty-operations-worker/settings')
      ? response(withDemo('operations'))
      : undefined,
  );
  const proven = [],
    published = [];
  const original = f.github.provenanceByVersion;
  f.github.provenanceByVersion = async (name, ...args) => {
    proven.push(name);
    return original(name, ...args);
  };
  const result = await release({
    ...f,
    configurations,
    manifest,
    context: {
      mode: 'deploy',
      worker: 'all',
      commitSha: sha,
      requestId: 'demo-settings-test',
      runId: '42',
    },
    publish: (name) => {
      published.push(name);
      return { status: 0, stdout: `Current Version ID: ${version}` };
    },
  });
  assert.equal(result.status, 'success');
  assert.ok(proven.includes('operations'));
  assert.deepEqual(published, ['billing', 'clinical', 'operations']);
  assert.equal(f.client.metrics.calls, 20);
  assert.ok(!JSON.stringify(result).includes('tenant-demo-private'));
});
