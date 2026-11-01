import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  appendFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  requireRemoteSecrets,
  DeploymentValidationError,
} from './worker-required-secrets.mjs';
import { deploymentOutcome } from './worker-deployment-output.mjs';
import {
  deploymentRequest,
  readConfiguration,
  selectedWorkers,
  validateWorkerConfigurations,
  workerConfigurations,
} from './worker-deployment-config.mjs';

const request = deploymentRequest(
  JSON.parse(readFileSync('.github/deploy/request.json', 'utf8')),
);
if (request.mode !== 'deploy') throw new Error('A deploy request is required');
const configurations = Object.fromEntries(
  Object.entries(workerConfigurations).map(([name, path]) => [
    name,
    readConfiguration(path),
  ]),
);
validateWorkerConfigurations(configurations, true);
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)
  throw new Error('Cloudflare credentials are required');
if (!/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? ''))
  throw new Error('An immutable GitHub SHA is required');
if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.GITHUB_REF !== 'refs/heads/feature/microsservices'
)
  throw new Error('Publish only through the protected production workflow');

mkdirSync('.cache/deployment', { recursive: true });
const report = {
  requestId: request.requestId,
  sha: process.env.GITHUB_SHA,
  target: request.worker,
  workers: [],
};
let failed = false;
try {
  try {
    await requireRemoteSecrets(configurations, request.worker, {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
    });
  } catch (error) {
    if (error instanceof DeploymentValidationError) {
      report.failureCode = error.code;
      report.failure = {
        phase: error.phase,
        worker: error.worker,
        binding: error.binding,
        status: error.status,
      };
    }
    throw error;
  }
  for (const name of selectedWorkers(request.worker)) {
    const result = spawnSync(
      process.execPath,
      [
        resolve('node_modules/wrangler/bin/wrangler.js'),
        'deploy',
        '--experimental-provision=false',
        '--experimental-auto-create=false',
        '--env',
        '',
        '--config',
        workerConfigurations[name],
        '--var',
        `SERVICE_VERSION:${process.env.GITHUB_SHA}`,
      ],
      { encoding: 'utf8' },
    );
    // Wrangler output may contain remote diagnostics: never forward it to CI.
    const outcome = deploymentOutcome(result);
    report.workers.push({
      worker: name,
      ...outcome,
    });
    writeFileSync(
      '.cache/deployment/result.json',
      JSON.stringify(report, null, 2),
    );
    if (outcome.status !== 'published') {
      console.error(
        'Worker deployment failed; verify production configuration in Cloudflare.',
      );
      failed = true;
      break;
    }
    try {
      await requireRemoteSecrets(configurations, name, {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: process.env.CLOUDFLARE_API_TOKEN,
        publishedSha: process.env.GITHUB_SHA,
      });
      report.workers.at(-1).verification = 'passed';
    } catch (error) {
      report.workers.at(-1).verification = 'failed';
      if (error instanceof DeploymentValidationError) {
        report.failureCode = error.code;
        report.failure = {
          phase: error.phase,
          worker: error.worker,
          binding: error.binding,
          status: error.status,
        };
      }
      throw error;
    }
    console.log(`Published ${name}: ${outcome.version}`);
  }
} catch {
  failed = true;
  report.failureCode ??= 'DEPLOYMENT_FAILED';
  console.error(
    JSON.stringify({ code: report.failureCode, ...report.failure }),
  );
} finally {
  writeFileSync(
    '.cache/deployment/result.json',
    JSON.stringify(report, null, 2),
  );
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Deployment ${request.requestId}\n\nSHA: ${report.sha}\n\nFailure: ${report.failureCode ?? 'none'}\n\n| Worker | Result | Version |\n|---|---|---|\n` +
        report.workers
          .map(
            (worker) =>
              `| ${worker.worker} | ${worker.status} | ${worker.version ?? 'unconfirmed'} |`,
          )
          .join('\n') +
        '\n',
    );
}
if (failed) process.exitCode = 1;
