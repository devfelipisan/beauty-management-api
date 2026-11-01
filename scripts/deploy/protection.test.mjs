import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkProtection } from '../check-production-protection.mjs';
const config = {
  protection_rules: [{ type: 'required_reviewers', reviewers: [{ id: 1 }] }],
  deployment_branch_policy: {
    custom_branch_policies: true,
    protected_branches: false,
  },
};
const options = (environment = 'production', overrides = {}) => ({
  environment,
  repository: 'owner/repo',
  token: 'fixture',
  fetchImpl: async (url) => ({
    ok: true,
    json: async () =>
      url.endsWith('deployment-branch-policies')
        ? {
            branch_policies: [
              {
                name:
                  environment === 'infrastructure-audit'
                    ? 'main'
                    : 'feature/microsservices',
                type: 'branch',
              },
            ],
          }
        : { ...config, ...overrides },
  }),
});
test('mutable environments require actual reviewers and a single explicit authorized branch', async () => {
  for (const environment of [
    'production',
    'production-migrations',
    'infrastructure-inventory',
  ]) {
    await checkProtection(options(environment));
    await assert.rejects(
      checkProtection(options(environment, { protection_rules: [] })),
      { code: 'PROTECTION_UNAVAILABLE' },
    );
    await assert.rejects(
      checkProtection(
        options(environment, {
          deployment_branch_policy: { protected_branches: true },
        }),
      ),
      { code: 'PROTECTION_UNAVAILABLE' },
    );
  }
});
test('audit environment is restricted to main independently of mutable approvals', async () => {
  await checkProtection(
    options('infrastructure-audit', { protection_rules: [] }),
  );
  const input = options();
  input.fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      ...config,
      branch_policies: [{ name: '*', type: 'branch' }],
    }),
  });
  await assert.rejects(checkProtection(input), {
    code: 'PROTECTION_UNAVAILABLE',
  });
});
