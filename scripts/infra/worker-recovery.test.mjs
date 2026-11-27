import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  configurations,
  fixture,
  response,
  settings,
} from '../deploy/fixtures.mjs';
import { workerConfigurations } from '../deploy/config-contract.mjs';
import { fail } from '../deploy/errors.mjs';
import { applyRecovery, prepareRecovery } from './worker-recovery.mjs';

const id = (tail) => `12345678-1234-1234-1234-123456789ab${tail}`;
const target = id(0);
const unknown = id(1);
const failure = {
  code: 'PROVENANCE_UNAVAILABLE',
  provenanceReason: 'NO_ACCEPTED_RECORD',
  hasVersionRecord: false,
  versionId: unknown,
  worker: 'billing',
  phase: 'provenance',
  operation: 'github.deployment',
};

function setup() {
  const state = {
    billing: { id: id(2), version: unknown },
    clinical: { id: id(3), version: id(4) },
    operations: { id: id(5), version: id(6) },
  };
  const deployment = ({ id, version }) => ({
    id,
    versions: [{ version_id: version, percentage: 100 }],
  });
  const { client, github } = fixture((path) => {
    const worker = path.match(
      /beauty-(operations|billing|clinical)-worker/,
    )?.[1];
    if (path.endsWith('/deployments')) {
      const history =
        worker === 'billing' ? [{ id: id(7), version: target }] : [];
      return response({
        deployments: [state[worker], ...history].map(deployment),
      });
    }
    if (path.endsWith(`/versions/${target}`))
      return response({
        id: target,
        resources: { bindings: settings(worker).bindings },
      });
  });
  const provenance = github.provenanceByVersion;
  github.provenanceByVersion = async (worker, versionId) => {
    if (versionId === unknown) fail(failure.code, failure);
    return { ...(await provenance(worker)), versionId };
  };
  github.file = async (file) =>
    JSON.stringify(
      configurations[
        Object.keys(workerConfigurations).find(
          (worker) => workerConfigurations[worker] === file,
        )
      ],
    );
  return { client, github, state };
}

test('plan selects a historical verified version and apply restores only the affected Worker', async () => {
  const deps = setup();
  const plan = await prepareRecovery({ ...deps, failure });
  assert.equal(plan.status, 'ready');
  assert.equal(plan.target, target);
  assert.equal(deps.state.billing.version, unknown);
  const result = await applyRecovery({
    ...deps,
    plan,
    deploy: async (worker, version) => {
      assert.equal(worker, 'billing');
      deps.state[worker] = { id: id(8), version };
    },
  });
  assert.equal(result.status, 'restored');
  assert.equal(result.published.billing.versionId, target);
});

test('recovery ignores other failures and rejects deployment changes before writing', async () => {
  const deps = setup();
  const ignored = await prepareRecovery({
    ...deps,
    failure: { ...failure, hasVersionRecord: true },
  });
  assert.equal(ignored.status, 'not_applicable');
  const plan = await prepareRecovery({ ...deps, failure });
  deps.state.clinical.id = id(9);
  await assert.rejects(applyRecovery({ ...deps, plan, deploy: assert.fail }), {
    code: 'PUBLISHED_VERSION_MISMATCH',
  });
});
