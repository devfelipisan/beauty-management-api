import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloudflareClient } from '../deploy/cloudflare-client.mjs';
import { githubClient } from '../deploy/github-client.mjs';
import {
  workerConfigurations,
  releaseBranch,
} from '../deploy/config-contract.mjs';
import {
  readConfiguration,
  validateWorkerConfigurations,
} from '../deploy/validate-local.mjs';
import { readManifest } from '../deploy/manifest.mjs';
import { publishedWorker } from '../deploy/worker-state.mjs';
import { diagnostic, fail } from '../deploy/errors.mjs';
import { infrastructureReadiness } from './readiness.mjs';
import { auditInfrastructure } from './audit.mjs';
export async function infrastructureMain(args = process.argv.slice(2)) {
  const action = args[0],
    phase = action === 'audit' ? 'audit' : 'readiness';
  const context = {
    phase,
    operation: 'release',
    commitSha: process.env.GITHUB_SHA,
  };
  mkdirSync('.cache/infrastructure', { recursive: true });
  let client, github;
  const report = {
    action,
    status: 'running',
    controlSha: process.env.GITHUB_SHA,
  };
  try {
    const expected = action === 'audit' ? 'main' : releaseBranch;
    if (
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.GITHUB_REF !== `refs/heads/${expected}` ||
      !['audit', 'readiness', 'media', 'baseline'].includes(action)
    )
      fail('INVALID_REQUEST', context);
    client = cloudflareClient({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      context,
    });
    github = githubClient({
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
      context,
    });
    if (action === 'audit')
      Object.assign(
        report,
        await auditInfrastructure({ client, github, context }),
      );
    else {
      const configurations = Object.fromEntries(
        Object.entries(workerConfigurations).map(([name, path]) => [
          name,
          readConfiguration(path),
        ]),
      );
      validateWorkerConfigurations(configurations, true);
      const manifest = readManifest();
      await infrastructureReadiness({
        client,
        configurations,
        context,
        approveMedia: action === 'media',
        bindingTransitions: Object.fromEntries(
          Object.entries(manifest.workers).map(([name, worker]) => [
            name,
            worker.transitions,
          ]),
        ),
      });
      if (action === 'baseline') {
        const baseline = JSON.parse(
          readFileSync('.github/deploy/baseline.json', 'utf8'),
        );
        for (const worker of Object.keys(workerConfigurations)) {
          const entry = baseline.workers?.[worker];
          if (
            !/^[0-9a-f]{40}$/.test(entry?.commitSha ?? '') ||
            !/^[0-9a-f-]{36}$/i.test(entry?.versionId ?? '') ||
            typeof entry?.qualificationReference !== 'string' ||
            !entry.qualificationReference.trim()
          )
            fail('PROVENANCE_UNAVAILABLE', {
              ...context,
              worker,
              operation: 'github.deployment',
            });
          try {
            execFileSync(
              'git',
              [
                'merge-base',
                '--is-ancestor',
                entry.commitSha,
                `origin/${releaseBranch}`,
              ],
              { stdio: 'ignore' },
            );
          } catch {
            fail('SHA_INELIGIBLE', {
              ...context,
              worker,
              operation: 'github.manifest',
            });
          }
          const actual = await publishedWorker(client, worker, {
            context,
            phase,
          });
          const proof = await github.provenanceByVersion(
            worker,
            actual.versionId,
          );
          if (
            actual.versionId !== entry.versionId ||
            proof.commitSha !== entry.commitSha
          )
            fail('PUBLISHED_VERSION_MISMATCH', {
              ...context,
              worker,
              operation: 'worker.deployments',
            });
        }
        // Revalidation only. First evidence is registered by initial-adoption.
      }
    }
    report.status = 'success';
  } catch (error) {
    report.status = 'failed';
    report.failure = diagnostic(error, context);
    console.error(JSON.stringify(report.failure));
    process.exitCode = 1;
  } finally {
    report.cloudflare = client?.metrics;
    report.github = github?.metrics;
    writeFileSync(
      '.cache/infrastructure/result.json',
      JSON.stringify(report, null, 2) + '\n',
    );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await infrastructureMain();
