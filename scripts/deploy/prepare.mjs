import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { githubClient } from './github-client.mjs';
import { releaseBranch } from './config-contract.mjs';
import { diagnostic, fail } from './errors.mjs';
export async function prepareMain(args = process.argv.slice(2)) {
  try {
    if (process.env.GITHUB_REF !== `refs/heads/${releaseBranch}`)
      fail('SHA_INELIGIBLE', { phase: 'eligibility' });
    const sha = args[0] === '--sha' ? args[1] : undefined;
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
        `## Requested release\n\nSHA: ${sha}\n\nMode: ${request.mode}\n\nTarget: ${request.worker}\n\nRequest: ${request.requestId}\n`,
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
