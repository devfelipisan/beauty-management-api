import { readConfiguration } from './validate-local.mjs';
import {
  workerConfigurations,
  requiredProductionText,
} from './config-contract.mjs';
import { readManifest } from './manifest.mjs';
import { cloudflareClient } from './cloudflare-client.mjs';
export const sha = 'a'.repeat(40),
  version = '12345678-1234-1234-1234-123456789abc';
export const configurations = Object.fromEntries(
  Object.entries(workerConfigurations).map(([name, path]) => [
    name,
    readConfiguration(path),
  ]),
);
export const manifest = readManifest();
export function settings(name) {
  const config = configurations[name];
  return {
    bindings: [
      ...Object.entries(requiredProductionText(name)).map(([name, text]) => ({
        name,
        type: 'plain_text',
        text,
      })),
      ...config.d1_databases.map((db) => ({
        name: db.binding,
        type: 'd1',
        database_id: db.database_id,
      })),
      ...config.services.map((service) => ({
        name: service.binding,
        type: 'service',
        service: service.service,
        ...(service.entrypoint ? { entrypoint: service.entrypoint } : {}),
        ...(service.environment ? { environment: service.environment } : {}),
      })),
      ...(config.r2_buckets ?? []).map((bucket) => ({
        name: bucket.binding,
        type: 'r2_bucket',
        bucket_name: bucket.bucket_name,
      })),
    ],
  };
}
export const response = (result) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, result }),
});
export function fixture(override = () => undefined) {
  const calls = [];
  const client = cloudflareClient({
    accountId: 'fixture-account',
    apiToken: 'fixture-token',
    context: { phase: 'preflight' },
    fetchImpl: async (url, options) => {
      const path = url.replace(/^.*\/accounts\/fixture-account/, '');
      const body = options.body ? JSON.parse(options.body) : undefined;
      calls.push({ path, body, method: options.method });
      const changed = override(path, body);
      if (changed !== undefined) return changed;
      const name = path.match(
        /beauty-(operations|billing|clinical)-worker/,
      )?.[1];
      if (path.endsWith('/settings')) return response(settings(name));
      if (path.endsWith('/deployments'))
        return response({
          deployments: [
            { versions: [{ version_id: version, percentage: 100 }] },
          ],
        });
      if (path.endsWith('/schedules'))
        return response({
          schedules: (configurations[name].triggers?.crons ?? []).map(
            (cron) => ({ cron }),
          ),
        });
      if (path.endsWith('/subdomain'))
        return response({ enabled: false, previews_enabled: false });
      if (path.endsWith('/query'))
        return response([
          {
            success: true,
            results: manifest.migrations.map((m) => ({ name: m.name })),
          },
        ]);
      if (path.endsWith('/domains/managed'))
        return response({ enabled: false });
      if (path.endsWith('/domains/custom')) return response({ domains: [] });
      if (path.endsWith('/beauty-r2')) return response({ name: 'beauty-r2' });
      if (path.includes('/d1/database/'))
        return response({ name: 'beauty_db' });
      assertUnexpected(path);
    },
  });
  const github = {
    metrics: { calls: 0 },
    provenanceByVersion: async (name) => ({
      worker: name,
      commitSha: sha,
      versionId: version,
      manifest: structuredClone(manifest),
      workerManifest: structuredClone(manifest.workers[name]),
      evidence: { runId: '1', runAttempt: 1, verification: 'passed' },
    }),
    recordPublished: async () => 42,
  };
  return { client, github, calls };
}
function assertUnexpected(path) {
  throw new Error(`Unexpected fixture endpoint ${path}`);
}
