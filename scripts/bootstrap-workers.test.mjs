import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapWorkers } from './bootstrap-workers.mjs';
import {
  readConfiguration,
  workerConfigurations,
} from './worker-deployment-config.mjs';
const configs = Object.fromEntries(
  Object.entries(workerConfigurations).map(([name, path]) => [
    name,
    readConfiguration(path),
  ]),
);
const base = {
  request: { mode: 'deploy', worker: 'all', requestId: 'bootstrap-test' },
  configs,
  account: 'fixture',
  token: 'fixture',
  apply: true,
  environment: {
    GITHUB_ACTIONS: 'true',
    GITHUB_REF: 'refs/heads/feature/microsservices',
  },
};
const exists = { ok: true, json: async () => ({ success: true }) },
  missing = { ok: false, status: 404 };
test('preserves existing Workers and never invokes publication', async () => {
  assert.deepEqual(
    await bootstrapWorkers({
      ...base,
      fetchImpl: async () => exists,
      spawnImpl: () => assert.fail('must not publish'),
    }),
    { created: 0 },
  );
});
test('creates only absent private Workers and reports a mandatory application stop', async () => {
  const calls = [];
  const result = await bootstrapWorkers({
    ...base,
    fetchImpl: async (url) => (url.includes('clinical') ? missing : exists),
    spawnImpl: (_node, args, options) => {
      calls.push({ args, options });
      return { status: 0 };
    },
  });
  assert.equal(result.created, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].args.at(-1), /beauty-clinical-worker.json$/);
  const config = JSON.parse(
    (await import('node:fs')).readFileSync(calls[0].args.at(-1), 'utf8'),
  );
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  for (const key of ['d1_databases', 'r2_buckets', 'triggers', 'routes'])
    assert.equal(config[key], undefined);
  assert.equal(calls[0].options.stdio, undefined);
});
test('does not interpret access denied as absence or overwrite a Worker appearing after inventory', async () => {
  await assert.rejects(
    bootstrapWorkers({
      ...base,
      fetchImpl: async () => ({ ok: false, status: 403 }),
      spawnImpl: () => assert.fail('must not publish'),
    }),
  );
  let calls = 0;
  await assert.rejects(
    bootstrapWorkers({
      ...base,
      fetchImpl: async () => (++calls <= 3 ? missing : exists),
      spawnImpl: () => assert.fail('must not overwrite'),
    }),
    /refusing to overwrite/,
  );
});
test('stops on bootstrap publication failure and rejects application requests outside the protected workflow', async () => {
  await assert.rejects(
    bootstrapWorkers({
      ...base,
      fetchImpl: async () => missing,
      spawnImpl: () => ({ status: 1 }),
    }),
    /Private bootstrap failed/,
  );
  await assert.rejects(
    bootstrapWorkers({
      ...base,
      environment: {},
      fetchImpl: async () => missing,
      spawnImpl: () => assert.fail('must not publish'),
    }),
    /protected production workflow/,
  );
});
