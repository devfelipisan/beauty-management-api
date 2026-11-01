import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloudflareClient } from '../deploy/cloudflare-client.mjs';
import { githubClient } from '../deploy/github-client.mjs';
import { publishedWorker } from '../deploy/worker-state.mjs';
import { releaseOrder } from '../deploy/config-contract.mjs';
import { diagnostic, fail } from '../deploy/errors.mjs';

const context = { phase: 'preflight', operation: 'release' };
const repository = 'devfelipisan/beauty-management-api';
const present = (value) => typeof value === 'string' && value.trim().length > 0;
const uuid = (value) =>
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value ?? '');

export function validateLocalEnvironment(env = process.env) {
  const checks = Object.fromEntries(
    ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'GITHUB_TOKEN'].map(
      (name) => [
        name,
        {
          visibleToNode: env[name] !== undefined,
          present: present(env[name]),
          ...(name === 'CLOUDFLARE_ACCOUNT_ID'
            ? { validFormat: /^[0-9a-f]{32}$/i.test(env[name] ?? '') }
            : {}),
        },
      ],
    ),
  );
  return {
    valid: Object.values(checks).every((check) =>
      Object.values(check).every(Boolean),
    ),
    checks,
  };
}

export async function diagnoseProvenance({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const environment = validateLocalEnvironment(env);
  const report = {
    status: 'running',
    environment: environment.checks,
    workers: [],
    totalWorkers: releaseOrder.length,
    failures: 0,
  };
  if (!environment.valid)
    return { ...report, status: 'LOCAL_CONFIGURATION_INVALID' };
  // Enforce read-only at the transport boundary, including future client changes.
  const readonlyFetch = (url, options = {}) => {
    if ((options.method ?? 'GET') !== 'GET') fail('INVALID_REQUEST', context);
    return fetchImpl(url, options);
  };
  const cloudflare = cloudflareClient({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
    fetchImpl: readonlyFetch,
    context,
  });
  const github = githubClient({
    repository,
    token: env.GITHUB_TOKEN,
    fetchImpl: readonlyFetch,
    context,
  });
  for (const worker of releaseOrder) {
    const result = {
      worker,
      cloudflare: 'not_verified',
      provenance: 'not_verified',
    };
    report.workers.push(result);
    try {
      const active = await publishedWorker(cloudflare, worker, {
        context,
        phase: 'preflight',
      });
      result.cloudflare = 'connected';
      result.versionId = active.versionId;
      // Do not print arbitrary remote strings as deployment metadata.
      if (uuid(active.deploymentId)) result.deploymentId = active.deploymentId;
      const proof = await github.provenanceByVersion(worker, active.versionId);
      if (!/^[0-9a-f]{40}$/.test(proof.commitSha ?? ''))
        fail('REMOTE_RESPONSE_INVALID', { ...context, worker });
      result.provenance = 'verified';
      result.commitSha = proof.commitSha;
    } catch (error) {
      report.failures++;
      result.failure = diagnostic(error, { ...context, worker });
    }
  }
  report.status = report.failures
    ? 'PROVENANCE_CHECK_FAILED'
    : 'PROVENANCE_CHECK_PASSED';
  return report;
}

export async function localProvenanceMain() {
  try {
    const report = await diagnoseProvenance();
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'PROVENANCE_CHECK_PASSED') process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify(diagnostic(error, context)));
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await localProvenanceMain();
