import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';
import { cloudflareClient } from '../deploy/cloudflare-client.mjs';
import {
  releaseBranch,
  releaseOrder,
  workerConfigurations,
} from '../deploy/config-contract.mjs';
import { diagnostic, fail } from '../deploy/errors.mjs';
import { githubClient } from '../deploy/github-client.mjs';
import { checkWorkerControls } from '../deploy/postcheck.mjs';
import { preflight } from '../deploy/preflight.mjs';
import { publishedWorker, workerPath } from '../deploy/worker-state.mjs';

const context = { phase: 'preflight', operation: 'worker.deployments' };
const uuid = (id) =>
  typeof id === 'string' &&
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
const missingProof = (error) =>
  error.code === 'PROVENANCE_UNAVAILABLE' &&
  error.provenanceReason === 'NO_ACCEPTED_RECORD' &&
  error.hasVersionRecord === false;

async function snapshot(client) {
  client.invalidate();
  const entries = await Promise.all(
    releaseOrder.map(async (worker) => {
      const { versionId, deploymentId } = await publishedWorker(
        client,
        worker,
        { context },
      );
      if (!uuid(deploymentId))
        fail('REMOTE_RESPONSE_INVALID', { ...context, worker });
      return [worker, { versionId, deploymentId }];
    }),
  );
  return Object.fromEntries(entries);
}

async function verify({ client, github, worker, target, project }) {
  const proof = await github.provenanceByVersion(worker, target);
  const configurations = Object.fromEntries(
    await Promise.all(
      Object.entries(workerConfigurations).map(async ([name, file]) => {
        const parsed = ts.parseConfigFileTextToJson(
          file,
          await github.file(file, proof.commitSha),
        );
        if (parsed.error) fail('INVALID_VERSIONED_CONFIGURATION', context);
        return [name, parsed.config];
      }),
    ),
  );
  let reader = client;
  if (project) {
    const path = workerPath(worker);
    const version = await client.request(`${path}/versions/${target}`, {
      ...context,
      worker,
    });
    if (version?.id !== target || !Array.isArray(version.resources?.bindings))
      fail('REMOTE_RESPONSE_INVALID', { ...context, worker });
    const settings = await client.request(`${path}/settings`, {
      ...context,
      worker,
      operation: 'worker.settings',
    });
    reader = {
      request(resource, options) {
        if (resource === `${path}/settings`)
          return { ...settings, bindings: version.resources.bindings };
        if (resource === `${path}/deployments`)
          return {
            deployments: [
              { versions: [{ version_id: target, percentage: 100 }] },
            ],
          };
        return client.request(resource, options);
      },
    };
  }
  const report = await preflight({
    client: reader,
    github,
    configurations,
    manifest: proof.manifest,
    context: { ...context, worker: 'all' },
  });
  await checkWorkerControls(
    reader,
    worker,
    configurations[worker],
    context,
    'preflight',
  );
  return { commitSha: proof.commitSha, published: report.published };
}

export async function prepareRecovery({ client, github, failure }) {
  const worker = failure?.worker;
  if (
    !releaseOrder.includes(worker) ||
    !missingProof(failure) ||
    failure.phase !== 'provenance' ||
    failure.operation !== 'github.deployment'
  )
    return { status: 'not_applicable' };
  const current = await snapshot(client);
  if (current[worker].versionId !== failure.versionId)
    fail('PUBLISHED_VERSION_MISMATCH', { ...context, worker });

  for (const name of releaseOrder) {
    try {
      await github.provenanceByVersion(name, current[name].versionId);
      if (name === worker) return { status: 'not_applicable' };
    } catch (error) {
      if (name !== worker || !missingProof(error)) throw error;
    }
  }

  const history = await client.request(`${workerPath(worker)}/deployments`, {
    ...context,
    worker,
  });
  if (!Array.isArray(history?.deployments))
    fail('REMOTE_RESPONSE_INVALID', context);
  const rejected = [];
  const checked = new Set([failure.versionId]);
  for (const deployment of history.deployments) {
    const target = deployment?.versions?.[0]?.version_id;
    if (
      deployment?.versions?.length !== 1 ||
      deployment.versions[0].percentage !== 100 ||
      !uuid(target) ||
      checked.has(target)
    )
      continue;
    checked.add(target);
    try {
      const { commitSha } = await verify({
        client,
        github,
        worker,
        target,
        project: true,
      });
      if (!isDeepStrictEqual(await snapshot(client), current))
        fail('PUBLISHED_VERSION_MISMATCH', { ...context, worker });
      return { status: 'ready', worker, target, commitSha, current };
    } catch (error) {
      if (
        error.code === 'PUBLISHED_VERSION_MISMATCH' ||
        !error.code ||
        /^(REMOTE_|CI_)/.test(error.code)
      )
        throw error;
      rejected.push({ versionId: target, failure: diagnostic(error, context) });
    }
  }
  return { status: 'no_candidate', worker, current, rejected };
}

export async function applyRecovery({ client, github, plan, deploy }) {
  const { worker, target, current, commitSha } = plan ?? {};
  if (
    plan?.status !== 'ready' ||
    !releaseOrder.includes(worker) ||
    !uuid(target) ||
    !uuid(current?.[worker]?.versionId) ||
    target === current[worker].versionId
  )
    fail('INVALID_REQUEST', context);
  const checkSnapshot = async () => {
    if (!isDeepStrictEqual(await snapshot(client), current))
      fail('PUBLISHED_VERSION_MISMATCH', { ...context, worker });
  };
  await checkSnapshot();
  try {
    await github.provenanceByVersion(worker, current[worker].versionId);
    fail('INVALID_REQUEST', context);
  } catch (error) {
    if (!missingProof(error)) throw error;
  }
  const verified = await verify({
    client,
    github,
    worker,
    target,
    project: true,
  });
  if (verified.commitSha !== commitSha) fail('INVALID_REQUEST', context);
  await checkSnapshot();
  await deploy(worker, target);
  const restored = await snapshot(client);
  if (
    restored[worker].versionId !== target ||
    releaseOrder.some(
      (name) =>
        name !== worker && !isDeepStrictEqual(restored[name], current[name]),
    )
  )
    fail('PUBLISHED_VERSION_MISMATCH', { ...context, worker });
  const result = await verify({ client, github, worker, target });
  return { status: 'restored', worker, target, published: result.published };
}

async function main() {
  const [mode, file] = process.argv.slice(2);
  const {
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: apiToken,
    GITHUB_REPOSITORY: repository,
    GITHUB_TOKEN: token,
  } = process.env;
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REF !== `refs/heads/${releaseBranch}` ||
    !['plan', 'apply'].includes(mode) ||
    (mode === 'apply' && process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch')
  )
    fail('INVALID_REQUEST', context);
  const client = cloudflareClient({ accountId, apiToken, context });
  const github = githubClient({ repository, token, context });
  const input = JSON.parse(readFileSync(file, 'utf8'));
  const deploy = async (worker, target) => {
    const scope = { ...context, worker };
    let response;
    try {
      response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}${workerPath(worker)}/deployments`,
        {
          method: 'POST',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${apiToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            strategy: 'percentage',
            versions: [{ version_id: target, percentage: 100 }],
            annotations: {
              'workers/message': `Restore verified version in GitHub run ${process.env.GITHUB_RUN_ID}`,
            },
          }),
        },
      );
    } catch {
      fail('REMOTE_TRANSPORT_ERROR', scope);
    }
    if (!response.ok)
      fail('REMOTE_HTTP_ERROR', { ...scope, status: response.status });
    if ((await response.json().catch(() => null))?.success !== true)
      fail('REMOTE_RESPONSE_INVALID', scope);
  };
  return mode === 'plan'
    ? prepareRecovery({ client, github, failure: input.failure })
    : applyRecovery({ client, github, plan: input, deploy });
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await main(), null, 2));
  } catch (error) {
    console.log(
      JSON.stringify(
        { status: 'failed', failure: diagnostic(error, context) },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
