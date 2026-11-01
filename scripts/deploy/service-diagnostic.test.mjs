import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  serviceMismatchReason,
  normalizeBinding,
  matchesBinding,
} from './binding-contract.mjs';
import { validateSettings } from './worker-state.mjs';
import { DeploymentValidationError, diagnostic } from './errors.mjs';
import { release } from './release.mjs';
import {
  fixture,
  configurations,
  manifest,
  settings,
  response,
  sha,
} from './fixtures.mjs';
const expected = normalizeBinding({
  name: 'OPERATIONS_SERVICE',
  type: 'service',
  service: 'beauty-operations-worker',
  props: { caller: 'beauty-billing-worker' },
});
const cases = [
  [{ type: 'r2_bucket', bucket_name: 'private-bucket' }, 'TYPE_MISMATCH'],
  [{ service: 'private-destination' }, 'DESTINATION_MISMATCH'],
  [{ entrypoint: 'private-entrypoint' }, 'SELECTOR_MISMATCH'],
  [{ environment: 'private-environment' }, 'SELECTOR_MISMATCH'],
  [{ props: { caller: 'private-caller' } }, 'PROPS_MISMATCH'],
];
function state(patch) {
  const value = settings('billing');
  value.bindings = value.bindings.map((binding) =>
    binding.name === expected.name ? { ...binding, ...patch } : binding,
  );
  return value;
}
test('classifies each normalized service mismatch without changing boolean matching', () => {
  for (const [patch, reason] of cases) {
    const actual = normalizeBinding({ ...expected, ...patch });
    assert.equal(serviceMismatchReason(actual, expected), reason);
    assert.equal(matchesBinding(actual, expected), false);
  }
  for (const patch of [
    { props: undefined },
    { entrypoint: null, environment: null },
    { props: { caller: 'beauty-billing-worker' } },
  ]) {
    const actual = normalizeBinding({ ...expected, ...patch });
    assert.equal(serviceMismatchReason(actual, expected), null);
    assert.equal(matchesBinding(actual, expected), true);
  }
  assert.equal(serviceMismatchReason(undefined, expected), undefined);
  assert.equal(serviceMismatchReason(expected, undefined), undefined);
  assert.equal(
    serviceMismatchReason({ ...expected, name: 'OTHER' }, expected),
    undefined,
  );
  assert.equal(serviceMismatchReason(expected, { type: 'd1' }), undefined);
});
test('uses type, destination, selectors and props priority when multiple fields diverge', () => {
  const bad = {
    ...expected,
    type: 'r2_bucket',
    service: 'wrong',
    entrypoint: 'wrong',
    environment: 'wrong',
    props: { caller: 'wrong' },
  };
  assert.equal(serviceMismatchReason(bad, expected), 'TYPE_MISMATCH');
  bad.type = 'service';
  assert.equal(serviceMismatchReason(bad, expected), 'DESTINATION_MISMATCH');
  bad.service = expected.service;
  assert.equal(serviceMismatchReason(bad, expected), 'SELECTOR_MISMATCH');
  bad.entrypoint = null;
  bad.environment = null;
  assert.equal(serviceMismatchReason(bad, expected), 'PROPS_MISMATCH');
});
test('emits only the computed service reason and never remote reason or manifest justification', () => {
  for (const [patch, reason] of cases)
    assert.throws(
      () =>
        validateSettings(
          state({ ...patch, reason: 'PRIVATE_REMOTE_REASON' }),
          'billing',
          configurations.billing,
        ),
      (error) => {
        assert.equal(diagnostic(error).reason, reason);
        assert.equal(error.binding, expected.name);
        assert.ok(!JSON.stringify(diagnostic(error)).includes('private-'));
        return true;
      },
    );
  const previous = {
    name: expected.name,
    type: 'service',
    service: 'approved-old',
  };
  const transitions = [
    { name: expected.name, previous, reason: 'PRIVATE_JUSTIFICATION' },
  ];
  validateSettings(
    state({ service: 'approved-old' }),
    'billing',
    configurations.billing,
    { transitions },
  );
  assert.throws(
    () =>
      validateSettings(
        state({ service: 'approved-old' }),
        'billing',
        configurations.billing,
        { transitions, phase: 'postcheck' },
      ),
    (error) => {
      assert.equal(error.reason, 'DESTINATION_MISMATCH');
      assert.ok(
        !JSON.stringify(diagnostic(error)).includes('PRIVATE_JUSTIFICATION'),
      );
      return true;
    },
  );
  assert.throws(
    () =>
      validateSettings(
        state({ service: 'unapproved-old' }),
        'billing',
        configurations.billing,
        { transitions },
      ),
    { reason: 'DESTINATION_MISMATCH' },
  );
});
test('retains missing and malformed errors without misleading service reasons', () => {
  const missing = settings('billing');
  missing.bindings = missing.bindings.filter(
    (binding) => binding.name !== expected.name,
  );
  assert.throws(
    () => validateSettings(missing, 'billing', configurations.billing),
    (error) => {
      assert.equal(error.code, 'BINDING_MISSING');
      assert.equal(error.reason, undefined);
      return true;
    },
  );
  for (const patch of [{ service: null }, { props: [] }, { entrypoint: '' }])
    assert.throws(
      () => validateSettings(state(patch), 'billing', configurations.billing),
      (error) => {
        assert.equal(error.code, 'REMOTE_RESPONSE_INVALID');
        assert.equal(error.reason, undefined);
        return true;
      },
    );
});
test('sanitizer excludes arbitrary reasons, unknown bindings and unrelated operations or codes', () => {
  const scope = {
    operation: 'worker.settings',
    worker: 'billing',
    binding: expected.name,
    allowedBindings: new Set([expected.name]),
    reason: 'SELECTOR_MISMATCH',
  };
  assert.equal(
    diagnostic(new DeploymentValidationError('BINDING_MISMATCH', scope)).reason,
    'SELECTOR_MISMATCH',
  );
  for (const patch of [
    { reason: 'PRIVATE_REASON' },
    { binding: 'UNKNOWN_PRIVATE_BINDING' },
    { operation: 'github.request' },
    { allowedBindings: new Set() },
  ]) {
    const value = diagnostic(
      new DeploymentValidationError('BINDING_MISMATCH', { ...scope, ...patch }),
    );
    assert.equal(value.reason, undefined);
    assert.ok(!JSON.stringify(value).includes('PRIVATE'));
  }
  assert.equal(
    diagnostic(new DeploymentValidationError('REMOTE_RESPONSE_INVALID', scope))
      .reason,
    undefined,
  );
  const modified = new DeploymentValidationError('BINDING_MISMATCH', scope);
  modified.reason = 'PRIVATE_REASON';
  assert.equal(diagnostic(modified).reason, undefined);
});
test('Billing failure preserves identical sanitized CLI, artifact and summary diagnostics with one read', async () => {
  const f = fixture((path) =>
    path.includes('beauty-billing-worker/settings')
      ? response(state({ environment: 'private-environment' }))
      : undefined,
  );
  const snapshots = [];
  const report = await release({
    ...f,
    context: {
      mode: 'deploy',
      worker: 'all',
      commitSha: sha,
      requestId: 'service-diagnostic',
    },
    configurations,
    manifest,
    publish: () => assert.fail('No Worker may be published'),
    persist: (value) => snapshots.push(structuredClone(value)),
  });
  const expectedDiagnostic = {
    code: 'BINDING_MISMATCH',
    phase: 'preflight',
    operation: 'worker.settings',
    worker: 'billing',
    requestId: 'service-diagnostic',
    commitSha: sha,
    binding: 'OPERATIONS_SERVICE',
    reason: 'SELECTOR_MISMATCH',
  };
  assert.deepEqual(report.failure, expectedDiagnostic);
  assert.deepEqual(snapshots.at(-1).failure, expectedDiagnostic);
  assert.equal(
    JSON.stringify(report.failure),
    JSON.stringify(expectedDiagnostic),
  );
  assert.equal(report.cloudflare.calls, 1);
  assert.equal(report.workers.length, 0);
  assert.ok(!JSON.stringify(snapshots).includes('private-environment'));
});
