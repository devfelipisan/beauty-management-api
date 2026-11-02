import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  releaseOrder,
  releaseBranch,
  workerConfigurations,
} from '../deploy/config-contract.mjs';
import {
  readConfiguration,
  validateWorkerConfigurations,
} from '../deploy/validate-local.mjs';
import { readManifest, digest, simulateRelease } from '../deploy/manifest.mjs';
import { githubClient } from '../deploy/github-client.mjs';
import { cloudflareClient } from '../deploy/cloudflare-client.mjs';
import { publishedWorker } from '../deploy/worker-state.mjs';
import { postcheck } from '../deploy/postcheck.mjs';
import { infrastructureReadiness } from './readiness.mjs';
import { firstPublicationRequest } from './first-publication-request.mjs';
import { deploymentOutcome } from '../worker-deployment-output.mjs';
import { fail, diagnostic } from '../deploy/errors.mjs';
import { checkProtection } from '../check-production-protection.mjs';

export async function firstPublication({
  context,
  configurations,
  manifest,
  client,
  github,
  publish,
  persist = () => {},
}) {
  const report = {
    action: 'first-publication',
    status: 'running',
    commitSha: context.commitSha,
    controlSha: context.controlSha,
    workers: [],
    previousVersions: {},
    records: [],
    eligibility: context,
    manifestDigest: digest(manifest),
  };
  const expected = {};
  const assertActive = async (versions) => {
    client.invalidate();
    for (const worker of releaseOrder) {
      const state = await publishedWorker(client, worker, {
        context,
        phase: 'readiness',
      });
      if (state.versionId !== versions[worker])
        fail('PUBLISHED_VERSION_MISMATCH', {
          ...context,
          phase: 'readiness',
          operation: 'worker.deployments',
          worker,
        });
    }
  };
  try {
    if (context.releaseOrigin !== 'first-publication')
      fail('FIRST_PUBLICATION_NOT_APPROVED', context);
    const requested = firstPublicationRequest(
      context.requested,
      context.commitSha,
    );
    validateWorkerConfigurations(configurations, true);
    // Candidate RPC compatibility is checked automatically. Compatibility with
    // unknown old code and a quiesced rollout window require the reviewed references.
    simulateRelease(manifest.workers, manifest, []);
    for (const worker of releaseOrder) {
      const actual = await publishedWorker(client, worker, {
        context,
        phase: 'readiness',
      });
      if (actual.versionId !== requested.workers[worker].versionId)
        fail('PUBLISHED_VERSION_MISMATCH', {
          ...context,
          phase: 'readiness',
          operation: 'worker.deployments',
          worker,
        });
      report.previousVersions[worker] = {
        versionId: actual.versionId,
        deploymentId: actual.deploymentId,
        percentage: 100,
        provenance: 'unverified',
      };
      expected[worker] = actual.versionId;
    }
    persist(report);
    // Once all active versions are trusted, use the normal release workflow.
    // Remote access/transport errors must never authorize this exceptional path.
    await github.assertFirstPublicationNeeded(expected);
    await infrastructureReadiness({
      client,
      configurations,
      context,
      phase: 'preflight',
      approveMedia: false,
      checkR2: false,
      bindingTransitions: Object.fromEntries(
        releaseOrder.map((worker) => [
          worker,
          manifest.workers[worker].transitions,
        ]),
      ),
    });
    const required = manifest.migrations.filter((migration) =>
      releaseOrder.some(
        (worker) =>
          migration.name.slice(0, 4) <= manifest.workers[worker].minMigration,
      ),
    );
    if (
      !required.length ||
      new Set(
        releaseOrder.map(
          (worker) => configurations[worker].d1_databases[0].database_id,
        ),
      ).size !== 1
    )
      fail('SCHEMA_NOT_READY', {
        ...context,
        phase: 'preflight',
        operation: 'database.schema',
      });
    const db = configurations.operations.d1_databases[0].database_id;
    const schema = await client.request(`/d1/database/${db}/query`, {
      phase: 'preflight',
      operation: 'database.schema',
      body: {
        sql: `SELECT name FROM d1_migrations WHERE name IN (${required.map(() => '?').join(',')})`,
        params: required.map((migration) => migration.name),
      },
    });
    const applied = new Set(schema?.[0]?.results?.map((row) => row.name));
    if (
      schema?.[0]?.success !== true ||
      required.some((migration) => !applied.has(migration.name))
    )
      fail('SCHEMA_NOT_READY', {
        ...context,
        phase: 'preflight',
        operation: 'database.schema',
      });
    for (const worker of releaseOrder) {
      // Detect administrative drift before each mutation, not just at startup.
      await assertActive(expected);
      const record = {
        worker,
        commitSha: context.commitSha,
        verification: 'pending',
      };
      report.workers.push(record);
      persist(report);
      Object.assign(
        record,
        deploymentOutcome(await publish(worker, context.commitSha)),
      );
      persist(report);
      if (record.status !== 'published')
        fail('WRANGLER_FAILED', {
          ...context,
          worker,
          phase: 'publish',
          operation: 'wrangler.deploy',
        });
      record.verification = 'published_unverified';
      expected[worker] = record.version;
      await postcheck({
        client,
        worker,
        versionId: record.version,
        configuration: configurations[worker],
        context,
      });
      record.verification = 'passed';
      persist(report);
    }
    // All new versions must pass together before the first GitHub write.
    client.invalidate();
    await infrastructureReadiness({
      client,
      configurations,
      context,
      approveMedia: false,
      checkR2: false,
    });
    await assertActive(expected);
    for (const worker of releaseOrder) {
      const id = await github.recordPublished({
        worker,
        versionId: expected[worker],
        commitSha: context.commitSha,
        packageVersion: manifest.workers[worker].packageVersion,
        manifest,
        runId: context.runId,
        releaseOrigin: context.releaseOrigin,
        releaseRunAttempt: context.releaseRunAttempt,
        ciRunId: context.ciRunId,
        ciRunAttempt: context.ciRunAttempt,
        verifyJobId: context.verifyJobId,
        controlSha: context.controlSha,
        firstPublication: {
          requestDigest: digest(requested),
          previousVersionId: requested.workers[worker].versionId,
        },
      });
      report.records.push({ worker, id });
      persist(report);
    }
    report.status = 'success';
  } catch (error) {
    report.status = report.workers.length ? 'recovery_required' : 'failed';
    report.failure = diagnostic(error, context);
  } finally {
    persist(report);
  }
  return report;
}

export async function firstPublicationMain(args = process.argv.slice(2)) {
  const commitSha = args[0] === '--sha' ? args[1] : undefined;
  const checkOnly = args[2] === '--check';
  mkdirSync('.cache/first-publication', { recursive: true });
  const persist = (report) =>
    writeFileSync(
      '.cache/first-publication/result.json',
      JSON.stringify(report, null, 2) + '\n',
    );
  let context = { phase: 'eligibility', operation: 'release', commitSha };
  try {
    if (
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_REF !== `refs/heads/${releaseBranch}` ||
      !/^[0-9a-f]{40}$/.test(commitSha ?? '')
    )
      fail('FIRST_PUBLICATION_NOT_APPROVED', context);
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
    if (head.status !== 0 || head.stdout.trim() !== commitSha)
      fail('SHA_INELIGIBLE', context);
    const github = githubClient({
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
      context,
    });
    context = {
      ...(await github.firstPublicationEligible(commitSha)),
      phase: 'preflight',
      operation: 'release',
    };
    const configurations = Object.fromEntries(
      Object.entries(workerConfigurations).map(([worker, path]) => [
        worker,
        readConfiguration(path),
      ]),
    );
    validateWorkerConfigurations(configurations, true);
    const manifest = readManifest();
    await checkProtection({
      environment: 'production',
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
    });
    if (checkOnly) {
      console.log(
        'First publication request and candidate CI verified; no Workers published.',
      );
      return;
    }
    const client = cloudflareClient({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      context,
    });
    const publish = (worker, sha) =>
      spawnSync(
        process.execPath,
        [
          resolve('node_modules/wrangler/bin/wrangler.js'),
          'deploy',
          '--experimental-provision=false',
          '--experimental-auto-create=false',
          '--env',
          '',
          '--config',
          workerConfigurations[worker],
          '--tag',
          `git-${sha}`,
          '--message',
          `beauty-first-publication ${worker}`,
        ],
        { encoding: 'utf8' },
      );
    const report = await firstPublication({
      context,
      configurations,
      manifest,
      client,
      github,
      publish,
      persist,
    });
    if (report.status !== 'success') {
      console.error(JSON.stringify(report.failure));
      process.exitCode = 1;
    }
  } catch (error) {
    const failure = diagnostic(error, context);
    persist({ status: 'failed', workers: [], failure });
    console.error(JSON.stringify(failure));
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await firstPublicationMain();
