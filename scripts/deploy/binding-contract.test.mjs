import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { validateSettings } from './worker-state.mjs';
import { diagnostic, DeploymentValidationError } from './errors.mjs';
import { validateManifest } from './manifest.mjs';
import {
  configurations,
  settings,
  manifest,
  fixture,
  response,
  sha,
} from './fixtures.mjs';
import { release } from './release.mjs';

function changed(name, patch, worker = 'billing') {
  const state = settings(worker);
  state.bindings = state.bindings.map((binding) =>
    binding.name === name ? { ...binding, ...patch } : binding,
  );
  return state;
}
const db = configurations.billing.d1_databases[0].database_id;
test('accepts modern, legacy and matching dual D1 identifiers', () => {
  for (const fields of [
    { database_id: db },
    { database_id: undefined, id: db },
    { database_id: db, id: db },
  ])
    assert.doesNotThrow(() =>
      validateSettings(
        changed('D1_DATABASE', fields),
        'billing',
        configurations.billing,
      ),
    );
});
test('rejects different databases, conflicting aliases and malformed identifiers without leaking values', () => {
  for (const [fields, code] of [
    [
      { database_id: '87654321-4321-4321-4321-cba987654321' },
      'BINDING_MISMATCH',
    ],
    [{ database_id: db, id: 'private-resource-id' }, 'BINDING_MISMATCH'],
    ...['', null, 7, [], {}, ' leading'].map((database_id) => [
      { database_id },
      'REMOTE_RESPONSE_INVALID',
    ]),
  ]) {
    assert.throws(
      () =>
        validateSettings(
          changed('D1_DATABASE', fields),
          'billing',
          configurations.billing,
        ),
      (error) => {
        assert.equal(error.code, code);
        assert.equal(diagnostic(error).binding, 'D1_DATABASE');
        assert.ok(!JSON.stringify(diagnostic(error)).includes(db));
        assert.ok(
          !JSON.stringify(diagnostic(error)).includes('private-resource-id'),
        );
        return true;
      },
    );
  }
});
test('compares service target and selectors independently of undocumented props serialization', () => {
  for (const patch of [
    {},
    { entrypoint: null, environment: null },
    { props: { caller: 'beauty-billing-worker' } },
  ])
    assert.doesNotThrow(() =>
      validateSettings(
        changed('OPERATIONS_SERVICE', patch),
        'billing',
        configurations.billing,
      ),
    );
  for (const patch of [
    { service: 'other-worker' },
    { entrypoint: 'OtherEntrypoint' },
    { environment: 'production' },
    { props: { caller: 'browser' } },
    { props: null },
    { props: [] },
    { entrypoint: '' },
    { environment: 7 },
  ])
    assert.throws(() =>
      validateSettings(
        changed('OPERATIONS_SERVICE', patch),
        'billing',
        configurations.billing,
      ),
    );
  const config = structuredClone(configurations.billing);
  config.services[0].entrypoint = 'ApprovedEntrypoint';
  config.services[0].environment = 'approved';
  assert.doesNotThrow(() =>
    validateSettings(
      changed('OPERATIONS_SERVICE', {
        entrypoint: 'ApprovedEntrypoint',
        environment: 'approved',
      }),
      'billing',
      config,
    ),
  );
});
test('blocks missing, duplicate, mistyped and unknown bindings; unknown names never reach diagnostics', () => {
  assert.throws(
    () =>
      validateSettings(
        {
          bindings: settings('billing').bindings.filter(
            (binding) => binding.name !== 'D1_DATABASE',
          ),
        },
        'billing',
        configurations.billing,
      ),
    { code: 'BINDING_MISSING', binding: 'D1_DATABASE' },
  );
  assert.throws(
    () =>
      validateSettings(
        changed('D1_DATABASE', { type: 'r2_bucket', bucket_name: 'beauty-r2' }),
        'billing',
        configurations.billing,
      ),
    { code: 'BINDING_MISMATCH', binding: 'D1_DATABASE' },
  );
  assert.throws(
    () =>
      validateSettings(
        {
          bindings: [
            ...settings('billing').bindings,
            settings('billing').bindings.find(
              (binding) => binding.name === 'D1_DATABASE',
            ),
          ],
        },
        'billing',
        configurations.billing,
      ),
    { code: 'REMOTE_RESPONSE_INVALID', binding: 'D1_DATABASE' },
  );
  for (const worker of ['billing', 'clinical'])
    for (const type of ['r2_bucket', 'plain_text', 'secret_text'])
      assert.throws(
        () =>
          validateSettings(
            {
              bindings: [
                ...settings(worker).bindings,
                {
                  name: 'PRIVATE_UNKNOWN_NAME',
                  type,
                  bucket_name: 'private-bucket',
                  text: 'private-value',
                },
              ],
            },
            worker,
            configurations[worker],
          ),
        (error) => {
          assert.equal(error.code, 'BINDING_MISMATCH');
          assert.equal(diagnostic(error).binding, undefined);
          assert.ok(!JSON.stringify(diagnostic(error)).includes('PRIVATE'));
          return true;
        },
      );
  assert.equal(
    diagnostic(
      new DeploymentValidationError('BINDING_MISMATCH', {
        binding: 'ARBITRARY',
      }),
    ).binding,
    undefined,
  );
});
test('allows explicit old bindings only during preflight, with modern and legacy transition aliases', () => {
  for (const fields of [{ database_id: db }, { id: db }]) {
    const config = structuredClone(configurations.billing);
    config.d1_databases[0].database_id = '87654321-4321-4321-4321-cba987654321';
    const transitions = [
      {
        name: 'D1_DATABASE',
        previous: { name: 'D1_DATABASE', type: 'd1', ...fields },
        reason: 'reviewed database transition',
      },
    ];
    assert.doesNotThrow(() =>
      validateSettings(settings('billing'), 'billing', config, { transitions }),
    );
    for (const phase of ['postcheck', 'audit', 'readiness'])
      assert.throws(
        () =>
          validateSettings(settings('billing'), 'billing', config, {
            phase,
            transitions,
          }),
        { code: 'BINDING_MISMATCH' },
      );
    const candidate = structuredClone(manifest);
    candidate.workers.billing.transitions = transitions;
    assert.doesNotThrow(() => validateManifest(candidate, manifest));
    candidate.workers.billing.transitions[0].previous.id = 'conflicting';
    if (fields.database_id)
      assert.throws(() => validateManifest(candidate, manifest), {
        code: 'MANIFEST_INVALID',
      });
  }
});
test('supports service selector transitions and rejects unapproved selector mismatches', () => {
  const previous = {
    name: 'OPERATIONS_SERVICE',
    type: 'service',
    service: 'old-worker',
    entrypoint: 'OldApi',
    environment: 'old',
  };
  const transitions = [
    { name: previous.name, previous, reason: 'approved service transition' },
  ];
  const state = changed('OPERATIONS_SERVICE', previous);
  validateSettings(state, 'billing', configurations.billing, { transitions });
  assert.throws(() =>
    validateSettings(state, 'billing', configurations.billing, {
      transitions,
      phase: 'postcheck',
    }),
  );
  const candidate = structuredClone(manifest);
  candidate.workers.billing.transitions = transitions;
  validateManifest(candidate, manifest);
});
test('known transition-only names are safe to diagnose and unknown values remain omitted', () => {
  const state = {
    bindings: [
      ...settings('billing').bindings,
      {
        name: 'LEGACY_SERVICE',
        type: 'service',
        service: 'unexpected-private-destination',
      },
    ],
  };
  const transitions = [
    {
      name: 'LEGACY_SERVICE',
      previous: {
        name: 'LEGACY_SERVICE',
        type: 'service',
        service: 'approved-previous',
      },
      reason: 'approved removal',
    },
  ];
  assert.throws(
    () =>
      validateSettings(state, 'billing', configurations.billing, {
        transitions,
      }),
    (error) => {
      assert.equal(diagnostic(error).binding, 'LEGACY_SERVICE');
      assert.ok(
        !JSON.stringify(diagnostic(error)).includes('unexpected-private'),
      );
      return true;
    },
  );
});
test('the shared diagnostic remains identical in CLI JSON, partial artifacts and summary serialization', async () => {
  const f = fixture((path) =>
    path.includes('beauty-billing-worker/settings')
      ? response(changed('D1_DATABASE', { database_id: 'wrong-private-id' }))
      : undefined,
  );
  const snapshots = [];
  const report = await release({
    ...f,
    context: {
      worker: 'all',
      mode: 'deploy',
      commitSha: sha,
      requestId: 'diagnostic-proof',
    },
    manifest,
    configurations,
    publish: () => assert.fail('must not publish'),
    persist: (value) => snapshots.push(structuredClone(value)),
  });
  assert.equal(report.failure.binding, 'D1_DATABASE');
  assert.equal(report.cloudflare.calls, 1);
  assert.equal(report.workers.length, 0);
  const cli = JSON.stringify(report.failure),
    artifact = JSON.stringify(snapshots),
    summary = JSON.stringify(report.failure);
  assert.equal(cli, summary);
  assert.ok(artifact.includes('D1_DATABASE'));
  for (const output of [cli, artifact, summary])
    assert.ok(!output.includes('wrong-private-id'));
});
test('installed Wrangler upload metadata retains configured service props', () => {
  const source = readFileSync(
    'node_modules/wrangler/wrangler-dist/cli.js',
    'utf8',
  );
  const loop = source.match(/  services\.forEach\([^]*?\n  \);/)?.[0];
  assert.ok(loop, 'Wrangler must expose the upload service serialization');
  for (const config of Object.values(configurations)) {
    const actual = runInNewContext(`${loop}\nmetadataBindings`, {
      services: config.services,
      metadataBindings: [],
    });
    const uploaded = JSON.parse(JSON.stringify(actual));
    assert.equal(uploaded.length, config.services.length);
    for (const binding of uploaded) {
      const expected = config.services.find(
        (service) => service.binding === binding.name,
      );
      assert.equal(binding.service, expected.service);
      assert.deepEqual(binding.props, expected.props);
    }
  }
});
