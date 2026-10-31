import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  deploymentRequest,
  readConfiguration,
  selectedWorkers,
  validateWorkerConfigurations,
  workerConfigurations,
} from './worker-deployment-config.mjs';

export const requiredBindingsFailure =
  'Required production bindings unavailable; deployment blocked.';

/** Read-only metadata endpoint: secret values are never requested or returned. */
export async function requireRemoteSecrets(
  configurations,
  target,
  { accountId, apiToken, fetchImpl = globalThis.fetch } = {},
) {
  try {
    validateWorkerConfigurations(configurations, true);
    if (
      typeof accountId !== 'string' ||
      !accountId.trim() ||
      typeof apiToken !== 'string' ||
      !apiToken.trim()
    )
      throw new Error();
    // Check every selected destination before publishing the first one.
    for (const name of selectedWorkers(target)) {
      const config = configurations[name];
      const response = await fetchImpl(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(config.name)}/secrets`,
        {
          method: 'GET',
          redirect: 'error',
          headers: { authorization: `Bearer ${apiToken}` },
        },
      );
      if (!response.ok) throw new Error();
      const metadata = await response.json();
      if (metadata?.success !== true || !Array.isArray(metadata.result))
        throw new Error();
      const names = new Set(
        metadata.result
          .filter(
            (binding) =>
              binding &&
              binding.type === 'secret_text' &&
              typeof binding.name === 'string',
          )
          .map((binding) => binding.name),
      );
      if (config.secrets.required.some((secret) => !names.has(secret)))
        throw new Error();
    }
  } catch {
    // Do not attach the upstream body, exception or credentials as an error cause.
    throw new Error(requiredBindingsFailure);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const request = deploymentRequest(
      JSON.parse(readFileSync('.github/deploy/request.json', 'utf8')),
    );
    if (request.mode !== 'deploy') throw new Error();
    const configs = Object.fromEntries(
      Object.entries(workerConfigurations).map(([name, path]) => [
        name,
        readConfiguration(path),
      ]),
    );
    await requireRemoteSecrets(configs, request.worker, {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
    });
    console.log(
      'Required production bindings verified for the selected Workers.',
    );
  } catch {
    console.error(requiredBindingsFailure);
    process.exitCode = 1;
  }
}
