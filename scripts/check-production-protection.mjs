import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { githubClient } from './deploy/github-client.mjs';
import { diagnostic, fail } from './deploy/errors.mjs';

export async function checkProtection({
  environment = 'production',
  repository,
  token,
  fetchImpl,
}) {
  const context = { phase: 'eligibility', operation: 'github.request' };
  if (
    !['production', 'production-migrations', 'infrastructure-audit'].includes(
      environment,
    )
  )
    fail('INVALID_REQUEST', context);
  const github = githubClient({ repository, token, fetchImpl, context });
  const config = await github.request(`/environments/${environment}`);
  const expectedBranch =
    environment === 'infrastructure-audit' ? 'main' : 'feature/microsservices';
  if (
    environment !== 'infrastructure-audit' &&
    !config.protection_rules?.some(
      (rule) => rule.type === 'required_reviewers' && rule.reviewers?.length,
    )
  )
    fail('PROTECTION_UNAVAILABLE', context);
  if (
    config.deployment_branch_policy?.custom_branch_policies !== true ||
    config.deployment_branch_policy.protected_branches === true
  )
    fail('PROTECTION_UNAVAILABLE', context);
  const rules = await github.request(
    `/environments/${environment}/deployment-branch-policies`,
  );
  if (
    !Array.isArray(rules.branch_policies) ||
    rules.branch_policies.length !== 1 ||
    rules.branch_policies[0].name !== expectedBranch ||
    rules.branch_policies[0].type !== 'branch'
  )
    fail('PROTECTION_UNAVAILABLE', context);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await checkProtection({
      environment: process.argv[2] ?? 'production',
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
    });
    console.log('Environment policy verified');
  } catch (error) {
    console.error(JSON.stringify(diagnostic(error)));
    process.exitCode = 1;
  }
}
