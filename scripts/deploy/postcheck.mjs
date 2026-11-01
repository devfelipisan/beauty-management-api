import {
  publishedWorker,
  validateSettings,
  workerPath,
} from './worker-state.mjs';
import { fail } from './errors.mjs';
export async function postcheck({
  client,
  worker,
  versionId,
  commitSha,
  configuration,
  context = {},
}) {
  client.invalidate();
  const state = await publishedWorker(client, worker, {
    phase: 'postcheck',
    context,
  });
  validateSettings(state.settings, worker, configuration, {
    phase: 'postcheck',
    context,
  });
  if (state.commitSha !== commitSha || state.versionId !== versionId)
    fail('PUBLISHED_VERSION_MISMATCH', {
      ...context,
      phase: 'postcheck',
      operation: 'worker.deployments',
      worker,
    });
  await checkWorkerControls(
    client,
    worker,
    configuration,
    context,
    'postcheck',
  );
  return { worker, versionId, commitSha, verification: 'passed' };
}
export async function checkWorkerControls(
  client,
  worker,
  configuration,
  context = {},
  phase = 'audit',
) {
  const schedules = await client.request(`${workerPath(worker)}/schedules`, {
    phase,
    operation: 'worker.schedules',
    worker,
  });
  const expected = configuration.triggers?.crons ?? [];
  if (
    !Array.isArray(schedules?.schedules) ||
    schedules.schedules.length !== expected.length ||
    schedules.schedules.some((s) => !expected.includes(s.cron))
  )
    fail('SCHEDULE_MISMATCH', {
      ...context,
      phase,
      operation: 'worker.schedules',
      worker,
    });
  const exposure = await client.request(`${workerPath(worker)}/subdomain`, {
    phase,
    operation: 'worker.exposure',
    worker,
  });
  if (exposure?.enabled !== false || exposure?.previews_enabled !== false)
    fail('PUBLIC_EXPOSURE', {
      ...context,
      phase,
      operation: 'worker.exposure',
      worker,
    });
}
