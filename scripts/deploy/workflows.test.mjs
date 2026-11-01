import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as yaml from 'js-yaml';
const workflow = (name) =>
  yaml.load(readFileSync(`.github/workflows/${name}.yml`, 'utf8'));
test('CI covers both branches with no remote credential or deployment trigger', () => {
  const ci = workflow('ci');
  assert.deepEqual(ci.on.push.branches, ['main', 'feature/microsservices']);
  assert.deepEqual(ci.on.pull_request.branches, [
    'main',
    'feature/microsservices',
  ]);
  assert.ok(!JSON.stringify(ci).includes('secrets.'));
  assert.ok(!JSON.stringify(ci).includes('environment'));
  assert.ok(JSON.stringify(ci).includes('scripts/test-deployment.mjs'));
  assert.ok(JSON.stringify(ci).includes('git diff --exit-code'));
});
test('release is manual, protected, immutable and invokes only the orchestrator', () => {
  const release = workflow('deploy-workers');
  assert.deepEqual(Object.keys(release.on), ['workflow_dispatch']);
  assert.equal(release.jobs.deploy.environment, 'production');
  assert.equal(release.concurrency.group, 'beauty-production');
  const steps = release.jobs.deploy.steps,
    source = steps.find(
      (s) => s.with?.ref === '${{ needs.prepare.outputs.commitSha }}',
    );
  assert.ok(source);
  assert.ok(
    steps.some(
      (s) =>
        s.with?.path === '.release-control' &&
        s.with.ref === '${{ github.sha }}',
    ),
  );
  const commands = steps.map((s) => s.run ?? '').join('\n');
  assert.ok(!commands.includes('preflight'));
  assert.ok(!commands.includes('bootstrap'));
  assert.ok(!commands.includes('migrations'));
  assert.ok(
    commands.includes('node .release-control/scripts/deploy-workers.mjs'),
  );
});
test('audit is initially manual and isolated from mutable environments and credentials', () => {
  const audit = workflow('infrastructure-audit');
  assert.deepEqual(Object.keys(audit.on), ['workflow_dispatch']);
  assert.equal(audit.jobs.audit.environment, 'infrastructure-audit');
  assert.equal(audit.permissions.deployments, 'read');
  const text = JSON.stringify(audit);
  assert.ok(text.includes('CLOUDFLARE_AUDIT_TOKEN'));
  assert.ok(!text.includes('CLOUDFLARE_DEPLOY_TOKEN'));
  assert.ok(!text.includes('CLOUDFLARE_MIGRATIONS_TOKEN'));
  assert.ok(
    readFileSync('.github/workflows/infrastructure-audit.yml', 'utf8').includes(
      '0 6 * * 0',
    ),
  );
});
test('migration and bootstrap flows share exclusion but have separate protected roles', () => {
  const migration = workflow('migrations-d1'),
    bootstrap = workflow('bootstrap-workers');
  assert.equal(migration.jobs.migrations.environment, 'production-migrations');
  assert.equal(migration.concurrency.group, 'beauty-production');
  assert.equal(bootstrap.concurrency.group, 'beauty-production');
  assert.ok(JSON.stringify(migration).includes('CLOUDFLARE_MIGRATIONS_TOKEN'));
  assert.ok(!JSON.stringify(migration).includes('CLOUDFLARE_DEPLOY_TOKEN'));
  assert.ok(JSON.stringify(migration).includes('INSPECTION_RUN_ID'));
});
