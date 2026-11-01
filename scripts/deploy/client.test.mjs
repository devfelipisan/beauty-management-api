import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloudflareClient } from './cloudflare-client.mjs';
import { validateSettings } from './worker-state.mjs';
import { diagnostic } from './errors.mjs';
import { configurations, settings, response } from './fixtures.mjs';
test('administrative reads are cached only for an execution and invalidated after mutation', async () => {
  let count = 0;
  const client = cloudflareClient({
    accountId: 'fixture',
    apiToken: 'private',
    fetchImpl: async () => {
      count++;
      return response({});
    },
  });
  await Promise.all([
    client.request('/workers', { operation: 'worker.settings' }),
    client.request('/workers', { operation: 'worker.settings' }),
  ]);
  assert.equal(count, 1);
  client.invalidate();
  await client.request('/workers', { operation: 'worker.settings' });
  assert.equal(count, 2);
  await assert.rejects(
    client.request('/query', {
      body: { sql: 'UPDATE media_capacity SET policy_approved=1' },
    }),
    { code: 'INVALID_REQUEST' },
  );
  await assert.rejects(client.request('//external'), {
    code: 'INVALID_REQUEST',
  });
  assert.equal(count, 2);
});
test('upstream failures are classified without raw URLs, tokens or response bodies', async () => {
  for (const [fetchImpl, code] of [
    [
      async () => {
        throw new Error('sensitive');
      },
      'REMOTE_TRANSPORT_ERROR',
    ],
    [async () => ({ ok: false, status: 403 }), 'REMOTE_ACCESS_DENIED'],
    [async () => ({ ok: false, status: 401 }), 'REMOTE_UNAUTHENTICATED'],
    [
      async () => ({
        ok: true,
        json: async () => {
          throw new Error('sensitive');
        },
      }),
      'REMOTE_RESPONSE_INVALID',
    ],
    [
      async () => ({
        ok: true,
        json: async () => ({ success: false, errors: ['sensitive'] }),
      }),
      'REMOTE_RESPONSE_INVALID',
    ],
  ]) {
    const client = cloudflareClient({
      accountId: 'fixture',
      apiToken: 'sensitive',
      fetchImpl,
    });
    await assert.rejects(
      client.request('/private', { operation: 'worker.settings' }),
      (error) => {
        assert.equal(error.code, code);
        assert.ok(!JSON.stringify(diagnostic(error)).includes('sensitive'));
        return true;
      },
    );
  }
});
test('native secret presence is delegated to Wrangler, but plaintext JWT is rejected', () => {
  validateSettings(settings('billing'), 'billing', configurations.billing);
  for (const binding of [
    { name: 'AUTH_ISSUER', type: 'plain_text', text: 'private' },
    { name: 'OTHER_BUCKET', type: 'r2_bucket', bucket_name: 'beauty-r2' },
  ]) {
    assert.throws(() =>
      validateSettings(
        { bindings: [...settings('billing').bindings, binding] },
        'billing',
        configurations.billing,
      ),
    );
  }
});
test('approved previous binding is accepted only before deployment; arbitrary bindings fail', () => {
  const state = settings('operations');
  state.bindings = state.bindings.filter((b) => b.name !== 'PROFILE_MEDIA');
  const transitions = [
    { name: 'PROFILE_MEDIA', previous: null, reason: 'approved addition' },
  ];
  validateSettings(state, 'operations', configurations.operations, {
    transitions,
  });
  assert.throws(
    () =>
      validateSettings(state, 'operations', configurations.operations, {
        phase: 'postcheck',
        transitions,
      }),
    { code: 'BINDING_MISSING' },
  );
  assert.throws(
    () => validateSettings(state, 'operations', configurations.operations),
    { code: 'BINDING_MISSING' },
  );
});
