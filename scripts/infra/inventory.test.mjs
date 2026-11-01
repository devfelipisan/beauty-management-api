import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';
import {
  inventoryClient,
  collectInventory,
  observeServiceVersion,
  observeDeployments,
  serializeInventory,
} from './inventory.mjs';
import { analyzeSettings, validateSettings } from '../deploy/worker-state.mjs';
import { diagnostic } from '../deploy/errors.mjs';
import {
  configurations,
  settings,
  sha,
  version,
  response,
} from '../deploy/fixtures.mjs';

function fixture(override = () => undefined) {
  const calls = [];
  const client = inventoryClient({
    accountId: 'fixture-account',
    apiToken: 'PRIVATE_TOKEN',
    context: { phase: 'inventory', commitSha: sha },
    fetchImpl: async (url, options) => {
      const path = url.replace(/^.*\/accounts\/fixture-account/, '');
      calls.push({ path, options });
      const replaced = override(path);
      if (replaced !== undefined) return replaced;
      const worker = path.match(
        /beauty-(operations|billing|clinical)-worker/,
      )?.[1];
      if (path.endsWith('/settings')) return response(settings(worker));
      if (path.endsWith('/deployments'))
        return response({
          deployments: [
            { versions: [{ version_id: version, percentage: 100 }] },
          ],
        });
      assert.fail('Unexpected inventory endpoint');
    },
  });
  return { client, calls };
}
test('inventory observes all three Workers with exactly six cached GET metadata reads', async () => {
  const f = fixture();
  const report = await collectInventory({
    ...f,
    configurations,
    context: { commitSha: sha, runId: '12', runAttempt: '2' },
  });
  assert.equal(report.collectionStatus, 'complete');
  assert.equal(report.workers.length, 3);
  assert.equal(f.calls.length, 6);
  assert.equal(report.controlSha, sha);
  assert.equal(report.attempt, 2);
  assert.equal(report.snapshotConsistency, 'not_atomic');
  assert.ok(
    report.workers.every(
      (worker) => worker.settings.serviceVersion.provenance === 'not_verified',
    ),
  );
  await f.client.request('/workers/scripts/beauty-billing-worker/settings');
  assert.equal(f.calls.length, 6);
  assert.ok(
    f.calls.every(
      (call) => call.options.method === 'GET' && !call.options.body,
    ),
  );
  assert.ok(!serializeInventory(report).includes('PRIVATE_TOKEN'));
});
test('missing versions, multiple known binding errors and unknown Text do not require a baseline', async () => {
  const f = fixture((path) => {
    if (!path.endsWith('/settings')) return;
    const worker = path.match(/beauty-(operations|billing|clinical)-worker/)[1],
      value = settings(worker);
    value.bindings = value.bindings.filter(
      (binding) => binding.name !== 'SERVICE_VERSION',
    );
    if (worker === 'billing') {
      value.bindings = value.bindings.map((binding) =>
        binding.name === 'APP_ENV'
          ? { ...binding, text: 'PRIVATE_WRONG_VALUE' }
          : binding.name === 'OPERATIONS_SERVICE'
            ? { ...binding, environment: 'PRIVATE_SELECTOR' }
            : binding,
      );
      value.bindings.push({
        name: 'PRIVATE_UNKNOWN_TEXT',
        type: 'plain_text',
        text: '150000',
      });
    }
    return response(value);
  });
  const report = await collectInventory({ ...f, configurations });
  const billing = report.workers.find((worker) => worker.worker === 'billing');
  assert.equal(report.collectionStatus, 'complete');
  assert.equal(billing.settings.unknownBindingCount, 1);
  assert.ok(
    billing.settings.findings.some(
      (f) => f.binding === 'APP_ENV' && f.code === 'BINDING_VALUE_INVALID',
    ),
  );
  assert.ok(
    billing.settings.findings.some(
      (f) => f.selector === 'ENVIRONMENT' && f.binding === 'OPERATIONS_SERVICE',
    ),
  );
  assert.ok(
    report.workers.every(
      (worker) => worker.settings.serviceVersion.status === 'absent',
    ),
  );
  const output = serializeInventory(report);
  for (const secret of [
    'PRIVATE_WRONG_VALUE',
    'PRIVATE_SELECTOR',
    'PRIVATE_UNKNOWN_TEXT',
    '150000',
    configurations.billing.d1_databases[0].database_id,
  ])
    assert.ok(!output.includes(secret));
  assert.equal(f.calls.length, 6);
});
test('absent resources are observations, while denied, transport and invalid responses are operational failures', async () => {
  for (const [reply, status] of [
    [() => ({ ok: false, status: 404 }), 'complete'],
    [() => ({ ok: false, status: 403 }), 'partial'],
    [
      () => {
        throw new Error('PRIVATE_TRANSPORT');
      },
      'partial',
    ],
    [() => response({ unexpected: 'PRIVATE_BODY' }), 'partial'],
  ]) {
    const f = fixture((path) =>
      path.includes('beauty-billing-worker/settings') ? reply() : undefined,
    );
    const report = await collectInventory({ ...f, configurations });
    assert.equal(report.collectionStatus, status);
    assert.equal(f.calls.length, 6);
    assert.ok(
      report.workers
        .filter((worker) => worker.worker !== 'billing')
        .every((worker) => worker.collectionStatus === 'complete'),
    );
    assert.ok(!serializeInventory(report).includes('PRIVATE_'));
  }
  const f = fixture(() => ({ ok: false, status: 401 }));
  const report = await collectInventory({ ...f, configurations });
  assert.equal(report.collectionStatus, 'failed');
  assert.equal(f.calls.length, 6);
});
test('service version observations expose only a valid declared SHA and never claim provenance', () => {
  for (const [binding, status] of [
    [undefined, 'absent'],
    [{ type: 'plain_text', text: '' }, 'empty'],
    [{ type: 'secret_text', text: 'PRIVATE' }, 'invalid_type'],
    [{ type: 'plain_text', text: 'PRIVATE' }, 'invalid'],
    [{ type: 'plain_text', text: 123 }, 'invalid'],
    [{ type: 'plain_text', text: sha }, 'valid_format'],
  ]) {
    const result = observeServiceVersion({
      bindings: binding ? [{ ...binding, name: 'SERVICE_VERSION' }] : [],
    });
    assert.equal(result.status, status);
    assert.equal(result.provenance, 'not_verified');
    assert.equal(
      result.declaredCommitSha,
      status === 'valid_format' ? sha : undefined,
    );
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
});
test('inventory recognizes approved transition names but does not accept their previous state as final', async () => {
  const f = fixture((path) => {
    if (!path.includes('beauty-billing-worker/settings')) return;
    const value = settings('billing');
    value.bindings.push({
      name: 'LEGACY_SERVICE',
      type: 'service',
      service: 'PRIVATE_OLD_DESTINATION',
    });
    return response(value);
  });
  const transitions = {
    billing: [
      {
        name: 'LEGACY_SERVICE',
        previous: {
          name: 'LEGACY_SERVICE',
          type: 'service',
          service: 'PRIVATE_OLD_DESTINATION',
        },
        reason: 'approved removal',
      },
    ],
  };
  const report = await collectInventory({
    ...f,
    configurations,
    bindingTransitions: transitions,
  });
  const observed = report.workers.find(
    (worker) => worker.worker === 'billing',
  ).settings;
  assert.equal(observed.unknownBindingCount, 0);
  assert.ok(
    observed.findings.some(
      (finding) =>
        finding.binding === 'LEGACY_SERVICE' &&
        finding.code === 'BINDING_MISMATCH',
    ),
  );
  assert.ok(!serializeInventory(report).includes('PRIVATE_OLD_DESTINATION'));
});
test('malformed or ambiguous deployment data fails its component but retains independent observations', async () => {
  const f = fixture((path) =>
    path.includes('beauty-billing-worker/deployments')
      ? response({
          deployments: [
            { versions: [{ version_id: version, percentage: 25 }] },
          ],
        })
      : undefined,
  );
  const report = await collectInventory({ ...f, configurations });
  assert.equal(report.collectionStatus, 'partial');
  assert.equal(f.calls.length, 6);
  const billing = report.workers.find((worker) => worker.worker === 'billing');
  assert.equal(billing.settings.collectionStatus, 'complete');
  assert.equal(billing.deployments.deploymentState, 'ambiguous');
  assert.equal(billing.deployments.collectionStatus, 'failed');
  assert.deepEqual(billing.deployments.versions, [
    { versionId: version, percentage: 25 },
  ]);
});
test('deployment observations retain traffic splits without choosing a version or exposing extra metadata', () => {
  assert.deepEqual(observeDeployments({ deployments: [] }), {
    deploymentState: 'empty',
    versions: [],
  });
  const second = '87654321-4321-4321-4321-cba987654321';
  const result = observeDeployments({
    deployments: [
      {
        private: 'PRIVATE',
        versions: [
          { version_id: version, percentage: 25, private: 'PRIVATE' },
          { version_id: second, percentage: 75 },
        ],
      },
    ],
  });
  assert.equal(result.deploymentState, 'multiple');
  assert.deepEqual(result.versions, [
    { versionId: version, percentage: 25 },
    { versionId: second, percentage: 75 },
  ]);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.equal(
    observeDeployments({
      deployments: [{ versions: [{ version_id: version, percentage: 10 }] }],
    }).deploymentState,
    'ambiguous',
  );
  for (const value of [
    {},
    { deployments: [{}] },
    { deployments: [{ versions: [] }] },
    {
      deployments: [{ versions: [{ version_id: 'PRIVATE', percentage: 100 }] }],
    },
    {
      deployments: [{ versions: [{ version_id: version, percentage: '100' }] }],
    },
  ])
    assert.throws(() => observeDeployments(value), {
      code: 'REMOTE_RESPONSE_INVALID',
    });
});
test('inventory capability rejects bodies, SQL, write methods and arbitrary paths before any transport', async () => {
  const f = fixture();
  const path = '/workers/scripts/beauty-billing-worker/settings';
  for (const [target, options] of [
    [path, { method: 'POST' }],
    [path, { method: 'DELETE' }],
    [path, { body: undefined }],
    [path, { body: { sql: 'SELECT 1' } }],
    ['/d1/database/anything/query', {}],
    ['/r2/buckets/beauty-r2', {}],
    [`${path}?extra=1`, {}],
    ['https://private.example', {}],
  ])
    assert.throws(() => f.client.request(target, options), {
      code: 'INVALID_REQUEST',
    });
  assert.equal(f.calls.length, 0);
  assert.throws(() => inventoryClient({ accountId: 'fixture' }), {
    code: 'REMOTE_CREDENTIALS_UNAVAILABLE',
  });
});
test('shared analysis and release validation preserve the first error of the original validator', async () => {
  const base = '0ac259e32fc6b02244bfd49a8cae667352f936fd';
  const source = execFileSync(
    'git',
    ['show', `${base}:scripts/deploy/worker-state.mjs`],
    { encoding: 'utf8' },
  ).replace(
    /from '(\.\/[^']+)'/g,
    (_, path) =>
      `from '${pathToFileURL(resolve('scripts/deploy', path)).href}'`,
  );
  const original = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  );
  const capture = (run) => {
    try {
      run();
      return { passed: true };
    } catch (error) {
      return diagnostic(error);
    }
  };
  const variants = [
    undefined,
    {},
    { bindings: [] },
    { bindings: [null] },
    settings('billing'),
  ];
  for (const mutate of [
    (v) =>
      v.bindings.push({ name: 'PRIVATE', type: 'plain_text', text: 'PRIVATE' }),
    (v) => v.bindings.push(v.bindings[0]),
    (v) => (v.bindings[0].text = 'wrong'),
    (v) =>
      (v.bindings.find((b) => b.name === 'OPERATIONS_SERVICE').environment =
        'production'),
    (v) =>
      (v.bindings.find((b) => b.name === 'D1_DATABASE').database_id = null),
  ]) {
    const value = settings('billing');
    mutate(value);
    variants.push(value);
  }
  for (const value of variants)
    for (const phase of ['preflight', 'postcheck', 'readiness', 'audit']) {
      const options = { phase };
      assert.deepEqual(
        capture(() =>
          validateSettings(value, 'billing', configurations.billing, options),
        ),
        capture(() =>
          original.validateSettings(
            value,
            'billing',
            configurations.billing,
            options,
          ),
        ),
      );
    }
  for (const previous of [
    {
      name: 'OPERATIONS_SERVICE',
      type: 'service',
      service: 'old',
      environment: 'legacy',
    },
    { name: 'OPERATIONS_SERVICE', type: 'd1', id: null },
  ]) {
    const value = settings('billing');
    value.bindings.find((b) => b.name === 'OPERATIONS_SERVICE').environment =
      'production';
    for (const phase of ['preflight', 'postcheck']) {
      const options = {
        phase,
        transitions: [
          { name: 'OPERATIONS_SERVICE', previous, reason: 'approved fixture' },
        ],
      };
      assert.deepEqual(
        capture(() =>
          validateSettings(value, 'billing', configurations.billing, options),
        ),
        capture(() =>
          original.validateSettings(
            value,
            'billing',
            configurations.billing,
            options,
          ),
        ),
      );
    }
  }
  const value = settings('billing');
  value.bindings[0].text = 'wrong';
  value.bindings.find((b) => b.name === 'OPERATIONS_SERVICE').environment =
    'production';
  const analysis = analyzeSettings(value, 'billing', configurations.billing);
  assert.ok(analysis.findings.length >= 2);
  assert.deepEqual(
    analysis.findings[0],
    capture(() => validateSettings(value, 'billing', configurations.billing)),
  );
});
test('manual inventory workflow isolates credentials and permissions from release and audit', () => {
  const workflow = yaml.load(
    readFileSync('.github/workflows/infrastructure-inventory.yml', 'utf8'),
  );
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.equal(workflow.concurrency, undefined);
  assert.equal(workflow.jobs.collect.environment, 'infrastructure-inventory');
  assert.ok(!JSON.stringify(workflow.jobs.validate).includes('secrets.'));
  const step = workflow.jobs.collect.steps.find(
    (step) => step.env?.CLOUDFLARE_API_TOKEN,
  );
  assert.equal(
    step.env.CLOUDFLARE_API_TOKEN,
    '${{ secrets.CLOUDFLARE_INVENTORY_TOKEN }}',
  );
  assert.equal(
    step.env.CLOUDFLARE_ACCOUNT_ID,
    '${{ vars.CLOUDFLARE_ACCOUNT_ID }}',
  );
  assert.ok(!JSON.stringify(workflow).includes('npm run check'));
  assert.ok(!JSON.stringify(workflow).includes('beauty-production'));
  assert.ok(workflow.jobs.collect.steps.some((step) => step.if === 'always()'));
  const source = readFileSync('scripts/infra/inventory.mjs', 'utf8');
  for (const forbidden of [
    'publishedWorker(',
    'infrastructureReadiness(',
    'recordPublished(',
    'wrangler',
    'baseline.json',
    'migrations apply',
  ])
    assert.ok(!source.includes(forbidden));
  assert.equal(
    yaml.load(
      readFileSync('.github/workflows/infrastructure-audit.yml', 'utf8'),
    ).jobs.audit.environment,
    'infrastructure-audit',
  );
});
test('standalone inventory preserves the same sanitized JSON in CLI, artifact and summary on guard failure', () => {
  const env = {
    ...process.env,
    GITHUB_ACTIONS: 'false',
    GITHUB_STEP_SUMMARY: resolve('.cache/inventory-test-summary.md'),
  };
  delete env.CLOUDFLARE_API_TOKEN;
  const result = spawnSync(process.execPath, ['scripts/infra/inventory.mjs'], {
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.collectionStatus, 'failed');
  assert.deepEqual(
    JSON.parse(
      readFileSync('.cache/infrastructure-inventory/result.json', 'utf8'),
    ),
    report,
  );
  assert.ok(
    readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8').includes(
      JSON.stringify(report, null, 2),
    ),
  );
  assert.equal(report.metrics.cloudflare.calls, 0);
});
test('missing inventory credentials block before transport while retaining execution evidence', () => {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const env = {
    ...process.env,
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/feature/microsservices',
    GITHUB_SHA: commit,
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '1',
  };
  delete env.CLOUDFLARE_API_TOKEN;
  delete env.CLOUDFLARE_ACCOUNT_ID;
  delete env.GITHUB_STEP_SUMMARY;
  const result = spawnSync(process.execPath, ['scripts/infra/inventory.mjs'], {
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.findings[0].code, 'REMOTE_CREDENTIALS_UNAVAILABLE');
  assert.equal(report.controlSha, commit);
  assert.equal(report.executionId, '123');
  assert.equal(report.metrics.cloudflare.calls, 0);
});
