import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloudflareClient } from '../deploy/cloudflare-client.mjs';
import { workerCronPolicy, recordedCrons } from '../deploy/cron-policy.mjs';
import { diagnostic, fail } from '../deploy/errors.mjs';

const worker = 'operations';
const path = '/workers/scripts/beauty-operations-worker';
const context = { phase: 'preflight', worker, operation: 'worker.schedules' };

export async function synchronizeCron({
  client,
  replaceSchedules,
  apply = false,
}) {
  const settings = () =>
    client.request(`${path}/settings`, {
      ...context,
      operation: 'worker.settings',
      cacheResult: false,
    });
  const policy = workerCronPolicy(await settings(), context);
  const read = async () => {
    const result = await client.request(`${path}/schedules`, {
      ...context,
      cacheResult: false,
    });
    if (
      !Array.isArray(result?.schedules) ||
      result.schedules.some((item) => typeof item?.cron !== 'string')
    )
      fail('REMOTE_RESPONSE_INVALID', context);
    return result.schedules.map((item) => item.cron).sort();
  };
  const previous = await read();
  const expected = [...policy.crons].sort();
  const matches = (values) =>
    JSON.stringify(values) === JSON.stringify(expected);
  const report = {
    status: matches(previous) ? 'in_sync' : 'pending',
    policy,
    previous,
    expected,
    applied: false,
  };
  if (!apply || report.status === 'in_sync') return report;
  // Do not overwrite a newer policy observed during the inspection.
  if (
    JSON.stringify(workerCronPolicy(await settings(), context)) !==
    JSON.stringify(policy)
  )
    fail('INVALID_REQUEST', context);
  await replaceSchedules(expected);
  if (
    !matches(await read()) ||
    JSON.stringify(workerCronPolicy(await settings(), context)) !==
      JSON.stringify(policy)
  )
    fail('SCHEDULE_MISMATCH', context);
  return { ...report, status: 'updated', applied: true };
}

// This writer is intentionally limited to schedules; it cannot upload code,
// modify bindings, execute SQL or access R2.
export function scheduleWriter({
  accountId,
  apiToken,
  fetchImpl = globalThis.fetch,
}) {
  cloudflareClient({ accountId, apiToken, context }); // Validate credentials locally.
  return async (crons) => {
    const desired = recordedCrons(crons);
    let response;
    try {
      response = await fetchImpl(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}${path}/schedules`,
        {
          method: 'PUT',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${apiToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(desired.map((cron) => ({ cron }))),
        },
      );
    } catch {
      fail('REMOTE_TRANSPORT_ERROR', context);
    }
    if (!response.ok)
      fail(
        response.status === 403
          ? 'REMOTE_ACCESS_DENIED'
          : response.status === 401
            ? 'REMOTE_UNAUTHENTICATED'
            : 'REMOTE_HTTP_ERROR',
        { ...context, status: response.status },
      );
    let data;
    try {
      data = await response.json();
    } catch {
      fail('REMOTE_RESPONSE_INVALID', context);
    }
    if (data?.success !== true) fail('REMOTE_RESPONSE_INVALID', context);
  };
}

export async function manageCronMain() {
  const directory = '.cache/cron';
  mkdirSync(directory, { recursive: true });
  let report;
  try {
    if (process.argv.slice(2).some((arg) => arg !== '--apply'))
      fail('INVALID_REQUEST', context);
    const credentials = {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
    };
    report = await synchronizeCron({
      client: cloudflareClient({ ...credentials, context }),
      replaceSchedules: scheduleWriter(credentials),
      apply: process.argv.includes('--apply'),
    });
  } catch (error) {
    report = { status: 'failed', failure: diagnostic(error, context) };
    process.exitCode = 1;
  }
  writeFileSync(
    `${directory}/result.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await manageCronMain();
