import { AuthenticationGuard } from './authentication.guard.js';

function requestContext(request: Record<string, unknown>) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as never;
}

describe('AuthenticationGuard', () => {
  it('authenticates without requiring the optional execution-context middleware', async () => {
    const identity = { actorId: 'actor', subject: 'subject' };
    const authenticate = vi.fn().mockResolvedValue(identity);
    const request = { header: () => 'bearer signed-token' };
    expect(
      await new AuthenticationGuard({ authenticate }).canActivate(
        requestContext(request),
      ),
    ).toBe(true);
    expect(authenticate).toHaveBeenCalledWith('signed-token');
    expect(request).toMatchObject({ user: identity });
  });
  const provider = {
    authenticate: async (token: string) =>
      token === 'valid-token'
        ? { actorId: 'actor-1', subject: 'subject-1' }
        : null,
  };

  it('rejects missing and invalid bearer tokens', async () => {
    const guard = new AuthenticationGuard(provider);
    await expect(
      guard.canActivate(requestContext({ header: () => undefined })),
    ).rejects.toMatchObject({
      response: { code: 'AUTHENTICATION_REQUIRED' },
    });
    await expect(
      guard.canActivate(requestContext({ header: () => 'Bearer invalid' })),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_AUTHENTICATION' },
    });
  });

  it('resolves the actor and enriches request context', async () => {
    const request = {
      header: () => 'Bearer valid-token',
      executionContext: { requestId: 'r-1', correlationId: 'c-1' },
    };
    await expect(
      new AuthenticationGuard(provider).canActivate(requestContext(request)),
    ).resolves.toBe(true);
    expect(request).toMatchObject({
      user: { actorId: 'actor-1', subject: 'subject-1' },
      executionContext: { actorId: 'actor-1' },
    });
  });
});
