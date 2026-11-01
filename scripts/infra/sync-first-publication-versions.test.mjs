import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check } from 'prettier';
import { syncFirstPublicationVersions } from './sync-first-publication-versions.mjs';
import { releaseOrder } from '../deploy/config-contract.mjs';
const version = '12345678-1234-1234-1234-123456789abc';
function fixture(t, patch = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'beauty-sync-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'request.json');
  const request = {
    commitSha: 'a'.repeat(40),
    authorizationReference: 'review-auth',
    compatibilityReference: 'review-ci',
    recoveryReference: 'review-recovery',
    maintenanceReference: 'review-window',
    workers: {},
  };
  patch(request);
  writeFileSync(file, '\n' + JSON.stringify(request));
  const original = readFileSync(file, 'utf8');
  const calls = [];
  const env = {
    CLOUDFLARE_ACCOUNT_ID: '9'.repeat(32),
    CLOUDFLARE_API_TOKEN: 'private-token-fixture',
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        success: true,
        result: {
          deployments: [
            {
              id: version,
              versions: [{ version_id: version, percentage: 100 }],
            },
          ],
        },
      }),
    };
  };
  return { file, request, original, calls, env, fetchImpl };
}
test('collects exactly three deployments GETs, preserves references and writes Prettier-compliant JSON', async (t) => {
  const f = fixture(t);
  const result = await syncFirstPublicationVersions(f);
  assert.equal(result.cloudflareCalls, 3);
  assert.equal(f.calls.length, 3);
  assert.ok(
    f.calls.every(
      ({ url, options }) =>
        options.method === 'GET' && url.endsWith('/deployments'),
    ),
  );
  assert.ok(
    f.calls.every(
      ({ url }) => !url.includes('/query') && !url.includes('/r2/'),
    ),
  );
  const text = readFileSync(f.file, 'utf8'),
    actual = JSON.parse(text);
  assert.equal(actual.commitSha, f.request.commitSha);
  for (const field of [
    'authorizationReference',
    'compatibilityReference',
    'recoveryReference',
    'maintenanceReference',
  ])
    assert.equal(actual[field], f.request[field]);
  assert.deepEqual(Object.keys(actual.workers), releaseOrder);
  assert.ok(await check(text, { filepath: f.file }));
  assert.ok(!JSON.stringify(result).includes(f.env.CLOUDFLARE_API_TOKEN));
});
test('matching pinned IDs remain unchanged and repeat runs do not change the file', async (t) => {
  const f = fixture(t, (request) => {
    request.workers = Object.fromEntries(
      releaseOrder.map((worker) => [worker, { versionId: version }]),
    );
  });
  await syncFirstPublicationVersions(f);
  const formatted = readFileSync(f.file, 'utf8');
  await syncFirstPublicationVersions(f);
  assert.equal(readFileSync(f.file, 'utf8'), formatted);
  assert.equal(f.calls.length, 6);
});
test('changed remote versions never replace a pinned authorization', async (t) => {
  const f = fixture(t, (request) => {
    request.workers.billing = {
      versionId: '11111111-1111-1111-1111-111111111111',
    };
  });
  await assert.rejects(syncFirstPublicationVersions(f), {
    code: 'PUBLISHED_VERSION_MISMATCH',
    worker: 'billing',
  });
  assert.equal(readFileSync(f.file, 'utf8'), f.original);
});
test('split traffic, malformed versions and denied third request leave the entire file untouched', async (t) => {
  for (const mode of ['split', 'malformed', 'denied']) {
    const f = fixture(t),
      normal = f.fetchImpl;
    f.fetchImpl = async (url, options) => {
      if (url.includes('beauty-operations-worker')) {
        if (mode === 'denied') return { ok: false, status: 403 };
        f.calls.push({ url, options });
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: {
              deployments: [
                {
                  versions: [
                    {
                      version_id: mode === 'malformed' ? 'invalid' : version,
                      percentage: mode === 'split' ? 50 : 100,
                    },
                  ],
                },
              ],
            },
          }),
        };
      }
      return normal(url, options);
    };
    await assert.rejects(syncFirstPublicationVersions(f));
    assert.equal(readFileSync(f.file, 'utf8'), f.original);
  }
});
test('invalid contracts and unknown existing worker fields are not silently discarded', async (t) => {
  for (const patch of [
    (r) => {
      r.commitSha = 'invalid';
    },
    (r) => {
      r.workers.billing = { versionId: version, unapproved: true };
    },
    (r) => {
      r.workers.unknown = { versionId: version };
    },
  ]) {
    const f = fixture(t, patch);
    await assert.rejects(syncFirstPublicationVersions(f), {
      code: 'FIRST_PUBLICATION_NOT_APPROVED',
    });
    assert.equal(readFileSync(f.file, 'utf8'), f.original);
  }
});
test('concurrent local changes are preserved instead of being overwritten', async (t) => {
  const f = fixture(t),
    normal = f.fetchImpl;
  f.fetchImpl = async (url, options) => {
    if (url.includes('beauty-operations-worker'))
      writeFileSync(f.file, 'concurrent user edit\n');
    return normal(url, options);
  };
  await assert.rejects(syncFirstPublicationVersions(f), {
    code: 'INVALID_REQUEST',
  });
  assert.equal(readFileSync(f.file, 'utf8'), 'concurrent user edit\n');
});
