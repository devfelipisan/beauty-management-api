import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  releaseOrder,
  releaseBranch,
  workerConfigurations,
} from '../deploy/config-contract.mjs';
import {
  readConfiguration,
  validateWorkerConfigurations,
} from '../deploy/validate-local.mjs';
import { readManifest, simulateRelease } from '../deploy/manifest.mjs';
import { githubClient } from '../deploy/github-client.mjs';
import { cloudflareClient } from '../deploy/cloudflare-client.mjs';
import { coordinatedUpgradeRequest } from './coordinated-upgrade-request.mjs';
import { fail, diagnostic } from '../deploy/errors.mjs';
import { workerCronPolicy } from '../deploy/cron-policy.mjs';
import { checkProtection } from '../check-production-protection.mjs';

import { coordinatedPublication } from './coordinated-publication.mjs';
export const coordinatedUpgrade = (options) =>
  coordinatedPublication({
    ...options,
    policy: {
      origin: 'coordinated-upgrade',
      errorCode: 'COORDINATED_UPGRADE_NOT_APPROVED',
      request: coordinatedUpgradeRequest,
      proofKey: 'coordinatedUpgrade',
      validateState: (worker, state, context) => {
        if (
          worker === 'operations' &&
          workerCronPolicy(state.settings, context).enabled
        )
          fail('SCHEDULE_MISMATCH', {
            ...context,
            worker,
            phase: 'readiness',
            operation: 'worker.schedules',
          });
      },
      qualify: async ({ github, expected, requested, report }) => {
        const topology = {};
        for (const worker of releaseOrder) {
          const previous = await github.provenanceByVersion(
            worker,
            expected[worker],
          );
          if (previous.commitSha !== requested.workers[worker].commitSha)
            fail('PROVENANCE_UNAVAILABLE', {
              worker,
              phase: 'provenance',
              operation: 'github.deployment',
            });
          topology[worker] = previous.workerManifest;
          report.previousVersions[worker].provenance = 'verified';
          report.previousVersions[worker].commitSha = previous.commitSha;
        }
        simulateRelease(topology, { workers: topology }, []);
      },
    },
  });

export async function coordinatedUpgradeMain(args = process.argv.slice(2)) {
  const commitSha = args[0] === '--sha' ? args[1] : undefined;
  const checkOnly = args[2] === '--check';
  mkdirSync('.cache/coordinated-upgrade', { recursive: true });
  const persist = (report) =>
    writeFileSync(
      '.cache/coordinated-upgrade/result.json',
      JSON.stringify(report, null, 2) + '\n',
    );
  let context = { phase: 'eligibility', operation: 'release', commitSha };
  try {
    if (
      process.env.MAINTENANCE_CONFIRMED !== 'true' ||
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_REF !== `refs/heads/${releaseBranch}` ||
      !/^[0-9a-f]{40}$/.test(commitSha ?? '')
    )
      fail('COORDINATED_UPGRADE_NOT_APPROVED', context);
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
    if (head.status !== 0 || head.stdout.trim() !== commitSha)
      fail('SHA_INELIGIBLE', context);
    const github = githubClient({
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
      context,
    });
    context = {
      ...(await github.coordinatedUpgradeEligible(commitSha)),
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
        'Coordinated upgrade request and candidate CI verified; no Workers published.',
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
          `beauty-coordinated-upgrade ${worker}`,
        ],
        { encoding: 'utf8' },
      );
    const report = await coordinatedUpgrade({
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
  await coordinatedUpgradeMain();
