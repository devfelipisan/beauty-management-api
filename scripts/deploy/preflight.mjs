import { selectedWorkers, workerConfigurations } from './config-contract.mjs';
import { validateWorkerConfigurations } from './validate-local.mjs';
import { simulateRelease } from './manifest.mjs';
import {
  publishedWorker,
  validateSettings,
  validateRuntimeText,
  workerPath,
} from './worker-state.mjs';
import { checkWorkerSchedule } from './postcheck.mjs';
import { fail } from './errors.mjs';
export async function preflight({
  client,
  github,
  configurations,
  manifest,
  context,
}) {
  try {
    validateWorkerConfigurations(configurations, true);
  } catch {
    fail('INVALID_VERSIONED_CONFIGURATION', {
      ...context,
      phase: 'preflight',
      operation: 'configuration',
    });
  }
  const workers = selectedWorkers(context.worker),
    topology = {},
    published = {};
  // Receivers require valid runtime Text and version/provenance. Their storage
  // readiness and the candidate's unselected structural configuration are separate.
  const needed = new Set(workers);
  for (const name of workers)
    for (const dependency of Object.keys(manifest.workers[name].requires))
      needed.add(dependency);
  for (const name of needed) {
    const settings = await client.request(`${workerPath(name)}/settings`, {
      operation: 'worker.settings',
      worker: name,
      phase: 'preflight',
    });
    if (workers.includes(name))
      validateSettings(settings, name, configurations[name], {
        context,
        transitions: manifest.workers[name].transitions,
      });
    else
      validateRuntimeText(settings, name, { ...context, phase: 'preflight' });
    if (name === 'operations' && workers.includes(name))
      await checkWorkerSchedule(
        client,
        name,
        configurations[name],
        context,
        'preflight',
        settings,
      );
    const state = await publishedWorker(client, name, { settings, context });
    const provenance = await github.provenanceByVersion(name, state.versionId);
    published[name] = {
      commitSha: provenance.commitSha,
      versionId: state.versionId,
      deploymentId: state.deploymentId,
    };
    topology[name] = provenance.workerManifest;
    published[name].provenance = provenance.evidence;
    for (const dependency of Object.keys(topology[name].requires ?? {})) {
      if (!Object.hasOwn(workerConfigurations, dependency))
        fail('MANIFEST_INVALID', {
          ...context,
          phase: 'preflight',
          operation: 'github.manifest',
        });
      needed.add(dependency);
    }
  }
  simulateRelease(topology, manifest, workers);
  const required = manifest.migrations.filter((m) =>
    workers.some(
      (name) => m.name.slice(0, 4) <= manifest.workers[name].minMigration,
    ),
  );
  if (!required.length)
    fail('MANIFEST_INVALID', {
      ...context,
      phase: 'preflight',
      operation: 'database.schema',
    });
  const id = configurations[workers[0]].d1_databases[0].database_id;
  const result = await client.request(`/d1/database/${id}/query`, {
    operation: 'database.schema',
    phase: 'preflight',
    body: {
      sql: `SELECT name FROM d1_migrations WHERE name IN (${required.map(() => '?').join(',')})`,
      params: required.map((m) => m.name),
    },
  });
  const applied = new Set(result?.[0]?.results?.map((row) => row.name));
  if (
    result?.[0]?.success !== true ||
    required.some((m) => !applied.has(m.name))
  )
    fail('SCHEMA_NOT_READY', {
      ...context,
      phase: 'preflight',
      operation: 'database.schema',
    });
  return { valid: true, validatedWorkers: workers, published };
}
