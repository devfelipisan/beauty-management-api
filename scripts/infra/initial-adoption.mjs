import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import {
  workerConfigurations,
  releaseBranch,
} from '../deploy/config-contract.mjs';
import {
  manifestAtCommit,
  validateManifest,
  simulateRelease,
} from '../deploy/manifest.mjs';
import { githubClient } from '../deploy/github-client.mjs';
import { cloudflareClient } from '../deploy/cloudflare-client.mjs';
import { infrastructureReadiness } from './readiness.mjs';
import { publishedWorker } from '../deploy/worker-state.mjs';
import { fail, diagnostic } from '../deploy/errors.mjs';
import { validateWorkerConfigurations } from '../deploy/validate-local.mjs';

export function historicalSource(commitSha) {
  const read = (path) =>
    execFileSync('git', ['show', `${commitSha}:${path}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  const manifest = JSON.parse(read('scripts/deploy/manifest.json'));
  validateManifest(manifest, manifestAtCommit(commitSha));
  const configurations = Object.fromEntries(
    Object.entries(workerConfigurations).map(([worker, path]) => {
      const parsed = ts.parseConfigFileTextToJson(path, read(path));
      if (parsed.error)
        fail('MANIFEST_INVALID', {
          phase: 'provenance',
          operation: 'github.manifest',
          worker,
        });
      return [worker, parsed.config];
    }),
  );
  validateWorkerConfigurations(configurations, true);
  return { manifest, configurations };
}

export async function initialAdoption({
  baseline,
  client,
  github,
  context,
  source = historicalSource,
  readiness = infrastructureReadiness,
  persist = () => {},
}) {
  const names = Object.keys(workerConfigurations);
  const scope = {
    ...context,
    phase: 'provenance',
    operation: 'github.deployment',
  };
  if (
    !baseline?.workers ||
    Object.keys(baseline.workers).sort().join() !== [...names].sort().join()
  )
    fail('ADOPTION_EVIDENCE_INVALID', scope);
  const qualified = [],
    configurations = {},
    runtimeText = {},
    topology = {},
    migrations = new Map();
  // No writes until every historical proof, infrastructure gate and final version recheck passes.
  for (const worker of names) {
    const entry = baseline.workers[worker];
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      Object.keys(entry).some(
        (key) =>
          ![
            'commitSha',
            'versionId',
            'qualificationReference',
            'evidence',
          ].includes(key),
      ) ||
      !/^[0-9a-f]{40}$/.test(entry?.commitSha ?? '') ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
        entry?.versionId ?? '',
      ) ||
      typeof entry.qualificationReference !== 'string' ||
      !entry.qualificationReference.trim()
    )
      fail('ADOPTION_EVIDENCE_INVALID', { ...scope, worker });
    const historical = source(entry.commitSha);
    const evidence = await github.adoptionEvidence(
      worker,
      entry,
      historical.manifest,
    );
    configurations[worker] = historical.configurations[worker];
    topology[worker] = historical.manifest.workers[worker];
    runtimeText[worker] = topology[worker].productionText;
    for (const migration of historical.manifest.migrations.filter(
      (m) => m.name.slice(0, 4) <= topology[worker].minMigration,
    )) {
      if (
        migrations.has(migration.name) &&
        JSON.stringify(migrations.get(migration.name)) !==
          JSON.stringify(migration)
      )
        fail('MANIFEST_INVALID', { ...scope, worker });
      migrations.set(migration.name, migration);
    }
    const actual = await publishedWorker(client, worker, {
      context: scope,
      phase: 'readiness',
    });
    if (actual.versionId !== entry.versionId)
      fail('PUBLISHED_VERSION_MISMATCH', { ...scope, worker });
    qualified.push({
      worker,
      commitSha: entry.commitSha,
      versionId: entry.versionId,
      qualificationReference: entry.qualificationReference,
      manifest: historical.manifest,
      adoptionEvidence: evidence,
    });
  }
  simulateRelease(topology, { workers: topology }, []);
  if (
    new Set(
      names.map((worker) => configurations[worker].d1_databases[0].database_id),
    ).size !== 1
  )
    fail('RESOURCE_MISMATCH', scope);
  await readiness({
    client,
    configurations,
    context,
    runtimeText,
    approveMedia: true,
  });
  const required = [...migrations.keys()];
  if (!required.length) fail('MANIFEST_INVALID', scope);
  const db = configurations.operations.d1_databases[0].database_id;
  const result = await client.request(`/d1/database/${db}/query`, {
    phase: 'readiness',
    operation: 'database.schema',
    body: {
      sql: `SELECT name FROM d1_migrations WHERE name IN (${required.map(() => '?').join(',')})`,
      params: required,
    },
  });
  const applied = new Set(result?.[0]?.results?.map((row) => row.name));
  if (
    result?.[0]?.success !== true ||
    required.some((name) => !applied.has(name))
  )
    fail('SCHEMA_NOT_READY', scope);
  client.invalidate();
  for (const item of qualified) {
    const actual = await publishedWorker(client, item.worker, {
      context: scope,
      phase: 'readiness',
    });
    if (actual.versionId !== item.versionId)
      fail('PUBLISHED_VERSION_MISMATCH', { ...scope, worker: item.worker });
  }
  const records = [];
  for (const item of qualified) {
    records.push({
      worker: item.worker,
      id: await github.recordPublished({
        ...item,
        baseline: true,
        runId: context.runId,
      }),
    });
    persist(records);
  }
  return records;
}

export async function initialAdoptionMain() {
  const context = {
    phase: 'provenance',
    operation: 'github.deployment',
    commitSha: process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID,
  };
  const report = { action: 'initial-adoption', status: 'running', records: [] };
  mkdirSync('.cache/infrastructure', { recursive: true });
  const persist = () =>
    writeFileSync(
      '.cache/infrastructure/result.json',
      JSON.stringify(report, null, 2) + '\n',
    );
  try {
    if (
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_REF !== `refs/heads/${releaseBranch}` ||
      !/^[0-9a-f]{40}$/.test(context.commitSha ?? '') ||
      !/^[1-9][0-9]*$/.test(context.runId ?? '')
    )
      fail('INVALID_REQUEST', context);
    if (
      execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim() !== context.commitSha
    )
      fail('SHA_INELIGIBLE', context);
    const baseline = JSON.parse(
      readFileSync('.github/deploy/baseline.json', 'utf8'),
    );
    const github = githubClient({
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
      context,
    });
    const own = await github.request(`/actions/runs/${context.runId}`);
    if (
      own.path !== '.github/workflows/infrastructure-initial-adoption.yml' ||
      String(own.id) !== context.runId ||
      String(own.run_attempt) !== process.env.GITHUB_RUN_ATTEMPT ||
      own.head_sha !== context.commitSha ||
      own.event !== 'workflow_dispatch' ||
      own.head_branch !== releaseBranch ||
      own.repository?.full_name !== process.env.GITHUB_REPOSITORY
    )
      fail('INVALID_REQUEST', context);
    const client = cloudflareClient({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      context,
    });
    report.records = await initialAdoption({
      baseline,
      github,
      client,
      context,
      persist: (records) => {
        report.records = [...records];
        persist();
      },
    });
    report.status = 'success';
  } catch (error) {
    report.status = 'failed';
    report.failure = diagnostic(error, context);
    console.error(JSON.stringify(report.failure));
    process.exitCode = 1;
  } finally {
    persist();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await initialAdoptionMain();
