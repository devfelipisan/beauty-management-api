import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  workerConfigurations,
  releaseBranch,
} from '../deploy/config-contract.mjs';
import {
  readConfiguration,
  validateWorkerConfigurations,
} from '../deploy/validate-local.mjs';
import { readManifest } from '../deploy/manifest.mjs';
import { cloudflareClient } from '../deploy/cloudflare-client.mjs';
import { workerPath, analyzeSettings } from '../deploy/worker-state.mjs';
import { diagnostic, fail } from '../deploy/errors.mjs';

const sha = (value) =>
  typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const uuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const positive = (value) =>
  /^\d+$/.test(String(value)) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) > 0;
export function inventoryClient(options = {}) {
  const paths = new Map(
    Object.keys(workerConfigurations).flatMap((worker) =>
      ['settings', 'deployments'].map((kind) => [
        `${workerPath(worker)}/${kind}`,
        { worker, operation: `worker.${kind}`, phase: 'inventory' },
      ]),
    ),
  );
  const client = cloudflareClient({
    ...options,
    context: { ...options.context, phase: 'inventory' },
  });
  return {
    metrics: client.metrics,
    request(path, requestOptions = {}) {
      if (
        !paths.has(path) ||
        !requestOptions ||
        typeof requestOptions !== 'object' ||
        Array.isArray(requestOptions) ||
        Object.keys(requestOptions).some((key) => key !== 'method') ||
        (requestOptions.method !== undefined && requestOptions.method !== 'GET')
      )
        fail('INVALID_REQUEST', { phase: 'inventory' });
      return client.request(path, paths.get(path));
    },
  };
}
export function observeServiceVersion(settings) {
  const matches = Array.isArray(settings?.bindings)
    ? settings.bindings.filter((binding) => binding?.name === 'SERVICE_VERSION')
    : [];
  if (!matches.length) return { status: 'absent', provenance: 'not_verified' };
  if (matches.length !== 1)
    return { status: 'invalid', provenance: 'not_verified' };
  const value = matches[0];
  if (value.type !== 'plain_text')
    return { status: 'invalid_type', provenance: 'not_verified' };
  if (value.text === '') return { status: 'empty', provenance: 'not_verified' };
  return sha(value.text)
    ? {
        status: 'valid_format',
        declaredCommitSha: value.text,
        provenance: 'not_verified',
      }
    : { status: 'invalid', provenance: 'not_verified' };
}
export function observeDeployments(value, scope = {}) {
  if (!Array.isArray(value?.deployments))
    fail('REMOTE_RESPONSE_INVALID', scope);
  if (!value.deployments.length)
    return { deploymentState: 'empty', versions: [] };
  const current = value.deployments[0];
  if (!current || !Array.isArray(current.versions) || !current.versions.length)
    fail('REMOTE_RESPONSE_INVALID', scope);
  const versions = current.versions.map((version) => {
    if (
      !uuid(version?.version_id) ||
      typeof version.percentage !== 'number' ||
      !Number.isFinite(version.percentage) ||
      version.percentage < 0.01 ||
      version.percentage > 100
    )
      fail('REMOTE_RESPONSE_INVALID', scope);
    return { versionId: version.version_id, percentage: version.percentage };
  });
  if (
    new Set(versions.map((version) => version.versionId)).size !==
    versions.length
  )
    fail('REMOTE_RESPONSE_INVALID', scope);
  const total = versions.reduce((sum, version) => sum + version.percentage, 0);
  return {
    deploymentState:
      total !== 100
        ? 'ambiguous'
        : versions.length === 1
          ? 'single'
          : 'multiple',
    versions,
  };
}
function reportHeader(context = {}) {
  return {
    formatVersion: 1,
    mode: 'inventory',
    ...(sha(context.commitSha) ? { controlSha: context.commitSha } : {}),
    ...(positive(context.runId) ? { executionId: String(context.runId) } : {}),
    ...(positive(context.runAttempt)
      ? { attempt: Number(context.runAttempt) }
      : {}),
    collectedAt: new Date().toISOString(),
    snapshotConsistency: 'not_atomic',
    notVerified: [
      'provenance',
      'schema',
      'd1_availability',
      'r2_availability',
      'capacity',
      'rpc_authority',
      'secret_values',
    ],
    workers: [],
  };
}
export async function collectInventory({
  client,
  configurations,
  context = {},
  bindingTransitions = {},
}) {
  const started = performance.now();
  const report = reportHeader(context);
  async function observe(worker, kind) {
    const scope = {
      ...context,
      phase: 'inventory',
      worker,
      operation: `worker.${kind}`,
    };
    try {
      const value = await client.request(`${workerPath(worker)}/${kind}`);
      if (kind === 'deployments') {
        const observed = observeDeployments(value, scope),
          ambiguous = observed.deploymentState === 'ambiguous';
        return {
          collectionStatus: ambiguous ? 'failed' : 'complete',
          ...observed,
          ...(ambiguous ? { findings: [diagnostic(new Error(), scope)] } : {}),
        };
      }
      const analysis = analyzeSettings(value, worker, configurations[worker], {
        phase: 'inventory',
        context,
        transitions: bindingTransitions[worker] ?? [],
      });
      const invalid = analysis.findings.some(
        (finding) => finding.code === 'REMOTE_RESPONSE_INVALID',
      );
      return {
        collectionStatus: invalid ? 'failed' : 'complete',
        ...analysis,
        serviceVersion: observeServiceVersion(value),
      };
    } catch (error) {
      const finding = diagnostic(error, scope);
      return {
        collectionStatus:
          finding.code === 'REMOTE_RESOURCE_UNAVAILABLE'
            ? 'complete'
            : 'failed',
        findings: [finding],
      };
    }
  }
  report.workers = await Promise.all(
    Object.keys(workerConfigurations).map(async (worker) => {
      const [settings, deployments] = await Promise.all([
        observe(worker, 'settings'),
        observe(worker, 'deployments'),
      ]);
      const successes = [settings, deployments].filter(
        (value) => value.collectionStatus === 'complete',
      ).length;
      return {
        worker,
        collectionStatus:
          successes === 2 ? 'complete' : successes === 1 ? 'partial' : 'failed',
        settings,
        deployments,
      };
    }),
  );
  const results = report.workers.flatMap((worker) => [
    worker.settings,
    worker.deployments,
  ]);
  const successes = results.filter(
    (value) => value.collectionStatus === 'complete',
  ).length;
  report.collectionStatus =
    successes === results.length
      ? 'complete'
      : successes
        ? 'partial'
        : 'failed';
  report.metrics = {
    cloudflare: structuredClone(client.metrics),
    durationMs: performance.now() - started,
  };
  return report;
}
export function serializeInventory(report) {
  return JSON.stringify(report, null, 2) + '\n';
}
export async function inventoryMain() {
  const directory = '.cache/infrastructure-inventory';
  mkdirSync(directory, { recursive: true });
  const context = {
    phase: 'inventory',
    commitSha: process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  };
  let report = reportHeader(context);
  try {
    if (
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_REF !== `refs/heads/${releaseBranch}` ||
      !sha(context.commitSha) ||
      !positive(context.runId) ||
      !positive(context.runAttempt)
    )
      fail('INVALID_REQUEST', context);
    const localSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    if (localSha !== context.commitSha) fail('SHA_INELIGIBLE', context);
    const configurations = Object.fromEntries(
      Object.entries(workerConfigurations).map(([worker, path]) => [
        worker,
        readConfiguration(path),
      ]),
    );
    validateWorkerConfigurations(configurations, true);
    const manifest = readManifest();
    const client = inventoryClient({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      context,
    });
    report = await collectInventory({
      client,
      configurations,
      context,
      bindingTransitions: Object.fromEntries(
        Object.entries(manifest.workers).map(([worker, value]) => [
          worker,
          value.transitions,
        ]),
      ),
    });
  } catch (error) {
    report = {
      ...report,
      collectionStatus: 'failed',
      findings: [diagnostic(error, context)],
      metrics: {
        cloudflare: { calls: 0, operations: {}, phases: {}, durationMs: 0 },
      },
    };
  }
  const output = serializeInventory(report);
  writeFileSync(`${directory}/result.json`, output);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Infrastructure inventory\n\nThis report does not authorize a release.\n\n\`\`\`json\n${output}\`\`\`\n`,
    );
  console.log(output.trimEnd());
  if (report.collectionStatus !== 'complete') process.exitCode = 1;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await inventoryMain();
