import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function auxiliaryWorker(entryPoint, name, serviceBindings = {}, r2Buckets = []) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['cloudflare:workers'],
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
    d1Databases: ['D1_DATABASE'],
    r2Buckets,
    serviceBindings,
    modules: [{ type: 'ESModule', path }],
  };
}

const migrations = await readD1Migrations('./database/d1/migrations');

export default defineConfig({
  resolve: { conditions: ['beauty'] },
  plugins: [
    cloudflareTest(async () => ({
      wrangler: {
        configPath: './apps/operations-worker/wrangler.jsonc',
      },
      miniflare: {
        bindings: { TEST_MIGRATIONS: migrations, MAX_CLINICAL_PHOTO_BYTES: '10485760' },
        workers: [
          await auxiliaryWorker('./apps/operations-worker/src/worker.ts', 'beauty-operations-runtime'),
          await auxiliaryWorker('./apps/clinical-worker/src/worker.ts', 'beauty-clinical-worker', { OPERATIONS_SERVICE: 'beauty-operations-runtime', BILLING_SERVICE: 'beauty-billing-worker' }, ['SESSION_MEDIA']),
          await auxiliaryWorker('./apps/billing-worker/src/worker.ts', 'beauty-billing-worker', { OPERATIONS_SERVICE: 'beauty-operations-runtime' }),
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
