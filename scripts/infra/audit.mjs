import ts from 'typescript';
import { workerConfigurations } from '../deploy/config-contract.mjs';
import { publishedWorker, validateSettings } from '../deploy/worker-state.mjs';
import { digest } from '../deploy/manifest.mjs';
import { fail } from '../deploy/errors.mjs';
import { infrastructureReadiness } from './readiness.mjs';
export async function auditInfrastructure({ client, github, context = {} }) {
  const configurations = {},
    runtimeText = {},
    bindingTransitions = {},
    published = [];
  for (const name of Object.keys(workerConfigurations)) {
    const state = await publishedWorker(client, name, {
      context,
      phase: 'audit',
    });
    const manifest = await github.provenance(
      name,
      state.commitSha,
      state.versionId,
    );
    const path = workerConfigurations[name],
      text = await github.file(path, state.commitSha);
    const parsed = ts.parseConfigFileTextToJson(path, text);
    if (parsed.error)
      fail('MANIFEST_INVALID', {
        ...context,
        phase: 'audit',
        operation: 'github.manifest',
        worker: name,
      });
    const config = parsed.config;
    const hash = digest({
      name: config.name,
      main: config.main,
      d1: config.d1_databases,
      services: config.services,
      r2: config.r2_buckets ?? [],
      crons: config.triggers?.crons ?? [],
      workers_dev: config.workers_dev,
      preview_urls: config.preview_urls,
    });
    if (hash !== manifest.configurationHash)
      fail('MANIFEST_INVALID', {
        ...context,
        phase: 'audit',
        operation: 'github.manifest',
        worker: name,
      });
    configurations[name] = config;
    if (
      !manifest.productionText ||
      typeof manifest.productionText !== 'object' ||
      Array.isArray(manifest.productionText)
    )
      fail('MANIFEST_INVALID', {
        ...context,
        phase: 'audit',
        worker: name,
        operation: 'github.manifest',
      });
    runtimeText[name] = manifest.productionText;
    bindingTransitions[name] = manifest.transitions ?? [];
    validateSettings(state.settings, name, config, {
      phase: 'audit',
      context,
      expectedText: runtimeText[name],
      transitions: bindingTransitions[name],
    });
    published.push({
      worker: name,
      commitSha: state.commitSha,
      versionId: state.versionId,
    });
  }
  // Cached reads avoid re-inspecting settings/deployments while sharing the same
  // resource checks as readiness. No mutation, R2 list or runtime dispatch occurs.
  await infrastructureReadiness({
    client,
    configurations,
    context,
    phase: 'audit',
    runtimeText,
    bindingTransitions,
  });
  return { published };
}
