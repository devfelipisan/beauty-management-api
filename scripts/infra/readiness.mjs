import { fail } from '../deploy/errors.mjs';
import { validateSettings, publishedWorker } from '../deploy/worker-state.mjs';
import { checkWorkerControls } from '../deploy/postcheck.mjs';
export async function infrastructureReadiness({
  client,
  configurations,
  context = {},
  phase = 'readiness',
  approveMedia = true,
  checkR2 = true,
  runtimeText = {},
  bindingTransitions = {},
}) {
  for (const [name, configuration] of Object.entries(configurations)) {
    const state = await publishedWorker(client, name, { context, phase });
    validateSettings(state.settings, name, configuration, {
      phase,
      context,
      expectedText: runtimeText[name],
      transitions: bindingTransitions[name] ?? [],
    });
    await checkWorkerControls(client, name, configuration, context, phase);
  }
  const db = configurations.operations.d1_databases[0];
  const database = await client.request(`/d1/database/${db.database_id}`, {
    operation: 'database.metadata',
    phase,
  });
  if (database?.name !== db.database_name)
    fail('RESOURCE_MISMATCH', {
      ...context,
      phase,
      operation: 'database.metadata',
    });
  if (!checkR2) return;
  const bucket = await client.request('/r2/buckets/beauty-r2', {
    operation: 'bucket.metadata',
    phase,
  });
  if (bucket?.name !== 'beauty-r2')
    fail('RESOURCE_MISMATCH', {
      ...context,
      phase,
      operation: 'bucket.metadata',
    });
  const managed = await client.request(
    '/r2/buckets/beauty-r2/domains/managed',
    { operation: 'bucket.managed-domain', phase },
  );
  const custom = await client.request('/r2/buckets/beauty-r2/domains/custom', {
    operation: 'bucket.custom-domains',
    phase,
  });
  if (
    managed?.enabled !== false ||
    !Array.isArray(custom?.domains) ||
    custom.domains.some((d) => d.enabled !== false)
  )
    fail('BUCKET_PUBLIC', { ...context, phase, operation: 'bucket.metadata' });
  if (approveMedia) {
    const result = await client.request(
      `/d1/database/${db.database_id}/query`,
      {
        phase,
        operation: 'media.approvals',
        body: {
          sql: 'SELECT inventory_approved,policy_approved,writers_coordinated,approval_reference,charged_bytes,limit_bytes FROM media_capacity WHERE bucket=?',
          params: ['beauty-r2'],
        },
      },
    );
    const value = result?.[0]?.results?.[0];
    if (
      result?.[0]?.success !== true ||
      !value ||
      !Number.isSafeInteger(value.charged_bytes) ||
      value.charged_bytes < 0 ||
      value.limit_bytes !== 8_000_000_000 ||
      value.charged_bytes > value.limit_bytes
    )
      fail('CAPACITY_RESPONSE_INVALID', {
        ...context,
        phase,
        operation: 'media.approvals',
      });
    if (value.inventory_approved !== 1)
      fail('CAPACITY_INVENTORY_PENDING', {
        ...context,
        phase,
        operation: 'media.approvals',
      });
    if (
      value.policy_approved !== 1 ||
      typeof value.approval_reference !== 'string' ||
      !value.approval_reference.trim()
    )
      fail('CAPACITY_POLICY_PENDING', {
        ...context,
        phase,
        operation: 'media.approvals',
      });
    if (value.writers_coordinated !== 1)
      fail('CAPACITY_WRITERS_PENDING', {
        ...context,
        phase,
        operation: 'media.approvals',
      });
  }
}
