import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBinding,
  serviceSelectorMismatch,
  serviceMismatchReason,
  matchesBinding,
} from './binding-contract.mjs';
import { validateSettings } from './worker-state.mjs';
import { DeploymentValidationError, diagnostic } from './errors.mjs';
import { settings, configurations } from './fixtures.mjs';
const expected = normalizeBinding({
  type: 'service',
  name: 'OPERATIONS_SERVICE',
  service: 'beauty-operations-worker',
  props: { caller: 'beauty-billing-worker' },
});
function state(patch) {
  const value = settings('billing');
  value.bindings = value.bindings.map((binding) =>
    binding.name === expected.name ? { ...binding, ...patch } : binding,
  );
  return value;
}
test('identifies entrypoint, environment, both and normalized absence without changing comparisons', () => {
  for (const [patch, selector] of [
    [{ entrypoint: 'private-api' }, 'ENTRYPOINT'],
    [{ environment: 'private-env' }, 'ENVIRONMENT'],
    [{ entrypoint: 'private-api', environment: 'private-env' }, 'BOTH'],
    [{}, null],
    [{ entrypoint: null, environment: null }, null],
    [{ environment: 'production' }, null],
  ]) {
    const actual = normalizeBinding({ ...expected, ...patch });
    assert.equal(serviceSelectorMismatch(actual, expected), selector);
    assert.equal(matchesBinding(actual, expected), selector === null);
    if (selector)
      assert.throws(
        () =>
          validateSettings(
            state({ ...patch, selector: 'PRIVATE_REMOTE_VALUE' }),
            'billing',
            configurations.billing,
          ),
        (error) => {
          assert.equal(error.selector, selector);
          assert.equal(error.reason, 'SELECTOR_MISMATCH');
          assert.ok(!JSON.stringify(diagnostic(error)).includes('private-'));
          return true;
        },
      );
  }
  for (const value of ['staging', 'default'])
    assert.equal(
      serviceSelectorMismatch(
        normalizeBinding({ ...expected, environment: value }),
        expected,
      ),
      'ENVIRONMENT',
    );
});
test('does not classify missing, unrelated or invalid binding references', () => {
  for (const actual of [
    undefined,
    null,
    { ...expected, type: 'd1' },
    { ...expected, name: 'OTHER' },
  ])
    assert.equal(serviceSelectorMismatch(actual, expected), undefined);
  assert.equal(serviceSelectorMismatch(expected, undefined), undefined);
  assert.equal(serviceSelectorMismatch(expected, { type: 'd1' }), undefined);
});
test('preserves mismatch priority and exposes selector only for the final selector reason', () => {
  for (const [patch, reason, selector] of [
    [
      {
        type: 'r2_bucket',
        bucket_name: 'private-bucket',
        environment: 'private-env',
      },
      'TYPE_MISMATCH',
      undefined,
    ],
    [
      { service: 'private-destination', environment: 'private-env' },
      'DESTINATION_MISMATCH',
      undefined,
    ],
    [
      { environment: 'private-env', props: { caller: 'private-caller' } },
      'SELECTOR_MISMATCH',
      'ENVIRONMENT',
    ],
    [{ props: { caller: 'private-caller' } }, 'PROPS_MISMATCH', undefined],
  ]) {
    const actual = normalizeBinding({ ...expected, ...patch });
    assert.equal(serviceMismatchReason(actual, expected), reason);
    assert.throws(
      () => validateSettings(state(patch), 'billing', configurations.billing),
      (error) => {
        assert.equal(error.reason, reason);
        assert.equal(error.selector, selector);
        return true;
      },
    );
  }
});
test('sanitizes selector in both construction and serialization', () => {
  const scope = {
    worker: 'billing',
    operation: 'worker.settings',
    binding: expected.name,
    allowedBindings: new Set([expected.name]),
    reason: 'SELECTOR_MISMATCH',
    selector: 'ENVIRONMENT',
  };
  assert.equal(
    diagnostic(new DeploymentValidationError('BINDING_MISMATCH', scope))
      .selector,
    'ENVIRONMENT',
  );
  for (const patch of [
    { selector: 'PRIVATE_VALUE' },
    { reason: 'PROPS_MISMATCH' },
    { binding: 'UNKNOWN_PRIVATE' },
    { allowedBindings: new Set() },
    { operation: 'github.request' },
  ])
    assert.equal(
      diagnostic(
        new DeploymentValidationError('BINDING_MISMATCH', {
          ...scope,
          ...patch,
        }),
      ).selector,
      undefined,
    );
  assert.equal(
    diagnostic(new DeploymentValidationError('REMOTE_RESPONSE_INVALID', scope))
      .selector,
    undefined,
  );
  const modified = new DeploymentValidationError('BINDING_MISMATCH', scope);
  modified.selector = 'PRIVATE_VALUE';
  assert.equal(diagnostic(modified).selector, undefined);
  modified.selector = 'ENVIRONMENT';
  modified.reason = 'PROPS_MISMATCH';
  assert.equal(diagnostic(modified).selector, undefined);
  modified.reason = 'SELECTOR_MISMATCH';
  modified.binding = undefined;
  assert.equal(diagnostic(modified).selector, undefined);
});
test('preserves absent, malformed and unknown errors without selector information', () => {
  const absent = settings('billing');
  absent.bindings = absent.bindings.filter(
    (binding) => binding.name !== expected.name,
  );
  for (const [value, code] of [
    [absent, 'BINDING_MISSING'],
    [state({ entrypoint: [] }), 'REMOTE_RESPONSE_INVALID'],
    [
      {
        bindings: [
          ...settings('billing').bindings,
          {
            name: 'UNKNOWN_PRIVATE',
            type: 'service',
            service: 'private',
            environment: 'private',
            selector: 'ENVIRONMENT',
          },
        ],
      },
      'BINDING_MISMATCH',
    ],
  ])
    assert.throws(
      () => validateSettings(value, 'billing', configurations.billing),
      (error) => {
        const safe = diagnostic(error);
        assert.equal(safe.code, code);
        assert.equal(safe.selector, undefined);
        if (code === 'BINDING_MISMATCH') {
          assert.equal(safe.reason, undefined);
          assert.equal(safe.binding, undefined);
        }
        return true;
      },
    );
});
test('approved old selectors pass only preflight and never supply diagnostic values', () => {
  const previous = {
    type: 'service',
    name: expected.name,
    service: expected.service,
    environment: 'private-old-env',
  };
  const transitions = [
    { name: expected.name, previous, reason: 'PRIVATE_JUSTIFICATION' },
  ];
  validateSettings(
    state({ environment: 'private-old-env' }),
    'billing',
    configurations.billing,
    { transitions },
  );
  for (const phase of ['postcheck', 'readiness', 'audit'])
    assert.throws(
      () =>
        validateSettings(
          state({ environment: 'private-old-env' }),
          'billing',
          configurations.billing,
          { transitions, phase },
        ),
      (error) => {
        assert.equal(error.selector, 'ENVIRONMENT');
        assert.ok(
          !JSON.stringify(diagnostic(error)).includes('private-old-env'),
        );
        return true;
      },
    );
});
