import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { cloudflareClient } from '../deploy/cloudflare-client.mjs';
import { workerConfigurations } from '../deploy/config-contract.mjs';
import { diagnostic, fail } from '../deploy/errors.mjs';
import { githubClient } from '../deploy/github-client.mjs';
import { checkWorkerControls } from '../deploy/postcheck.mjs';
import { preflight } from '../deploy/preflight.mjs';
import { publishedWorker, workerPath } from '../deploy/worker-state.mjs';

const worker = 'operations';
const path = workerPath(worker);
const context = { worker, phase: 'preflight', operation: 'worker.deployments' };
const previous = 'b1a2bc02-eb8f-40d8-a1af-ecdc92046b57';
const previousDeployment = '06447e36-33bb-4b9e-8a94-d6b1e5aabf87';
const target = '08d84654-2c06-43b1-99db-f9ac2e123b5c';
const commitSha = '80e8ad53734af43dba508d2db1942cc10c2e37d8';
const peers = {
  billing: 'eb1a856d-c2db-4ef4-af51-3303c2ebebea',
  clinical: 'ae3ee167-ecb8-4c03-a014-f63b89d36611',
};

export async function recoverOperations({ client, github, deploy }) {
  const inspect = async () => {
    client.invalidate();
    const operations = await publishedWorker(client, worker, { context });
    if (
      operations.versionId !== target &&
      (operations.versionId !== previous ||
        operations.deploymentId !== previousDeployment)
    )
      fail('PUBLISHED_VERSION_MISMATCH', context);
    for (const [name, versionId] of Object.entries(peers)) {
      if (
        (await publishedWorker(client, name, { context })).versionId !==
        versionId
      )
        fail('PUBLISHED_VERSION_MISMATCH', { ...context, worker: name });
    }
    return operations;
  };

  const current = await inspect();
  const proof = await github.provenanceByVersion(worker, target);
  if (proof.commitSha !== commitSha) fail('INVALID_REQUEST', context);
  const configurations = Object.fromEntries(
    await Promise.all(
      Object.entries(workerConfigurations).map(async ([name, file]) => {
        const parsed = ts.parseConfigFileTextToJson(
          file,
          await github.file(file, commitSha),
        );
        if (parsed.error) fail('INVALID_VERSIONED_CONFIGURATION', context);
        return [name, parsed.config];
      }),
    ),
  );
  const verify = async (reader) => {
    await preflight({
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
  };

  if (current.versionId === target) {
    await verify(client);
    return { status: 'already_restored', versionId: target, commitSha };
  }

  const version = await client.request(`${path}/versions/${target}`, context);
  if (version?.id !== target || !Array.isArray(version.resources?.bindings))
    fail('REMOTE_RESPONSE_INVALID', context);

  // Evaluate the proposed deployment against the real peers, schedules and D1.
  await verify({
    request(resource, options) {
      if (resource === `${path}/settings`)
        return { ...current.settings, bindings: version.resources.bindings };
      if (resource === `${path}/deployments`)
        return {
          deployments: [
            { versions: [{ version_id: target, percentage: 100 }] },
          ],
        };
      return client.request(resource, options);
    },
  });

  if (!deploy)
    return { status: 'ready', previous, versionId: target, commitSha };
  const fresh = await inspect();
  if (fresh.versionId === target) {
    await verify(client);
    return { status: 'already_restored', versionId: target, commitSha };
  }
  await deploy();
  const restored = await inspect();
  if (restored.versionId !== target)
    fail('PUBLISHED_VERSION_MISMATCH', context);
  await verify(client);
  return { status: 'restored', versionId: target, commitSha };
}

async function main(args) {
  const apply =
    args[0] === '--apply' &&
    args[1] === previousDeployment &&
    args.length === 2;
  if (args.length && !apply) fail('INVALID_REQUEST', context);
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const client = cloudflareClient({ accountId, apiToken, context });
  const github = githubClient({
    repository: 'devfelipisan/beauty-management-api',
    token: process.env.GITHUB_TOKEN,
    context,
  });
  const deploy = async () => {
    let response;
    try {
      response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}${path}/deployments`,
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
              'workers/message':
                'Restore verified Operations version after run 45922893262',
            },
          }),
        },
      );
    } catch {
      fail('REMOTE_TRANSPORT_ERROR', context);
    }
    if (!response.ok)
      fail('REMOTE_HTTP_ERROR', { ...context, status: response.status });
    const result = await response.json().catch(() => null);
    if (result?.success !== true) fail('REMOTE_RESPONSE_INVALID', context);
  };
  console.log(
    JSON.stringify(
      await recoverOperations({
        client,
        github,
        deploy: apply ? deploy : undefined,
      }),
    ),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(JSON.stringify(diagnostic(error, context)));
    process.exitCode = 1;
  }
}
