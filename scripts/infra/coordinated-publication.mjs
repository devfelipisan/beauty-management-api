import { releaseOrder } from '../deploy/config-contract.mjs';
import { validateWorkerConfigurations } from '../deploy/validate-local.mjs';
import { digest, simulateRelease } from '../deploy/manifest.mjs';
import { publishedWorker } from '../deploy/worker-state.mjs';
import { postcheck } from '../deploy/postcheck.mjs';
import { infrastructureReadiness } from './readiness.mjs';

import { deploymentOutcome } from '../worker-deployment-output.mjs';
import { fail, diagnostic } from '../deploy/errors.mjs';

export async function coordinatedPublication({
  policy,
  context,
  configurations,
  manifest,
  client,
  github,
  publish,
  persist = () => {},
}) {
  const report = {
    action: policy.origin,
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
      policy.validateState?.(worker, state, context);
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
    if (context.releaseOrigin !== policy.origin)
      fail(policy.errorCode, context);
    const requested = policy.request(context.requested, context.commitSha);
    validateWorkerConfigurations(configurations, true);
    // The final set must be internally compatible. Mixed intermediate sets are
    // permitted only by the dedicated maintenance policy and production approval.
    simulateRelease(manifest.workers, manifest, []);
    for (const worker of releaseOrder) {
      const actual = await publishedWorker(client, worker, {
        context,
        phase: 'readiness',
      });
      policy.validateState?.(worker, actual, context);
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
        provenance:
          policy.origin === 'first-publication' ? 'unverified' : 'pending',
      };
      expected[worker] = actual.versionId;
    }
    persist(report);
    // Each wrapper owns its distinct prior-state policy. Neither accepts remote
    // access/transport failures as authorization for an exceptional publication.
    await policy.qualify({ github, expected, requested, manifest, report });
    persist(report);
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
        [policy.proofKey]: {
          requestDigest: digest(requested),
          previousVersionId: requested.workers[worker].versionId,
          ...(policy.origin === 'coordinated-upgrade'
            ? { previousCommitSha: requested.workers[worker].commitSha }
            : {}),
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
