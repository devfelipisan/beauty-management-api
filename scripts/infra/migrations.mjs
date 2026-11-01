import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readManifest, digest } from '../deploy/manifest.mjs';
import { readConfiguration } from '../deploy/validate-local.mjs';
import {
  workerConfigurations,
  releaseBranch,
} from '../deploy/config-contract.mjs';
import { cloudflareClient } from '../deploy/cloudflare-client.mjs';
import { githubClient } from '../deploy/github-client.mjs';
import { diagnostic, fail } from '../deploy/errors.mjs';
export async function migrationHistory(client, id) {
  const tables = await client.request(`/d1/database/${id}/query`, {
    operation: 'database.schema',
    phase: 'readiness',
    cacheResult: false,
    body: {
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='d1_migrations'",
      params: [],
    },
  });
  if (tables?.[0]?.success !== true || !Array.isArray(tables[0].results))
    fail('REMOTE_RESPONSE_INVALID', {
      phase: 'readiness',
      operation: 'database.schema',
    });
  if (!tables[0].results.length) return [];
  const rows = await client.request(`/d1/database/${id}/query`, {
    operation: 'database.schema',
    phase: 'readiness',
    cacheResult: false,
    body: { sql: 'SELECT name FROM d1_migrations ORDER BY id', params: [] },
  });
  if (rows?.[0]?.success !== true || !Array.isArray(rows[0].results))
    fail('REMOTE_RESPONSE_INVALID', {
      phase: 'readiness',
      operation: 'database.schema',
    });
  return rows[0].results.map((row) => row.name);
}
export async function migrationsMain() {
  const context = {
    phase: 'readiness',
    operation: 'database.schema',
    commitSha: process.env.GITHUB_SHA,
  };
  const report = {
    commitSha: process.env.GITHUB_SHA,
    status: 'running',
    mode: process.argv.includes('--apply') ? 'apply' : 'inspect',
  };
  mkdirSync('.cache/migrations', { recursive: true });
  try {
    if (
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.GITHUB_REF !== `refs/heads/${releaseBranch}`
    )
      fail('INVALID_REQUEST', context);
    const manifest = readManifest(),
      manifestDigest = digest(manifest);
    const github = githubClient({
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
      context,
    });
    const client = cloudflareClient({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      context,
    });
    const db = readConfiguration(workerConfigurations.operations)
      .d1_databases[0];
    const applied = await migrationHistory(client, db.database_id);
    if (
      applied.some((name) => !manifest.migrations.some((m) => m.name === name))
    )
      fail('SCHEMA_NOT_READY', context);
    report.pending = manifest.migrations
      .filter((m) => !applied.includes(m.name))
      .map((m) => m.name);
    report.manifestDigest = manifestDigest;
    if (report.mode === 'apply') {
      const inspection = process.env.INSPECTION_RUN_ID;
      if (!/^\d+$/.test(inspection ?? '')) fail('INVALID_REQUEST', context);
      const records = await github.request(
        `/deployments?environment=production-migrations&task=beauty-migrations-inspection&sha=${process.env.GITHUB_SHA}&per_page=100`,
        { operation: 'github.deployment' },
      );
      const prior = records.find(
        (record) =>
          record.creator?.login === 'github-actions[bot]' &&
          record.payload?.runId === inspection &&
          record.payload?.manifestDigest === manifestDigest &&
          JSON.stringify(record.payload?.pending) ===
            JSON.stringify(report.pending),
      );
      if (!prior) fail('PROVENANCE_UNAVAILABLE', context);
      const status = await github.request(
        `/deployments/${prior.id}/statuses?per_page=1`,
        { operation: 'github.deployment' },
      );
      const run = await github.request(`/actions/runs/${inspection}`, {
        operation: 'github.ci',
      });
      if (
        status[0]?.state !== 'success' ||
        run.head_sha !== process.env.GITHUB_SHA ||
        run.head_branch !== releaseBranch ||
        run.event !== 'workflow_dispatch' ||
        run.path !== '.github/workflows/migrations-d1.yml' ||
        run.conclusion !== 'success'
      )
        fail('PROVENANCE_UNAVAILABLE', context);
      const result = spawnSync(
        process.execPath,
        [
          resolve('node_modules/wrangler/bin/wrangler.js'),
          'd1',
          'migrations',
          'apply',
          'beauty_db',
          '--remote',
          '--config',
          workerConfigurations.operations,
        ],
        { encoding: 'utf8' },
      );
      if (result.error || result.status !== 0) fail('WRANGLER_FAILED', context);
      const after = await migrationHistory(client, db.database_id);
      if (manifest.migrations.some((m) => !after.includes(m.name)))
        fail('SCHEMA_NOT_READY', context);
      report.applied = report.pending;
    } else {
      const record = await github.request('/deployments', {
        method: 'POST',
        operation: 'github.deployment',
        body: {
          ref: process.env.GITHUB_SHA,
          task: 'beauty-migrations-inspection',
          environment: 'production-migrations',
          auto_merge: false,
          required_contexts: [],
          payload: {
            runId: process.env.GITHUB_RUN_ID,
            manifestDigest,
            pending: report.pending,
          },
        },
      });
      await github.request(`/deployments/${record.id}/statuses`, {
        method: 'POST',
        operation: 'github.deployment',
        body: { state: 'success', auto_inactive: false },
      });
      report.inspectionDeploymentId = record.id;
    }
    report.status = 'success';
    report.cloudflare = client.metrics;
  } catch (error) {
    report.status = 'failed';
    report.failure = diagnostic(error, context);
    console.error(JSON.stringify(report.failure));
    process.exitCode = 1;
  } finally {
    writeFileSync(
      '.cache/migrations/result.json',
      JSON.stringify(report, null, 2) + '\n',
    );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await migrationsMain();
