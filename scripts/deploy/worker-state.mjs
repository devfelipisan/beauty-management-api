import { fail } from './errors.mjs';
export {
  validateRuntimeText,
  validateSettings,
  analyzeSettings,
} from './settings-analysis.mjs';
export const workerPath = (name) => `/workers/scripts/beauty-${name}-worker`;
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
