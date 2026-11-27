import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fixture,
  configurations,
  settings,
  response,
} from '../deploy/fixtures.mjs';
import { workerConfigurations } from '../deploy/config-contract.mjs';
import { recoverOperations } from './recover-operations.mjs';

const versions = {
  operations: '08d84654-2c06-43b1-99db-f9ac2e123b5c',
  billing: 'eb1a856d-c2db-4ef4-af51-3303c2ebebea',
  clinical: 'ae3ee167-ecb8-4c03-a014-f63b89d36611',
};
const previous = 'b1a2bc02-eb8f-40d8-a1af-ecdc92046b57';
const deployment = '06447e36-33bb-4b9e-8a94-d6b1e5aabf87';
const commitSha = '80e8ad53734af43dba508d2db1942cc10c2e37d8';

function scenario({
  changedBeforeWrite = false,
  invalidBindings = false,
} = {}) {
  let active = previous;
  let reads = 0;
  let writes = 0;
  const { client, github } = fixture((path) => {
    const worker = path.match(
      /beauty-(operations|billing|clinical)-worker/,
    )?.[1];
    if (path.endsWith('/deployments')) {
      if (worker === 'operations') reads++;
      return response({
        deployments: [
          {
            id:
              changedBeforeWrite && reads > 1
                ? 'different-deployment'
                : deployment,
            versions: [
              {
                version_id: worker === 'operations' ? active : versions[worker],
                percentage: 100,
              },
            ],
          },
        ],
      });
    }
    if (path.endsWith(`/versions/${versions.operations}`))
      return response({
        id: versions.operations,
        resources: {
          bindings: invalidBindings ? [] : settings('operations').bindings,
        },
      });
  });
  const provenance = github.provenanceByVersion;
  github.provenanceByVersion = async (worker, versionId) => {
    assert.equal(versionId, versions[worker]);
    return { ...(await provenance(worker)), commitSha, versionId };
  };
  github.file = async (file, sha) => {
    assert.equal(sha, commitSha);
    const worker = Object.keys(workerConfigurations).find(
      (name) => workerConfigurations[name] === file,
    );
    return JSON.stringify(configurations[worker]);
  };
  return {
    client,
    github,
    deploy: async () => {
      writes++;
      active = versions.operations;
    },
    writes: () => writes,
  };
}

test('recovery plans without writing, restores the existing version once and verifies retries', async () => {
  const state = scenario();
  assert.equal(
    (await recoverOperations({ ...state, deploy: undefined })).status,
    'ready',
  );
  assert.equal(state.writes(), 0);
  assert.equal((await recoverOperations(state)).status, 'restored');
  assert.equal((await recoverOperations(state)).status, 'already_restored');
  assert.equal(state.writes(), 1);
});

test('recovery blocks incompatible bindings and a deployment change before writing', async () => {
  for (const [options, code] of [
    [{ invalidBindings: true }, 'BINDING_MISSING'],
    [{ changedBeforeWrite: true }, 'PUBLISHED_VERSION_MISMATCH'],
  ]) {
    const state = scenario(options);
    await assert.rejects(recoverOperations(state), { code });
    assert.equal(state.writes(), 0);
  }
});
