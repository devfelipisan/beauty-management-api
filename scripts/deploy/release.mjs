import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  workerConfigurations,
  selectedWorkers,
  releaseBranch,
} from './config-contract.mjs';
import { deploymentRequest, readConfiguration } from './validate-local.mjs';
import { cloudflareClient } from './cloudflare-client.mjs';
import { githubClient } from './github-client.mjs';
import { readManifest, digest } from './manifest.mjs';
import { preflight } from './preflight.mjs';
import { postcheck } from './postcheck.mjs';
import { cronPolicy, scheduledConfiguration } from './cron-policy.mjs';
import { wranglerDeployArgs } from './wrangler-command.mjs';
import { diagnostic, fail } from './errors.mjs';
import {
  deploymentOutcome,
  wranglerFailure,
  wranglerErrorExcerpt,
} from '../worker-deployment-output.mjs';

export async function release({
  context,
  configurations,
  manifest,
  client,
  github,
  publish,
  persist = () => {},
  preflightImpl = preflight,
  postcheckImpl = postcheck,
  cron = cronPolicy(),
}) {
  const report = {
    requestId: context.requestId,
    commitSha: context.commitSha,
    target: context.worker,
    manifestDigest: digest(manifest),
    workers: [],
    durationsMs: {},
    status: 'running',
    verificationPolicy: 'provenance-and-postcheck',
    cron,
    eligibility: Object.fromEntries(
      [
        'releaseOrigin',
        'releaseRunAttempt',
        'ciRunId',
        'ciRunAttempt',
        'verifyJobId',
        'controlSha',
      ]
        .filter((key) => context[key] !== undefined)
        .map((key) => [key, context[key]]),
    ),
  };
  const started = performance.now();
  try {
    if (context.mode !== 'deploy')
      fail('INVALID_REQUEST', { ...context, phase: 'validation' });
    let at = performance.now();
    await preflightImpl({ client, github, configurations, manifest, context });
    report.durationsMs.preflight = performance.now() - at;
    persist(report);
    for (const worker of selectedWorkers(context.worker)) {
      at = performance.now();
      const result = await publish(worker, context.commitSha);
      const outcome = deploymentOutcome(result);
      const record = {
        worker,
        commitSha: context.commitSha,
        packageVersion: manifest.workers[worker].packageVersion,
        manifestDigest: report.manifestDigest,
        ...outcome,
        publishDurationMs: performance.now() - at,
        verification: 'pending',
      };
      report.workers.push(record);
      persist(report);
      if (outcome.status !== 'published')
        fail('WRANGLER_FAILED', {
          ...context,
          phase: 'publish',
          operation: 'wrangler.deploy',
          worker,
          ...wranglerFailure(result),
        });
      at = performance.now();
      try {
        await postcheckImpl({
          client,
          worker,
          versionId: outcome.version,
          commitSha: context.commitSha,
          configuration: scheduledConfiguration(
            worker,
            configurations[worker],
            cron,
          ),
          transitions: manifest.workers[worker].transitions,
          context,
        });
        record.verification = 'passed';
        record.postcheckDurationMs = performance.now() - at;
        record.githubDeploymentId = await github.recordPublished({
          worker,
          versionId: outcome.version,
          commitSha: context.commitSha,
          packageVersion: manifest.workers[worker].packageVersion,
          manifest,
          runId: context.runId,
          releaseOrigin: context.releaseOrigin,
          releaseRunAttempt: context.releaseRunAttempt,
          ciRunId: context.ciRunId,
          ciRunAttempt: context.ciRunAttempt,
          verifyJobId: context.verifyJobId,
          controlSha: context.controlSha,
          ...(worker === 'operations' ? { scheduledCrons: cron.crons } : {}),
        });
      } catch (error) {
        record.verification = 'published_unverified';
        report.status = 'published_unverified';
        throw error;
      }
      persist(report);
    }
    report.status = 'success';
  } catch (error) {
    if (report.status !== 'published_unverified') report.status = 'failed';
    report.failure = diagnostic(error, context);
  } finally {
    report.durationsMs.total = performance.now() - started;
    report.cloudflare = structuredClone(client.metrics);
    report.github = structuredClone(github.metrics);
    persist(report);
  }
  return report;
}

export async function releaseMain(args = process.argv.slice(2)) {
  mkdirSync('.cache/deployment', { recursive: true });
  const persist = (report) =>
    writeFileSync(
      '.cache/deployment/result.json',
      JSON.stringify(report, null, 2) + '\n',
    );
  let context = { phase: 'eligibility', operation: 'release' };
  try {
    const commitSha = args[0] === '--sha' ? args[1] : undefined;
    if (
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.GITHUB_REF !== `refs/heads/${releaseBranch}` ||
      !/^[0-9a-f]{40}$/.test(commitSha ?? '')
    )
      fail('SHA_INELIGIBLE', context);
    const localSha = spawnSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    });
    if (localSha.status !== 0 || localSha.stdout.trim() !== commitSha)
      fail('SHA_INELIGIBLE', context);
    const github = githubClient({
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
      context: { ...context, commitSha },
    });
    const eligible = await github.eligible(commitSha);
    const request = deploymentRequest(
      JSON.parse(readFileSync('.github/deploy/request.json', 'utf8')),
    );
    if (
      ['mode', 'worker', 'requestId'].some(
        (key) => request[key] !== eligible[key],
      )
    )
      fail('INVALID_REQUEST', context);
    context = {
      ...eligible,
      phase: 'preflight',
      runId: process.env.GITHUB_RUN_ID,
    };
    if (request.mode === 'validate') {
      persist({
        requestId: request.requestId,
        commitSha,
        target: request.worker,
        status: 'validated',
        workers: [],
      });
      return;
    }
    const configurations = Object.fromEntries(
      Object.entries(workerConfigurations).map(([name, path]) => [
        name,
        readConfiguration(path),
      ]),
    );
    const manifest = readManifest();
    const cron = cronPolicy(process.env);
    const client = cloudflareClient({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      context,
    });
    const publish = (worker, sha) => {
      const result = spawnSync(
        process.execPath,
        wranglerDeployArgs(worker, sha, { cron }),
        { encoding: 'utf8' },
      );
      if (deploymentOutcome(result).status !== 'published') {
        const excerpt = wranglerErrorExcerpt(result);
        console.error(
          `Wrangler diagnostic (${worker}): ${JSON.stringify(excerpt)}`,
        );
        if (process.env.GITHUB_ACTIONS === 'true')
          console.error(
            `::error title=Wrangler diagnostic (${worker})::${excerpt.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`,
          );
      }
      return result;
    };
    const report = await release({
      context,
      configurations,
      manifest,
      client,
      github,
      publish,
      persist,
      cron,
    });
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `## Release ${request.requestId}\n\nSHA: ${commitSha}\n\nStatus: ${report.status}\n\nCloudflare inspections: ${report.cloudflare.calls}\n\n` +
          report.workers
            .map(
              (worker) =>
                `- ${worker.worker}: ${worker.version ?? 'unconfirmed'} (${worker.verification})`,
            )
            .join('\n') +
          `\n\n${report.failure ? JSON.stringify(report.failure) : ''}\n`,
      );
    if (report.status !== 'success') {
      console.error(JSON.stringify(report.failure));
      if (process.env.GITHUB_ACTIONS === 'true')
        console.error(
          `::error title=Worker publication failed::${JSON.stringify(report.failure)}`,
        );
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
  await releaseMain();
