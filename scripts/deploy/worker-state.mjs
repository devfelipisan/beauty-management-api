import {
  requiredProductionText,
  requiredJwtSecretNames,
} from './config-contract.mjs';
import { fail } from './errors.mjs';
export const workerPath = (name) => `/workers/scripts/beauty-${name}-worker`;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function validateRuntimeText(settings, name, context = {}) {
  const scope = {
    ...context,
    phase: context.phase ?? 'preflight',
    worker: name,
    operation: 'worker.settings',
  };
  if (!Array.isArray(settings?.bindings))
    fail('REMOTE_RESPONSE_INVALID', scope);
  for (const [key, value] of Object.entries(
    context.expectedText ?? requiredProductionText(name),
  )) {
    const binding = settings.bindings.find((b) => b.name === key);
    if (!binding) fail('BINDING_MISSING', scope);
    if (binding.type !== 'plain_text') fail('BINDING_TYPE_INVALID', scope);
    if (binding.text !== value) fail('BINDING_VALUE_INVALID', scope);
  }
  for (const key of requiredJwtSecretNames) {
    const binding = settings.bindings.find((b) => b.name === key);
    if (binding && binding.type !== 'secret_text')
      fail('BINDING_TYPE_INVALID', scope);
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
  if (
    !Array.isArray(settings?.bindings) ||
    new Set(settings.bindings.map((b) => b.name)).size !==
      settings.bindings.length
  )
    fail('REMOTE_RESPONSE_INVALID', scope);
  const expected = [
    ...config.d1_databases.map((db) => ({
      type: 'd1',
      name: db.binding,
      id: db.database_id,
    })),
    ...config.services.map((service) => ({
      type: 'service',
      name: service.binding,
      service: service.service,
      props: service.props,
    })),
    ...(config.r2_buckets ?? []).map((bucket) => ({
      type: 'r2_bucket',
      name: bucket.binding,
      bucket_name: bucket.bucket_name,
    })),
  ];
  const matches = (actual, wanted) =>
    Object.entries(wanted).every(([key, value]) => equal(actual?.[key], value));
  validateRuntimeText(settings, name, { ...scope, expectedText });
  for (const wanted of expected) {
    const actual = settings.bindings.find((b) => b.name === wanted.name);
    const transition =
      phase === 'preflight' && transitions.find((t) => t.name === wanted.name);
    if (
      !matches(actual, wanted) &&
      !(
        transition &&
        (transition.previous === null
          ? !actual
          : matches(actual, transition.previous))
      )
    )
      fail(actual ? 'BINDING_MISMATCH' : 'BINDING_MISSING', scope);
  }
  for (const actual of settings.bindings) {
    if (['plain_text', 'secret_text'].includes(actual.type)) continue;
    if (expected.some((wanted) => matches(actual, wanted))) continue;
    if (
      phase === 'preflight' &&
      transitions.some(
        (t) =>
          t.previous && t.name === actual.name && matches(actual, t.previous),
      )
    )
      continue;
    fail('BINDING_MISMATCH', scope);
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
