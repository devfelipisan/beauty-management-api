import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  releaseBranch,
  workerConfigurations,
} from '../deploy/config-contract.mjs';
import {
  readConfiguration,
  validateWorkerConfigurations,
} from '../deploy/validate-local.mjs';
import { readManifest } from '../deploy/manifest.mjs';
import { githubClient } from '../deploy/github-client.mjs';
import { cloudflareClient } from '../deploy/cloudflare-client.mjs';
import { firstPublicationRequest } from './first-publication-request.mjs';
import { fail, diagnostic } from '../deploy/errors.mjs';
import { checkProtection } from '../check-production-protection.mjs';

import { coordinatedPublication } from './coordinated-publication.mjs';
export const firstPublication = (options) =>
  coordinatedPublication({
    ...options,
    policy: {
      origin: 'first-publication',
      errorCode: 'FIRST_PUBLICATION_NOT_APPROVED',
      request: firstPublicationRequest,
      proofKey: 'firstPublication',
      qualify: ({ github, expected }) =>
        github.assertFirstPublicationNeeded(expected),
    },
  });

export async function firstPublicationMain(args = process.argv.slice(2)) {
  const commitSha = args[0] === '--sha' ? args[1] : undefined;
  const checkOnly = args[2] === '--check';
  mkdirSync('.cache/first-publication', { recursive: true });
  const persist = (report) =>
    writeFileSync(
      '.cache/first-publication/result.json',
      JSON.stringify(report, null, 2) + '\n',
    );
  let context = { phase: 'eligibility', operation: 'release', commitSha };
  try {
    if (
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_REF !== `refs/heads/${releaseBranch}` ||
      !/^[0-9a-f]{40}$/.test(commitSha ?? '')
    )
      fail('FIRST_PUBLICATION_NOT_APPROVED', context);
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
    if (head.status !== 0 || head.stdout.trim() !== commitSha)
      fail('SHA_INELIGIBLE', context);
    const github = githubClient({
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
      context,
    });
    context = {
      ...(await github.firstPublicationEligible(commitSha)),
      phase: 'preflight',
      operation: 'release',
    };
    const configurations = Object.fromEntries(
      Object.entries(workerConfigurations).map(([worker, path]) => [
        worker,
        readConfiguration(path),
      ]),
    );
    validateWorkerConfigurations(configurations, true);
    const manifest = readManifest();
    await checkProtection({
      environment: 'production',
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
    });
    if (checkOnly) {
      console.log(
        'First publication request and candidate CI verified; no Workers published.',
      );
      return;
    }
    const client = cloudflareClient({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      context,
    });
    const publish = (worker, sha) =>
      spawnSync(
        process.execPath,
        [
          resolve('node_modules/wrangler/bin/wrangler.js'),
          'deploy',
          '--experimental-provision=false',
          '--experimental-auto-create=false',
          '--env',
          '',
          '--config',
          workerConfigurations[worker],
          '--tag',
          `git-${sha}`,
          '--message',
          `beauty-first-publication ${worker}`,
        ],
        { encoding: 'utf8' },
      );
    const report = await firstPublication({
      context,
      configurations,
      manifest,
      client,
      github,
      publish,
      persist,
    });
    if (report.status !== 'success') {
      console.error(JSON.stringify(report.failure));
      process.exitCode = 1;
    }
  } catch (error) {
    const failure = diagnostic(error, context);
    persist({ status: 'failed', workers: [], failure });
    console.error(JSON.stringify(failure));
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await firstPublicationMain();
