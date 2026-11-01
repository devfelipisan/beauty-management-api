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
  options = {},
) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['cloudflare:workers', 'node:async_hooks'],
    define: { __BEAUTY_LOCAL__: options.production ? 'false' : 'true' },
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
    d1Databases: options.d1Databases ?? { ...testD1Databases },
    r2Buckets,
    serviceBindings,
    bindings: {
      APP_ENV: options.production ? 'production' : 'test',
      AUTH_PROVIDER: options.production ? 'jwt' : 'mock',
      ...(options.production
        ? {
            AUTH_ISSUER: 'https://identity.test',
            AUTH_AUDIENCE: 'authenticated',
            AUTH_JWKS_URL: 'https://identity.test/jwks',
            AUTH_ALGORITHM: 'ES256',
          }
        : {}),
      OUTBOX_BATCH_SIZE: '5',
      OUTBOX_LEASE_SECONDS: '60',
      OBSERVE_ENABLED: 'false',
      ...(name === 'beauty-operations-runtime'
        ? { MAX_PROFILE_IMAGE_BYTES: '300000' }
        : {}),
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
        d1Databases: { ...testD1Databases, TEST_CALLER_DB: 'caller-proof-db' },
        serviceBindings: {
          TEST_CALLER_ALLOWED: {
            name: 'beauty-billing-caller-proof',
            props: { caller: 'beauty-operations-worker' },
          },
          TEST_CALLER_MISSING: { name: 'beauty-billing-caller-proof' },
          TEST_CALLER_WRONG: {
            name: 'beauty-billing-caller-proof',
            props: { caller: 'browser' },
          },
        },
        bindings: {
          APP_ENV: 'test',
          AUTH_PROVIDER: 'mock',
          OUTBOX_BATCH_SIZE: '5',
          OUTBOX_LEASE_SECONDS: '60',
          OBSERVE_ENABLED: 'false',
          TEST_MIGRATIONS: migrations,
          MAX_PROFILE_IMAGE_BYTES: '300000',
        },
        workers: [
          await auxiliaryWorker(
            './apps/billing-worker/src/worker.ts',
            'beauty-billing-caller-proof',
            {},
            [],
            {
              production: true,
              d1Databases: { D1_DATABASE: 'caller-proof-db' },
            },
          ),
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
            [],
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
