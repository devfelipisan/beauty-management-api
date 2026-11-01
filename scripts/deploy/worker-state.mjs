import {
  requiredProductionText,
  requiredJwtSecretNames,
} from './config-contract.mjs';
import { fail } from './errors.mjs';
import {
  BindingShapeError,
  normalizeBinding,
  expectedBindings,
  matchesBinding,
  serviceMismatchReason,
  serviceSelectorMismatch,
} from './binding-contract.mjs';
export const workerPath = (name) => `/workers/scripts/beauty-${name}-worker`;
export function validateRuntimeText(settings, name, context = {}) {
  const scope = {
    ...context,
    phase: context.phase ?? 'preflight',
    worker: name,
    operation: 'worker.settings',
  };
  if (!Array.isArray(settings?.bindings))
    fail('REMOTE_RESPONSE_INVALID', scope);
  if (
    settings.bindings.some(
      (binding) =>
        !binding ||
        typeof binding !== 'object' ||
        Array.isArray(binding) ||
        typeof binding.name !== 'string' ||
        !binding.name ||
        typeof binding.type !== 'string' ||
        !binding.type,
    ) ||
    new Set(settings.bindings.map((binding) => binding.name)).size !==
      settings.bindings.length
  )
    fail('REMOTE_RESPONSE_INVALID', scope);
  scope.allowedBindings = new Set([
    ...Object.keys(context.expectedText ?? requiredProductionText(name)),
    ...requiredJwtSecretNames,
    'SERVICE_VERSION',
  ]);
  for (const [key, value] of Object.entries(
    context.expectedText ?? requiredProductionText(name),
  )) {
    const binding = settings.bindings.find((b) => b.name === key);
    if (!binding) fail('BINDING_MISSING', { ...scope, binding: key });
    if (binding.type !== 'plain_text')
      fail('BINDING_TYPE_INVALID', { ...scope, binding: key });
    if (binding.text !== value)
      fail('BINDING_VALUE_INVALID', { ...scope, binding: key });
  }
  for (const key of requiredJwtSecretNames) {
    const binding = settings.bindings.find((b) => b.name === key);
    if (binding && binding.type !== 'secret_text')
      fail('BINDING_TYPE_INVALID', { ...scope, binding: key });
  }
}
export function validateSettings(
  settings,
  name,
  config,
  { phase = 'preflight', context = {}, transitions = [], expectedText } = {},
) {
  const scope = {
    ...context,
    phase,
    worker: name,
    operation: 'worker.settings',
  };
  const expected = expectedBindings(config);
  scope.allowedBindings = new Set([
    ...expected.map((binding) => binding.name),
    ...Object.keys(expectedText ?? requiredProductionText(name)),
    ...Object.keys(config.vars ?? {}),
    ...(config.secrets?.required ?? requiredJwtSecretNames),
    'SERVICE_VERSION',
    ...transitions.map((transition) => transition.name),
  ]);
  const problem = (code, binding, reason, selector) =>
    fail(code, { ...scope, binding, reason, selector });
  if (!Array.isArray(settings?.bindings)) problem('REMOTE_RESPONSE_INVALID');
  const seen = new Set();
  for (const binding of settings.bindings) {
    if (
      !binding ||
      typeof binding !== 'object' ||
      Array.isArray(binding) ||
      typeof binding.name !== 'string' ||
      !binding.name ||
      typeof binding.type !== 'string' ||
      !binding.type
    )
      problem('REMOTE_RESPONSE_INVALID');
    if (seen.has(binding.name))
      problem('REMOTE_RESPONSE_INVALID', binding.name);
    seen.add(binding.name);
  }
  validateRuntimeText(settings, name, { ...scope, expectedText });
  const normalize = (binding) => {
    try {
      return normalizeBinding(binding);
    } catch (error) {
      if (error instanceof BindingShapeError)
        problem(error.code, binding?.name);
      throw error;
    }
  };
  const actual = settings.bindings.map((binding) => {
    if (!scope.allowedBindings.has(binding.name)) problem('BINDING_MISMATCH');
    return normalize(binding);
  });
  const previous =
    phase === 'preflight'
      ? transitions.map((transition) => ({
          ...transition,
          previous:
            transition.previous === null
              ? null
              : normalize(transition.previous),
        }))
      : [];
  for (const wanted of expected) {
    const binding = actual.find((item) => item.name === wanted.name);
    const transition = previous.find((item) => item.name === wanted.name);
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
      problem(
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
    if (['plain_text', 'secret_text'].includes(binding.type)) continue;
    if (expected.some((wanted) => matchesBinding(binding, wanted))) continue;
    if (
      previous.some(
        (transition) =>
          transition.previous &&
          transition.name === binding.name &&
          matchesBinding(binding, transition.previous),
      )
    )
      continue;
    problem('BINDING_MISMATCH', binding.name);
  }
  return settings;
}
export function activeVersion(deployments, scope) {
  const current = deployments?.deployments?.[0];
  if (
    !Array.isArray(current?.versions) ||
    current.versions.length !== 1 ||
    current.versions[0].percentage !== 100 ||
    !/^[0-9a-f-]{36}$/i.test(current.versions[0].version_id ?? '')
  )
    fail('PUBLISHED_VERSION_MISMATCH', {
      ...scope,
      operation: 'worker.deployments',
    });
  return current.versions[0].version_id;
}
export async function publishedWorker(
  client,
  name,
  { settings, context = {}, phase = 'preflight' } = {},
) {
  const state =
    settings ??
    (await client.request(`${workerPath(name)}/settings`, {
      phase,
      operation: 'worker.settings',
      worker: name,
    }));
  const commitSha = state?.bindings?.find(
    (b) => b.name === 'SERVICE_VERSION' && b.type === 'plain_text',
  )?.text;
  if (!/^[0-9a-f]{40}$/.test(commitSha ?? ''))
    fail('PROVENANCE_UNAVAILABLE', {
      ...context,
      phase,
      worker: name,
      operation: 'worker.settings',
    });
  const deployments = await client.request(`${workerPath(name)}/deployments`, {
    phase,
    operation: 'worker.deployments',
    worker: name,
  });
  return {
    commitSha,
    versionId: activeVersion(deployments, { ...context, phase, worker: name }),
    settings: state,
  };
}
