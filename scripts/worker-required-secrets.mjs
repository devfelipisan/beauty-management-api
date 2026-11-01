import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloudflareClient } from './deploy/cloudflare-client.mjs';
import { githubClient } from './deploy/github-client.mjs';
import { readManifest } from './deploy/manifest.mjs';
import { preflight } from './deploy/preflight.mjs';
import { postcheck } from './deploy/postcheck.mjs';
import {
  selectedWorkers,
  workerConfigurations,
} from './deploy/config-contract.mjs';
import {
  deploymentRequest,
  readConfiguration,
} from './deploy/validate-local.mjs';
import { diagnostic } from './deploy/errors.mjs';
export {
  DeploymentValidationError,
  requiredBindingsFailure,
} from './deploy/errors.mjs';
// Compatibility entrypoint: normal release orchestration does not invoke this CLI.
export async function requireRemoteSecrets(
  configurations,
  target,
  options = {},
) {
  const context = options.context ?? {
    worker: target,
    commitSha: options.publishedSha,
    phase: options.publishedSha ? 'postcheck' : 'preflight',
  };
  const client = options.client ?? cloudflareClient({ ...options, context });
  if (options.publishedSha) {
    const workers = selectedWorkers(target);
    if (workers.length !== 1) throw new Error('Use directed postcheck');
    return postcheck({
      client,
      worker: workers[0],
      commitSha: options.publishedSha,
      versionId: options.versionId,
      configuration: configurations[workers[0]],
      context,
    });
  }
  return preflight({
    client,
    github:
      options.github ??
      githubClient({
        repository: process.env.GITHUB_REPOSITORY,
        token: process.env.GITHUB_TOKEN,
        context,
      }),
    configurations,
    manifest: options.manifest ?? readManifest(),
    context: { ...context, worker: target },
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const request = deploymentRequest(
      JSON.parse(readFileSync('.github/deploy/request.json', 'utf8')),
    );
    await requireRemoteSecrets(
      Object.fromEntries(
        Object.entries(workerConfigurations).map(([name, path]) => [
          name,
          readConfiguration(path),
        ]),
      ),
      request.worker,
      {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: process.env.CLOUDFLARE_API_TOKEN,
      },
    );
  } catch (error) {
    console.error(JSON.stringify(diagnostic(error, { phase: 'preflight' })));
    process.exitCode = 1;
  }
}
