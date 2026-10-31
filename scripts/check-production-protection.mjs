// Read-only preflight: naming an environment does not prove that it requires approval.
const repository = process.env.GITHUB_REPOSITORY;
if (!repository || !process.env.GITHUB_TOKEN)
  throw new Error('GitHub environment inspection credentials are required');
const response = await fetch(
  `https://api.github.com/repos/${repository}/environments/production`,
  {
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  },
);
if (!response.ok)
  throw new Error(
    `Cannot verify production protection (HTTP ${response.status}); deployment is blocked`,
  );
const environment = await response.json();
if (
  !environment.protection_rules?.some(
    (rule) => rule.type === 'required_reviewers' && rule.reviewers?.length,
  )
) {
  throw new Error(
    'production must have required reviewers; deployment is blocked',
  );
}
if (!environment.deployment_branch_policy)
  throw new Error('production must restrict deployment branches');
if (environment.deployment_branch_policy.custom_branch_policies) {
  const rules = await fetch(
    `https://api.github.com/repos/${repository}/environments/production/deployment-branch-policies`,
    {
      headers: {
        authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (!rules.ok)
    throw new Error('Cannot verify production branch restrictions');
  const policies = (await rules.json()).branch_policies;
  if (
    !Array.isArray(policies) ||
    policies.length !== 1 ||
    policies[0].name !== 'feature/microsservices' ||
    policies[0].type !== 'branch'
  )
    throw new Error(
      'production must allow only the feature/microsservices branch',
    );
} else if (environment.deployment_branch_policy.protected_branches) {
  const branch = await fetch(
    `https://api.github.com/repos/${repository}/branches/feature%2Fmicrosservices`,
    {
      headers: {
        authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (!branch.ok || !(await branch.json()).protected)
    throw new Error('The release branch must be protected');
} else throw new Error('No effective production branch restriction');
console.log('Production approval and branch protection are configured');
