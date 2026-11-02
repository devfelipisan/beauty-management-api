import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { githubClient } from './github-client.mjs';
import { releaseBranch } from './config-contract.mjs';
import { diagnostic, fail } from './errors.mjs';
export function requestedReleaseSha(args, env = process.env) {
  if (!args.length) return env.GITHUB_SHA;
  if (args.length !== 2 || args[0] !== '--sha' || typeof args[1] !== 'string')
    fail('INVALID_REQUEST', { phase: 'eligibility' });
  // Use the immutable event SHA, never resolve the moving branch head later.
  // Explicit invalid values are left for eligible() to reject, not replaced.
  return args[1] || env.GITHUB_SHA;
}

export async function prepareMain(args = process.argv.slice(2)) {
  try {
    if (process.env.GITHUB_REF !== `refs/heads/${releaseBranch}`)
      fail('SHA_INELIGIBLE', { phase: 'eligibility' });
    const sha = requestedReleaseSha(args);
    const github = githubClient({
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
      context: { phase: 'eligibility' },
    });
    const request = await github.eligible(sha);
    if (process.env.GITHUB_OUTPUT)
      for (const key of ['mode', 'worker', 'requestId', 'commitSha'])
        appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${request[key]}\n`);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `## Requested release\n\nSHA: ${sha}\n\nMode: ${request.mode}\n\nTarget: ${request.worker}\n\nRequest: ${request.requestId}\n\nOrigin: ${request.releaseOrigin}\n\nCI: ${request.ciRunId}, attempt ${request.ciRunAttempt}, verify job ${request.verifyJobId}\n`,
      );
  } catch (error) {
    console.error(JSON.stringify(diagnostic(error, { phase: 'eligibility' })));
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await prepareMain();
