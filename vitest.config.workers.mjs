import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Miniflare shares D1 by database ID, not by binding name. Keep this explicit
// and independent of the production UUID so migrations and RPC use one test DB.
const testD1Databases = { D1_DATABASE: 'beauty-workers-test-db' };

async function auxiliaryWorker(
  entryPoint,
  name,
  serviceBindings = {},
  r2Buckets = [],
) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['cloudflare:workers', 'node:async_hooks'],
    define: { __BEAUTY_LOCAL__: 'true' },
    write: false,
    conditions: ['beauty'],
  });

  const directory = await mkdtemp(join(tmpdir(), 'beauty-workers-'));
  const path = join(directory, 'worker.js');
  await writeFile(path, result.outputFiles[0].text, 'utf8');

  return {
    name,
    modulesRoot: directory,
    compatibilityDate: '2026-08-30',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { ...testD1Databases },
    r2Buckets,
    serviceBindings,
    bindings: {
      APP_ENV: 'test',
      AUTH_PROVIDER: 'mock',
      OUTBOX_BATCH_SIZE: '5',
      OUTBOX_LEASE_SECONDS: '60',
      OBSERVE_ENABLED: 'false',
      MAX_CLINICAL_PHOTO_BYTES: '5242880',
    },
    modules: [{ type: 'ESModule', path }],
  };
}

const migrations = await readD1Migrations('./database/d1/migrations');

export default defineConfig({
  resolve: { conditions: ['beauty'] },
  plugins: [
    cloudflareTest(async () => ({
      remoteBindings: false,
      wrangler: {
        configPath: './apps/operations-worker/wrangler.jsonc',
        environment: 'local',
      },
      miniflare: {
        d1Databases: { ...testD1Databases },
        bindings: {
          APP_ENV: 'test',
          AUTH_PROVIDER: 'mock',
          OUTBOX_BATCH_SIZE: '5',
          OUTBOX_LEASE_SECONDS: '60',
          OBSERVE_ENABLED: 'false',
          TEST_MIGRATIONS: migrations,
          MAX_CLINICAL_PHOTO_BYTES: '5242880',
        },
        workers: [
          await auxiliaryWorker(
            './apps/operations-worker/src/worker.ts',
            'beauty-operations-runtime',
            {},
            ['PROFILE_MEDIA'],
          ),
          await auxiliaryWorker(
            './apps/clinical-worker/src/worker.ts',
            'beauty-clinical-worker',
            {
              OPERATIONS_SERVICE: 'beauty-operations-runtime',
              BILLING_SERVICE: 'beauty-billing-worker',
            },
            ['SESSION_MEDIA'],
          ),
          await auxiliaryWorker(
            './apps/billing-worker/src/worker.ts',
            'beauty-billing-worker',
            { OPERATIONS_SERVICE: 'beauty-operations-runtime' },
          ),
        ],
      },
    })),
  ],
  test: {
    globals: true,
    root: './',
    include: ['test/workers/**/*.spec.ts'],
    maxWorkers: 1,
    minWorkers: 1,
    setupFiles: ['./test/workers/setup.ts'],
  },
});
