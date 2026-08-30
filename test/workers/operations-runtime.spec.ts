import { env, exports } from 'cloudflare:workers';
import { invokeClinicalAssessment, invokeCommercialTerms } from '../../apps/operations-worker/src/worker.js';
import { describe, expect, it } from 'vitest';

const worker = exports.default as {
  fetch(request: Request): Promise<Response>;
};

describe('Operations Worker physical runtime', () => {
  it('serves health through the workerd runtime', async () => {
    const response = await worker.fetch(new Request('https://operations.test/health'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ service: 'beauty-operations-worker' });
  });

  it('returns 404 for an unknown route', async () => {
    const response = await worker.fetch(new Request('https://operations.test/not-found'));

    expect(response.status).toBe(404);
  });

  it('reaches Clinical and Billing through real service bindings', async () => {
    const clinical = await invokeClinicalAssessment(env as never, {
      tenantId: 'tenant-dev-001', customerId: 'customer-1', serviceId: 'service-1', professionalId: '',
    });
    const billing = await invokeCommercialTerms(env as never, {
      tenantId: 'tenant-dev-001', customerId: 'customer-1', serviceId: 'service-1', basePriceCents: 1000,
    });

    expect(clinical).toMatchObject({ eligible: false });
    expect(billing).toMatchObject({ status: 'BLOCKED' });
  });

  it('preserves request and correlation context across concurrent requests', async () => {
    const responses = await Promise.all(Array.from({ length: 100 }, (_, index) => {
      const requestId = `context-${index}`;
      const correlationId = `correlation-${index}`;
      return worker.fetch(new Request('https://operations.test/tenants/tenant-dev-001/customers', {
        headers: {
          authorization: 'Bearer actor-dev-admin',
          'x-request-id': requestId,
          'x-correlation-id': correlationId,
        },
      })).then((response) => ({ response, requestId, correlationId }));
    }));

    const leaks = responses.filter(({ response, requestId, correlationId }) =>
      response.headers.get('x-request-id') !== requestId || response.headers.get('x-correlation-id') !== correlationId,
    );
    expect(leaks).toHaveLength(0);
  });
});
