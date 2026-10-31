import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  deploymentRequest,
  readConfiguration,
  selectedWorkers,
  validateWorkerConfigurations,
  workerConfigurations,
  requiredProductionText,
} from './worker-deployment-config.mjs';

export const requiredBindingsFailure =
  'Required production bindings unavailable; deployment blocked.';

/** Read-only metadata endpoint: secret values are never requested or returned. */
export async function requireRemoteSecrets(
  configurations,
  target,
  { accountId, apiToken, fetchImpl = globalThis.fetch, publishedSha } = {},
) {
  try {
    validateWorkerConfigurations(configurations, true);
    if (
      typeof accountId !== 'string' ||
      !accountId.trim() ||
      typeof apiToken !== 'string' ||
      !apiToken.trim()
    )
      throw new Error();
    const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}`;
    async function read(path) {
      const response = await fetchImpl(base + path, {
        method: 'GET',
        redirect: 'error',
        headers: { authorization: `Bearer ${apiToken}` },
      });
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (body?.success !== true) throw new Error();
      return body.result;
    }
    const destinations =
      target === 'operations'
        ? selectedWorkers('all')
        : selectedWorkers(target);
    // Check receivers as well as the selected entrypoint before publication.
    for (const name of destinations) {
      const config = configurations[name];
      const response = await fetchImpl(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(config.name)}/secrets`,
        {
          method: 'GET',
          redirect: 'error',
          headers: { authorization: `Bearer ${apiToken}` },
        },
      );
      if (!response.ok) throw new Error();
      const metadata = await response.json();
      if (metadata?.success !== true || !Array.isArray(metadata.result))
        throw new Error();
      const names = new Set(
        metadata.result
          .filter(
            (binding) =>
              binding &&
              binding.type === 'secret_text' &&
              typeof binding.name === 'string',
          )
          .map((binding) => binding.name),
      );
      if (config.secrets.required.some((secret) => !names.has(secret)))
        throw new Error();
      const settings = await read(
        `/workers/scripts/${encodeURIComponent(config.name)}/settings`,
      );
      if (!Array.isArray(settings?.bindings)) throw new Error();
      for (const [key, value] of Object.entries(requiredProductionText(name))) {
        const binding = settings.bindings.find((item) => item.name === key);
        if (binding?.type !== 'plain_text' || binding.text !== value)
          throw new Error();
      }
      if (publishedSha && selectedWorkers(target).includes(name)) {
        const version = settings.bindings.find(
          (item) => item.name === 'SERVICE_VERSION',
        );
        if (version?.type !== 'plain_text' || version.text !== publishedSha)
          throw new Error();
      }
      for (const binding of settings.bindings) {
        if (
          binding.type === 'r2_bucket' &&
          !(config.r2_buckets ?? []).some(
            (item) =>
              item.binding === binding.name &&
              item.bucket_name === binding.bucket_name,
          )
        )
          throw new Error();
        if (
          binding.type === 'd1' &&
          (binding.name !== 'D1_DATABASE' ||
            binding.id !== config.d1_databases[0].database_id)
        )
          throw new Error();
        if (
          binding.type === 'service' &&
          !(config.services ?? []).some(
            (item) =>
              item.binding === binding.name && item.service === binding.service,
          )
        )
          throw new Error();
      }
      if (publishedSha && selectedWorkers(target).includes(name)) {
        if (
          !settings.bindings.some(
            (item) =>
              item.type === 'd1' &&
              item.name === 'D1_DATABASE' &&
              item.id === config.d1_databases[0].database_id,
          )
        )
          throw new Error();
        if (
          config.services.some(
            (service) =>
              !settings.bindings.some(
                (item) =>
                  item.type === 'service' &&
                  item.name === service.binding &&
                  item.service === service.service,
              ),
          )
        )
          throw new Error();
        for (const bucket of config.r2_buckets ?? [])
          if (
            !settings.bindings.some(
              (item) =>
                item.type === 'r2_bucket' &&
                item.name === bucket.binding &&
                item.bucket_name === bucket.bucket_name,
            )
          )
            throw new Error();
        const schedules = await read(
          `/workers/scripts/${encodeURIComponent(config.name)}/schedules`,
        );
        const expected = config.triggers?.crons ?? [];
        if (
          !Array.isArray(schedules?.schedules) ||
          schedules.schedules.length !== expected.length ||
          schedules.schedules.some((item) => !expected.includes(item.cron))
        )
          throw new Error();
        const exposure = await read(
          `/workers/scripts/${encodeURIComponent(config.name)}/subdomain`,
        );
        if (exposure?.enabled !== false || exposure?.previews_enabled !== false)
          throw new Error();
      }
    }
    const db = configurations.billing.d1_databases[0];
    const database = await read(
      `/d1/database/${encodeURIComponent(db.database_id)}`,
    );
    if (database?.name !== 'beauty_db') throw new Error();
    if (destinations.some((name) => configurations[name].r2_buckets?.length)) {
      const bucket = await read('/r2/buckets/beauty-r2');
      if (bucket?.name !== 'beauty-r2') throw new Error();
      const managed = await read('/r2/buckets/beauty-r2/domains/managed');
      const custom = await read('/r2/buckets/beauty-r2/domains/custom');
      if (
        managed?.enabled !== false ||
        !Array.isArray(custom?.domains) ||
        custom.domains.some((domain) => domain.enabled !== false)
      )
        throw new Error();
      const capacityResponse = await fetchImpl(
        `${base}/d1/database/${encodeURIComponent(db.database_id)}/query`,
        {
          method: 'POST',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${apiToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            sql: 'SELECT inventory_approved,policy_approved,writers_coordinated,approval_reference FROM media_capacity WHERE bucket = ?',
            params: ['beauty-r2'],
          }),
        },
      );
      if (!capacityResponse.ok) throw new Error();
      const capacity = await capacityResponse.json();
      const approval = capacity?.result?.[0]?.results?.[0];
      if (
        capacity?.success !== true ||
        capacity.result[0].success !== true ||
        approval?.inventory_approved !== 1 ||
        approval?.policy_approved !== 1 ||
        approval?.writers_coordinated !== 1 ||
        typeof approval?.approval_reference !== 'string' ||
        !approval.approval_reference.trim()
      )
        throw new Error();
    }
  } catch {
    // Do not attach the upstream body, exception or credentials as an error cause.
    throw new Error(requiredBindingsFailure);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const request = deploymentRequest(
      JSON.parse(readFileSync('.github/deploy/request.json', 'utf8')),
    );
    if (request.mode !== 'deploy') throw new Error();
    const configs = Object.fromEntries(
      Object.entries(workerConfigurations).map(([name, path]) => [
        name,
        readConfiguration(path),
      ]),
    );
    await requireRemoteSecrets(configs, request.worker, {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
    });
    console.log(
      'Required production bindings verified for the selected Workers.',
    );
  } catch {
    console.error(requiredBindingsFailure);
    process.exitCode = 1;
  }
}
