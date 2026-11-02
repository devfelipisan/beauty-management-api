import {
  publishedWorker,
  validateSettings,
  workerPath,
} from './worker-state.mjs';
import { requiredProductionText } from './config-contract.mjs';
import { workerCronPolicy } from './cron-policy.mjs';
import { fail } from './errors.mjs';
export async function postcheck({
  client,
  worker,
  versionId,
  configuration,
  context = {},
  transitions = [],
  expectedCronVariables,
}) {
  client.invalidate();
  const state = await publishedWorker(client, worker, {
    phase: 'postcheck',
    context,
  });
  validateSettings(state.settings, worker, configuration, {
    transitions,
    phase: 'postcheck',
    context,
    ...(worker === 'operations' && expectedCronVariables
      ? {
          expectedText: {
            ...requiredProductionText(worker),
            ...expectedCronVariables,
          },
        }
      : {}),
  });
  if (state.versionId !== versionId)
    fail('PUBLISHED_VERSION_MISMATCH', {
      ...context,
      phase: 'postcheck',
      operation: 'worker.deployments',
      worker,
    });
  const controls = await checkWorkerControls(
    client,
    worker,
    configuration,
    context,
    'postcheck',
    state.settings,
  );
  return {
    worker,
    versionId,
    deploymentId: state.deploymentId,
    verification: 'passed',
    ...(worker === 'operations' ? { scheduledCrons: controls.crons } : {}),
  };
}
export async function checkWorkerSchedule(
  client,
  worker,
  configuration,
  context = {},
  phase = 'audit',
  settings,
) {
  const schedules = await client.request(`${workerPath(worker)}/schedules`, {
    phase,
    operation: 'worker.schedules',
    worker,
  });
  const expected =
    worker === 'operations'
      ? workerCronPolicy(
          settings ??
            (await client.request(`${workerPath(worker)}/settings`, {
              phase,
              operation: 'worker.settings',
              worker,
            })),
          { ...context, phase },
        ).crons
      : (configuration.triggers?.crons ?? []);
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
  return { crons: expected };
}

export async function checkWorkerControls(
  client,
  worker,
  configuration,
  context = {},
  phase = 'audit',
  settings,
) {
  const checked = await checkWorkerSchedule(
    client,
    worker,
    configuration,
    context,
    phase,
    settings,
  );
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
  return checked;
}
