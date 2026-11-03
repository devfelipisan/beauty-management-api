import { vi } from 'vitest';
import { handleProfessionals } from './worker-routes.js';
import type { OperationsComposition } from '../composition-root.js';
import { listProfessionals } from '../composition-root.js';

vi.mock('../composition-root.js', () => ({ listProfessionals: vi.fn() }));

vi.mock('@beauty/tenancy/adapters/worker-security', () => ({
  workerSecurity: () => ({
    identity: { authenticate: async () => ({ actorId: 'actor' }) },
    membership: { findActiveMembership: async () => ({ permissions: [] }) },
  }),
}));

it('requires professional.read before executing the list use case', async () => {
  const response = await handleProfessionals(
    new Request('https://operations.test/tenants/tenant/professionals', {
      headers: { authorization: 'Bearer authenticated' },
    }),
    { env: {} } as unknown as OperationsComposition,
  );
  expect(response?.status).toBe(403);
  expect(await response?.json()).toMatchObject({ code: 'PERMISSION_DENIED' });
  expect(listProfessionals).not.toHaveBeenCalled();
});
