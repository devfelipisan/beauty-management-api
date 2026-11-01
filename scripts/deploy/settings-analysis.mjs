import {
  requiredProductionText,
  requiredJwtSecretNames,
} from './config-contract.mjs';
import { DeploymentValidationError, diagnostic } from './errors.mjs';
import {
  BindingShapeError,
  normalizeBinding,
  expectedBindings,
  matchesBinding,
  serviceMismatchReason,
  serviceSelectorMismatch,
} from './binding-contract.mjs';

const basic = (b) =>
  b &&
  typeof b === 'object' &&
  !Array.isArray(b) &&
  typeof b.name === 'string' &&
  b.name.length > 0 &&
  typeof b.type === 'string' &&
  b.type.length > 0;
function scopeFor(name, context = {}, phase = context.phase ?? 'preflight') {
  return { ...context, phase, worker: name, operation: 'worker.settings' };
}
function knownNames(name, config, expected, transitions, expectedText) {
  return new Set([
    ...expected.map((b) => b.name),
    ...Object.keys(expectedText ?? requiredProductionText(name)),
    ...Object.keys(config.vars ?? {}),
    ...(config.secrets?.required ?? requiredJwtSecretNames),
    ...transitions.map((t) => t.name),
  ]);
}
function* runtimeChecks(settings, name, context = {}) {
  const scope = scopeFor(name, context);
  const error = (code, binding) =>
    new DeploymentValidationError(code, { ...scope, binding });
  if (
    !Array.isArray(settings?.bindings) ||
    settings.bindings.some((b) => !basic(b)) ||
    new Set(settings.bindings.map((b) => b.name)).size !==
      settings.bindings.length
  ) {
    yield error('REMOTE_RESPONSE_INVALID');
    return;
  }
  scope.allowedBindings = new Set([
    ...Object.keys(context.expectedText ?? requiredProductionText(name)),
    ...requiredJwtSecretNames,
  ]);
  for (const [key, value] of Object.entries(
    context.expectedText ?? requiredProductionText(name),
  )) {
    const binding = settings.bindings.find((b) => b.name === key);
    if (!binding) {
      yield error('BINDING_MISSING', key);
      continue;
    }
    if (binding.type !== 'plain_text') {
      yield error('BINDING_TYPE_INVALID', key);
      continue;
    }
    if (binding.text !== value) yield error('BINDING_VALUE_INVALID', key);
  }
  for (const key of requiredJwtSecretNames) {
    const binding = settings.bindings.find((b) => b.name === key);
    if (binding && binding.type !== 'secret_text')
      yield error('BINDING_TYPE_INVALID', key);
  }
}
function* settingsChecks(
  settings,
  name,
  config,
  { phase = 'preflight', context = {}, transitions = [], expectedText } = {},
) {
  const expected = expectedBindings(config),
    scope = scopeFor(name, context, phase);
  scope.allowedBindings = knownNames(
    name,
    config,
    expected,
    transitions,
    expectedText,
  );
  const error = (code, binding, reason, selector) =>
    new DeploymentValidationError(code, {
      ...scope,
      binding,
      reason,
      selector,
    });
  if (!Array.isArray(settings?.bindings)) {
    yield error('REMOTE_RESPONSE_INVALID');
    return;
  }
  const seen = new Set(),
    valid = [],
    invalid = new Set();
  for (const binding of settings.bindings) {
    if (!basic(binding)) {
      yield error('REMOTE_RESPONSE_INVALID');
      continue;
    }
    if (seen.has(binding.name)) {
      yield error('REMOTE_RESPONSE_INVALID', binding.name);
      invalid.add(binding.name);
      continue;
    }
    seen.add(binding.name);
    valid.push(binding);
  }
  yield* runtimeChecks({ bindings: valid }, name, { ...scope, expectedText });
  const actual = [];
  for (const binding of valid) {
    if (!scope.allowedBindings.has(binding.name)) {
      yield error('BINDING_MISMATCH');
      continue;
    }
    try {
      actual.push(normalizeBinding(binding));
    } catch (cause) {
      if (!(cause instanceof BindingShapeError)) throw cause;
      yield error(cause.code, binding.name);
      invalid.add(binding.name);
    }
  }
  const previous = [];
  if (phase === 'preflight')
    for (const transition of transitions) {
      try {
        previous.push({
          ...transition,
          previous:
            transition.previous === null
              ? null
              : normalizeBinding(transition.previous),
        });
      } catch (cause) {
        if (!(cause instanceof BindingShapeError)) throw cause;
        yield error(cause.code, transition.previous?.name);
      }
    }
  for (const wanted of expected) {
    if (invalid.has(wanted.name)) continue;
    const binding = actual.find((b) => b.name === wanted.name),
      transition = previous.find((t) => t.name === wanted.name);
    if (
      !matchesBinding(binding, wanted) &&
      !(
        transition &&
        (transition.previous === null
          ? !binding
          : matchesBinding(binding, transition.previous))
      )
    ) {
      const reason = serviceMismatchReason(binding, wanted);
      yield error(
        binding ? 'BINDING_MISMATCH' : 'BINDING_MISSING',
        wanted.name,
        reason,
        reason === 'SELECTOR_MISMATCH'
          ? serviceSelectorMismatch(binding, wanted)
          : undefined,
      );
    }
  }
  for (const binding of actual) {
    if (
      invalid.has(binding.name) ||
      ['plain_text', 'secret_text'].includes(binding.type) ||
      expected.some((wanted) => matchesBinding(binding, wanted)) ||
      previous.some(
        (t) =>
          t.previous &&
          t.name === binding.name &&
          matchesBinding(binding, t.previous),
      )
    )
      continue;
    // The desired-resource pass already reports mismatches for these names.
    if (expected.some((wanted) => wanted.name === binding.name)) continue;
    yield error('BINDING_MISMATCH', binding.name);
  }
}
export function validateRuntimeText(settings, name, context = {}) {
  const first = runtimeChecks(settings, name, context).next();
  if (!first.done) throw first.value;
}
export function validateSettings(settings, name, config, options = {}) {
  const first = settingsChecks(settings, name, config, options).next();
  if (!first.done) throw first.value;
  return settings;
}
export function analyzeSettings(settings, name, config, options = {}) {
  const findings = [...settingsChecks(settings, name, config, options)].map(
    (error) => diagnostic(error),
  );
  const names = knownNames(
    name,
    config,
    expectedBindings(config),
    options.transitions ?? [],
    options.expectedText,
  );
  const bindings = Array.isArray(settings?.bindings)
    ? settings.bindings.filter(
        (binding) =>
          binding &&
          typeof binding === 'object' &&
          typeof binding.name === 'string',
      )
    : [];
  return {
    bindings: [...names].map((binding) => {
      const count = bindings.filter((b) => b.name === binding).length;
      return {
        binding,
        metadataPresence:
          count === 0 ? 'absent' : count === 1 ? 'present' : 'ambiguous',
        findings: findings.filter((f) => f.binding === binding),
      };
    }),
    unknownBindingCount: bindings.filter((b) => !names.has(b.name)).length,
    findings,
  };
}
