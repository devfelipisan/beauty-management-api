import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { cloudflareClient } from '../deploy/cloudflare-client.mjs';
import { activeVersion, workerPath } from '../deploy/worker-state.mjs';
import { releaseOrder } from '../deploy/config-contract.mjs';
import {
  firstPublicationRequest,
  firstPublicationRequestPath,
} from './first-publication-request.mjs';
import { diagnostic, fail } from '../deploy/errors.mjs';

export async function syncFirstPublicationVersions({
  file = firstPublicationRequestPath,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const context = { phase: 'inventory', operation: 'worker.deployments' };
  const original = readFileSync(file, 'utf8');
  const request = JSON.parse(original);
  const client = cloudflareClient({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
    context,
    fetchImpl: (url, options = {}) => {
      if ((options.method ?? 'GET') !== 'GET') fail('INVALID_REQUEST', context);
      return fetchImpl(url, options);
    },
  });
  const workers = { ...request.workers };
  for (const worker of releaseOrder) {
    const remote = await client.request(`${workerPath(worker)}/deployments`, {
      ...context,
      worker,
    });
    const active = activeVersion(remote, { ...context, worker });
    const previous = request.workers?.[worker]?.versionId;
    if (previous !== undefined && previous !== active.versionId)
      fail('PUBLISHED_VERSION_MISMATCH', { ...context, worker });
    workers[worker] = {
      ...request.workers?.[worker],
      versionId: active.versionId,
    };
  }
  const updated = firstPublicationRequest(
    { ...request, workers },
    request.commitSha,
  );
  const text = await format(JSON.stringify(updated), {
    ...(await resolveConfig(file)),
    filepath: file,
  });
  // Network requests must not overwrite a concurrent local edit.
  if (readFileSync(file, 'utf8') !== original)
    fail('INVALID_REQUEST', { ...context, operation: 'configuration' });
  if (text !== original) writeFileSync(file, text);
  return {
    status: 'FIRST_PUBLICATION_REQUEST_VALID',
    workers: updated.workers,
    cloudflareCalls: client.metrics.calls,
  };
}

export async function syncFirstPublicationMain() {
  try {
    console.log(JSON.stringify(await syncFirstPublicationVersions(), null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        diagnostic(error, { phase: 'inventory', operation: 'configuration' }),
      ),
    );
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await syncFirstPublicationMain();
