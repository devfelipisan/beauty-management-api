import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertProfessionalAuthorization } from '@beauty/kernel/application/actor-authorization';
const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  membership: vi.fn(),
  upload: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@beauty/tenancy/adapters/worker-security', () => ({
  workerSecurity: () => ({
    identity: { authenticate: mocks.authenticate },
    membership: { findActiveMembership: mocks.membership },
  }),
}));
vi.mock('./composition-root.js', () => ({
  OperationsComposition: class {
    profileImages() {
      return { upload: mocks.upload, get: mocks.get, remove: mocks.remove };
    }
  },
}));
import { profileMediaRoute } from './profile-media-routes.js';

const request = (
  method: string,
  headers: Record<string, string> = {},
  body?: Uint8Array,
) =>
  new Request(
    'https://operations.test/tenants/tenant/profile-images/customer/customer',
    {
      method,
      headers: {
        authorization: 'Bearer fixture',
        'content-type': 'image/jpeg',
        ...headers,
      },
      body,
    },
  );
describe('profile HTTP authority and binary contract', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authenticate.mockResolvedValue({ actorId: 'actor' });
    mocks.membership.mockResolvedValue({
      permissions: ['customer.read', 'customer.update'],
    });
    mocks.upload.mockImplementation(async (input) => {
      assertProfessionalAuthorization(input, '');
      return { version: 1 };
    });
  });
  it('accepts binary data, calculates the checksum and attaches verified authority', async () => {
    const result = await profileMediaRoute(
      request(
        'PUT',
        { 'if-match': '"0"', 'idempotency-key': 'one' },
        new Uint8Array([255, 216, 255, 0]),
      ),
      { MAX_PROFILE_IMAGE_BYTES: '300000' } as never,
    );
    expect(result?.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant',
        ownerId: 'customer',
        actorId: 'actor',
        expectedVersion: 0,
        sizeBytes: 4,
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });
  it('rejects absent authentication, mutation with read permission and professional scope before application access', async () => {
    const unauthenticated = request('DELETE', {
      'if-match': '"0"',
      'idempotency-key': 'one',
    });
    unauthenticated.headers.delete('authorization');
    expect(
      (
        await profileMediaRoute(unauthenticated, {
          MAX_PROFILE_IMAGE_BYTES: '300000',
        } as never)
      )?.status,
    ).toBe(401);
    mocks.membership.mockResolvedValueOnce({ permissions: ['customer.read'] });
    expect(
      (
        await profileMediaRoute(
          request('DELETE', { 'if-match': '"0"', 'idempotency-key': 'one' }),
          { MAX_PROFILE_IMAGE_BYTES: '300000' } as never,
        )
      )?.status,
    ).toBe(403);
    mocks.membership.mockResolvedValueOnce({
      permissions: ['customer.update'],
      professionalId: 'professional',
    });
    expect(
      (
        await profileMediaRoute(
          request('DELETE', { 'if-match': '"0"', 'idempotency-key': 'one' }),
          { MAX_PROFILE_IMAGE_BYTES: '300000' } as never,
        )
      )?.status,
    ).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('rejects excessive and inconsistent declared lengths without forwarding a command', async () => {
    for (const length of ['300001', '3']) {
      const result = await profileMediaRoute(
        request(
          'PUT',
          {
            'if-match': '"0"',
            'idempotency-key': 'one',
            'content-length': length,
          },
          new Uint8Array([255, 216, 255, 0]),
        ),
        { MAX_PROFILE_IMAGE_BYTES: '300000' } as never,
      );
      expect(result?.status).toBe(400);
    }
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
