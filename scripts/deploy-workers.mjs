import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  appendFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
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
validateWorkerConfigurations(
  Object.fromEntries(
    Object.entries(workerConfigurations).map(([name, path]) => [
      name,
      readConfiguration(path),
    ]),
  ),
  true,
);
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
  for (const name of selectedWorkers(request.worker)) {
    const result = spawnSync(
      process.execPath,
      [
        resolve('node_modules/wrangler/bin/wrangler.js'),
        'deploy',
        '--env',
        '',
        '--config',
        workerConfigurations[name],
        '--var',
        `SERVICE_VERSION:${process.env.GITHUB_SHA}`,
      ],
      { encoding: 'utf8' },
    );
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    process.stdout.write(output);
    const version = output.match(/Current Version ID:\s*([0-9a-f-]{36})/i)?.[1];
    const status = result.status === 0 ? 'published' : 'failed';
    report.workers.push({
      worker: name,
      status,
      version: version ?? null,
      exitCode: result.status,
    });
    writeFileSync(
      '.cache/deployment/result.json',
      JSON.stringify(report, null, 2),
    );
    if (result.error || result.status !== 0 || !version) {
      failed = true;
      break;
    }
  }
} finally {
  writeFileSync(
    '.cache/deployment/result.json',
    JSON.stringify(report, null, 2),
  );
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Deployment ${request.requestId}\n\nSHA: ${report.sha}\n\n| Worker | Result | Version |\n|---|---|---|\n` +
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
