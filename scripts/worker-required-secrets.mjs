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
  requiredJwtSecretNames,
} from './worker-deployment-config.mjs';

export const requiredBindingsFailure =
  'Required production bindings unavailable; deployment blocked.';
export class DeploymentValidationError extends Error {
  constructor(code, phase, worker, binding, status) {
    super(requiredBindingsFailure);
    this.code = code;
    this.phase = phase;
    if (worker) this.worker = worker;
    if (binding) this.binding = binding;
    if ([401, 403, 404, 429, 500, 502, 503, 504].includes(status))
      this.status = status;
  }
}

/** Read-only metadata endpoint: secret values are never requested or returned. */
export async function requireRemoteSecrets(
  configurations,
  target,
  { accountId, apiToken, fetchImpl = globalThis.fetch, publishedSha } = {},
) {
  const phase = publishedSha ? 'post_deploy' : 'preflight';
  let worker;
  const fail = (code, binding, status) => {
    throw new DeploymentValidationError(code, phase, worker, binding, status);
  };
  try {
    try {
      validateWorkerConfigurations(configurations, true);
    } catch {
      fail('INVALID_VERSIONED_CONFIGURATION');
    }
    if (
      typeof accountId !== 'string' ||
      !accountId.trim() ||
      typeof apiToken !== 'string' ||
      !apiToken.trim()
    )
      fail('REMOTE_CREDENTIALS_UNAVAILABLE');
    const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}`;
    async function read(path) {
      let response;
      try {
        response = await fetchImpl(base + path, {
          method: 'GET',
          redirect: 'error',
          headers: { authorization: `Bearer ${apiToken}` },
        });
      } catch {
        fail('REMOTE_TRANSPORT_ERROR');
      }
      if (!response.ok)
        fail(
          response.status === 401
            ? 'REMOTE_UNAUTHENTICATED'
            : response.status === 403
              ? 'REMOTE_ACCESS_DENIED'
              : response.status === 404
                ? 'REMOTE_RESOURCE_UNAVAILABLE'
                : 'REMOTE_HTTP_ERROR',
          undefined,
          response.status,
        );
      let body;
      try {
        body = await response.json();
      } catch {
        fail('REMOTE_RESPONSE_INVALID');
      }
      if (body?.success !== true) fail('REMOTE_RESPONSE_INVALID');
      return body.result;
    }
    const destinations =
      target === 'operations'
        ? selectedWorkers('all')
        : selectedWorkers(target);
    // Check receivers as well as the selected entrypoint before publication.
    for (const name of destinations) {
      worker = name;
      const config = configurations[name];
      const secrets = await read(
        `/workers/scripts/${encodeURIComponent(config.name)}/secrets`,
      );
      if (!Array.isArray(secrets)) fail('REMOTE_RESPONSE_INVALID');
      const names = new Set(
        secrets
          .filter(
            (binding) =>
              binding &&
              binding.type === 'secret_text' &&
              typeof binding.name === 'string',
          )
          .map((binding) => binding.name),
      );
      for (const secret of config.secrets.required)
        if (!names.has(secret)) {
          const declared = secrets.find((item) => item?.name === secret);
          fail(
            declared ? 'BINDING_TYPE_INVALID' : 'BINDING_MISSING',
            requiredJwtSecretNames.includes(secret) ? secret : undefined,
          );
        }
      const settings = await read(
        `/workers/scripts/${encodeURIComponent(config.name)}/settings`,
      );
      if (!Array.isArray(settings?.bindings)) fail('REMOTE_RESPONSE_INVALID');
      for (const [key, value] of Object.entries(requiredProductionText(name))) {
        const binding = settings.bindings.find((item) => item.name === key);
        if (!binding) fail('BINDING_MISSING', key);
        if (binding.type !== 'plain_text') fail('BINDING_TYPE_INVALID', key);
        if (binding.text !== value) fail('BINDING_VALUE_INVALID', key);
      }
      if (publishedSha && selectedWorkers(target).includes(name)) {
        const version = settings.bindings.find(
          (item) => item.name === 'SERVICE_VERSION',
        );
        if (version?.type !== 'plain_text' || version.text !== publishedSha)
          fail('PUBLISHED_VERSION_MISMATCH', 'SERVICE_VERSION');
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
          fail('BINDING_MISMATCH');
        if (
          binding.type === 'd1' &&
          (binding.name !== 'D1_DATABASE' ||
            binding.id !== config.d1_databases[0].database_id)
        )
          fail('BINDING_MISMATCH');
        if (
          binding.type === 'service' &&
          !(config.services ?? []).some(
            (item) =>
              item.binding === binding.name && item.service === binding.service,
          )
        )
          fail('BINDING_MISMATCH');
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
          fail('BINDING_MISMATCH');
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
          fail('BINDING_MISMATCH');
        for (const bucket of config.r2_buckets ?? [])
          if (
            !settings.bindings.some(
              (item) =>
                item.type === 'r2_bucket' &&
                item.name === bucket.binding &&
                item.bucket_name === bucket.bucket_name,
            )
          )
            fail('BINDING_MISMATCH');
        const schedules = await read(
          `/workers/scripts/${encodeURIComponent(config.name)}/schedules`,
        );
        const expected = config.triggers?.crons ?? [];
        if (
          !Array.isArray(schedules?.schedules) ||
          schedules.schedules.length !== expected.length ||
          schedules.schedules.some((item) => !expected.includes(item.cron))
        )
          fail('SCHEDULE_MISMATCH');
        const exposure = await read(
          `/workers/scripts/${encodeURIComponent(config.name)}/subdomain`,
        );
        if (exposure?.enabled !== false || exposure?.previews_enabled !== false)
          fail('BINDING_MISMATCH');
      }
    }
    const db = configurations.billing.d1_databases[0];
    worker = undefined;
    const database = await read(
      `/d1/database/${encodeURIComponent(db.database_id)}`,
    );
    if (database?.name !== 'beauty_db') fail('RESOURCE_MISMATCH');
    if (destinations.some((name) => configurations[name].r2_buckets?.length)) {
      const bucket = await read('/r2/buckets/beauty-r2');
      if (bucket?.name !== 'beauty-r2') fail('RESOURCE_MISMATCH');
      const managed = await read('/r2/buckets/beauty-r2/domains/managed');
      const custom = await read('/r2/buckets/beauty-r2/domains/custom');
      if (
        managed?.enabled !== false ||
        !Array.isArray(custom?.domains) ||
        custom.domains.some((domain) => domain.enabled !== false)
      )
        fail('BUCKET_PUBLIC');
      let capacityResponse;
      try {
        capacityResponse = await fetchImpl(
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
      } catch {
        fail('REMOTE_TRANSPORT_ERROR');
      }
      if (!capacityResponse.ok)
        fail(
          capacityResponse.status === 401
            ? 'REMOTE_UNAUTHENTICATED'
            : capacityResponse.status === 403
              ? 'REMOTE_ACCESS_DENIED'
              : capacityResponse.status === 404
                ? 'REMOTE_RESOURCE_UNAVAILABLE'
                : 'REMOTE_HTTP_ERROR',
          undefined,
          capacityResponse.status,
        );
      let capacity;
      try {
        capacity = await capacityResponse.json();
      } catch {
        fail('REMOTE_RESPONSE_INVALID');
      }
      const approval = capacity?.result?.[0]?.results?.[0];
      if (
        capacity?.success !== true ||
        capacity.result?.[0]?.success !== true ||
        !approval
      )
        fail('CAPACITY_RESPONSE_INVALID');
      if (approval.inventory_approved !== 1) fail('CAPACITY_INVENTORY_PENDING');
      if (
        approval.policy_approved !== 1 ||
        typeof approval.approval_reference !== 'string' ||
        !approval.approval_reference.trim()
      )
        fail('CAPACITY_POLICY_PENDING');
      if (approval.writers_coordinated !== 1) fail('CAPACITY_WRITERS_PENDING');
    }
  } catch (error) {
    // Do not attach the upstream body, exception or credentials as an error cause.
    if (error instanceof DeploymentValidationError) throw error;
    throw new DeploymentValidationError(
      'REMOTE_RESPONSE_INVALID',
      phase,
      worker,
    );
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
  } catch (error) {
    console.error(
      JSON.stringify(
        error instanceof DeploymentValidationError
          ? {
              code: error.code,
              phase: error.phase,
              worker: error.worker,
              binding: error.binding,
              status: error.status,
            }
          : { code: 'INVALID_REQUEST' },
      ),
    );
    process.exitCode = 1;
  }
}
