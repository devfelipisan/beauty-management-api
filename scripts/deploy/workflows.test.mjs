import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as yaml from 'js-yaml';
import { validationSteps } from './validate-local-release.mjs';
const workflow = (name) =>
  yaml.load(readFileSync(`.github/workflows/${name}.yml`, 'utf8'));
test('quality gate covers both branches without credentials and chains only authorized pushes', () => {
  const ci = workflow('ci');
  assert.deepEqual(ci.on.push.branches, ['main', 'feature/microsservices']);
  assert.deepEqual(ci.on.pull_request.branches, [
    'main',
    'feature/microsservices',
  ]);
  assert.ok(!JSON.stringify(ci.jobs.verify).includes('secrets.'));
  assert.ok(!JSON.stringify(ci.jobs.verify).includes('environment'));
  assert.equal(ci.jobs.verify.name, 'verify');
  assert.deepEqual(ci.jobs.verify.permissions, {
    contents: 'read',
    actions: 'read',
  });
  assert.equal(ci.jobs.publish.needs, 'verify');
  assert.equal(ci.jobs.publish.uses, './.github/workflows/deploy-workers.yml');
  assert.equal(ci.jobs.publish.with.commit_sha, '${{ github.sha }}');
  assert.equal(
    ci.jobs.publish.if,
    "github.event_name == 'push' && github.ref == 'refs/heads/feature/microsservices' && needs.verify.result == 'success' && needs.verify.outputs.deployRequired == 'true'",
  );
  assert.deepEqual(Object.keys(ci.jobs.publish.secrets), [
    'CLOUDFLARE_API_TOKEN',
  ]);
  assert.equal(ci.concurrency, undefined);
  assert.equal(
    ci.jobs.publish.secrets.CLOUDFLARE_API_TOKEN,
    '${{ secrets.CLOUDFLARE_API_TOKEN }}',
  );
  assert.ok(JSON.stringify(ci).includes('npm run check:release'));
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  assert.equal(
    scripts['check:release'],
    'node scripts/deploy/validate-local-release.mjs',
  );
  assert.equal(scripts['deploy:validate'], 'npm run check:release');
  assert.deepEqual(
    validationSteps.map(([, args]) => args),
    [
      ['scripts/check-format-changes.mjs', '--local'],
      ['npm', 'run', 'check'],
      ['scripts/test-deployment.mjs'],
      ['scripts/worker-deployment-config.mjs'],
      ['scripts/deploy/manifest-check.mjs'],
    ],
  );
  assert.equal(
    ci.jobs.verify.outputs.deployRequired,
    '${{ steps.changes.outputs.deployRequired }}',
  );
  assert.ok(JSON.stringify(ci).includes('git diff --exit-code'));
});
test('release supports call and dispatch with a protected publication and read-only preparation', () => {
  const release = workflow('deploy-workers');
  assert.deepEqual(Object.keys(release.on), [
    'workflow_call',
    'workflow_dispatch',
  ]);
  assert.equal(release.on.workflow_call.inputs.commit_sha.required, true);
  assert.deepEqual(release.on.workflow_call.secrets, {
    CLOUDFLARE_API_TOKEN: { required: true },
  });
  assert.deepEqual(release.jobs.prepare.permissions, {
    contents: 'read',
    actions: 'read',
  });
  assert.ok(!JSON.stringify(release.jobs.prepare).includes('secrets.'));
  assert.equal(release.jobs.prepare.environment, undefined);
  assert.equal(
    release.jobs.deploy.if,
    "needs.prepare.outputs.mode == 'deploy'",
  );
  assert.equal(release.jobs.deploy.environment, 'production');
  assert.equal(release.concurrency, undefined);
  assert.equal(release.jobs.deploy.concurrency.group, 'beauty-production');
  assert.equal(release.jobs.deploy.concurrency['cancel-in-progress'], false);
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
  const availability = steps.findIndex(
    (step) => step.name === 'Validate Cloudflare credentials availability',
  );
  const publication = steps.findIndex(
    (step) => step.name === 'Validate provenance, publish and verify Workers',
  );
  assert.ok(availability >= 0 && availability < publication);
  assert.deepEqual(steps[availability].env, {
    CF_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
    CF_ACCOUNT_ID: '${{ vars.CLOUDFLARE_ACCOUNT_ID }}',
  });
  assert.equal(steps[availability].shell, 'bash');
  assert.ok(!steps[availability].run.includes('curl'));
  assert.equal(
    steps[publication].env.CLOUDFLARE_API_TOKEN,
    '${{ secrets.CLOUDFLARE_API_TOKEN }}',
  );
  assert.equal(
    steps[publication].env.CLOUDFLARE_ACCOUNT_ID,
    '${{ vars.CLOUDFLARE_ACCOUNT_ID }}',
  );
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
  assert.ok(!text.includes('secrets.CLOUDFLARE_API_TOKEN'));
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
  for (const name of ['bootstrap-workers', 'infrastructure-readiness']) {
    const config = workflow(name);
    const steps = Object.values(config.jobs).flatMap((job) => job.steps ?? []);
    const credentialStep = steps.find((step) => step.env?.CLOUDFLARE_API_TOKEN);
    assert.equal(
      credentialStep.env.CLOUDFLARE_API_TOKEN,
      '${{ secrets.CLOUDFLARE_API_TOKEN }}',
    );
    assert.equal(
      credentialStep.env.CLOUDFLARE_ACCOUNT_ID,
      '${{ vars.CLOUDFLARE_ACCOUNT_ID }}',
    );
  }
});
test('initial adoption is manual, protected, serialized and separate from release and baseline revalidation', () => {
  const adoption = workflow('infrastructure-initial-adoption');
  assert.deepEqual(Object.keys(adoption.on), ['workflow_dispatch']);
  assert.equal(adoption.concurrency.group, 'beauty-production');
  assert.equal(adoption.concurrency['cancel-in-progress'], false);
  assert.equal(adoption.jobs.qualify.environment, 'production');
  assert.equal(adoption.jobs.qualify.permissions.deployments, 'write');
  assert.equal(
    workflow('infrastructure-readiness').permissions.deployments,
    'read',
  );
  assert.ok(!JSON.stringify(adoption.jobs.validate).includes('secrets.'));
  assert.equal(adoption.jobs.qualify.needs, 'validate');
  assert.ok(
    JSON.stringify(adoption).includes(
      'node scripts/infra/initial-adoption.mjs',
    ),
  );
  assert.ok(!JSON.stringify(adoption).includes('wrangler deploy'));
  assert.ok(
    !readFileSync('scripts/infra/run.mjs', 'utf8').includes('recordPublished'),
  );
});
test('controlled first publication is an explicit protected workflow with immutable code and recovery artifacts', () => {
  const first = workflow('infrastructure-first-publication');
  assert.deepEqual(Object.keys(first.on), ['workflow_dispatch']);
  assert.equal(first.on.workflow_dispatch.inputs.commit_sha.required, true);
  assert.equal(first.concurrency.group, 'beauty-production');
  assert.equal(first.concurrency['cancel-in-progress'], false);
  assert.equal(first.jobs.publish.needs, 'validate');
  assert.equal(first.jobs.publish.environment, 'production');
  assert.equal(first.jobs.publish.permissions.deployments, 'write');
  assert.ok(
    !JSON.stringify(first.jobs.validate).includes('CLOUDFLARE_API_TOKEN'),
  );
  assert.ok(JSON.stringify(first.jobs.validate).includes('npm run check'));
  assert.ok(JSON.stringify(first.jobs.validate).includes('--check'));
  // The candidate's broad Vitest globs must not discover a nested control checkout.
  const validation = first.jobs.validate.steps;
  assert.ok(
    validation.findIndex((step) => step.run?.includes('npm run check')) <
      validation.findIndex((step) => step.with?.path === '.release-control'),
  );
  const steps = first.jobs.publish.steps;
  assert.ok(
    steps.some(
      (step) =>
        step.with?.path === '.release-control' &&
        step.with.ref === '${{ github.sha }}',
    ),
  );
  assert.ok(
    steps.some((step) => step.with?.ref === '${{ inputs.commit_sha }}'),
  );
  assert.ok(
    steps.some(
      (step) =>
        step.if === 'always()' &&
        step.with?.path === '.cache/first-publication/result.json',
    ),
  );
  assert.ok(!JSON.stringify(workflow('ci')).includes('first-publication'));
  assert.ok(
    !readFileSync('scripts/deploy/preflight.mjs', 'utf8').includes(
      'firstPublication',
    ),
  );
});

test('publication no longer reads cron policy from GitHub Variables', () => {
  const env = workflow('deploy-workers').jobs.deploy.steps.find((step) =>
    step.run?.includes('deploy-workers.mjs'),
  ).env;
  assert.equal(env.CRONJOB_ENABLED, undefined);
  assert.equal(env.CRONJOB, undefined);
});

test('manual releases default to the event SHA while CI calls remain immutable and required', () => {
  const release = workflow('deploy-workers');
  assert.equal(release.on.workflow_dispatch.inputs.commit_sha.required, false);
  assert.equal(release.on.workflow_call.inputs.commit_sha.required, true);
  const step = release.jobs.prepare.steps.find((step) => step.id === 'request');
  assert.equal(step.env.REQUESTED_SHA, '${{ inputs.commit_sha }}');
  assert.ok(step.run.includes('--sha "$REQUESTED_SHA"'));
});

test('protected release synchronizes cron before publishing and preserves a separate cron artifact', () => {
  const release = workflow('deploy-workers');
  const steps = release.jobs.deploy.steps;
  assert.equal(release.jobs.deploy.environment, 'production');
  assert.equal(release.jobs.deploy.concurrency.group, 'beauty-production');
  const sync = steps.findIndex((step) => step.id === 'sync-cron');
  const publish = steps.findIndex((step) =>
    step.run?.includes('scripts/deploy-workers.mjs'),
  );
  const protection = steps.findIndex((step) =>
    step.run?.includes('check-production-protection.mjs'),
  );
  assert.ok(protection < sync && sync < publish);
  assert.equal(
    steps[sync].run,
    'node .release-control/scripts/infra/manage-cron.mjs --apply',
  );
  assert.equal(
    steps[sync].if,
    "needs.prepare.outputs.worker == 'all' || needs.prepare.outputs.worker == 'operations'",
  );
  assert.equal(
    steps[sync].env.CLOUDFLARE_API_TOKEN,
    '${{ secrets.CLOUDFLARE_API_TOKEN }}',
  );
  assert.equal(steps[sync]['continue-on-error'], undefined);
  const artifacts = steps.filter(
    (step) => step.uses === 'actions/upload-artifact@v4',
  );
  assert.ok(
    artifacts.some((step) => step.with.path === '.cache/cron/result.json'),
  );
  assert.ok(
    artifacts.some(
      (step) => step.with.path === '.cache/deployment/result.json',
    ),
  );
  assert.ok(
    artifacts.every(
      (step) =>
        typeof step.with.path === 'string' && !step.with.path.includes('\n'),
    ),
  );
});
