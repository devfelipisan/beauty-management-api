import { observedHttpRequest } from './index.js';

describe('structured HTTP observations', () => {
  it('rejects caller-supplied authority before invoking a command', async () => {
    const handle = vi.fn(async () => new Response());
    const response = await observedHttpRequest(
      new Request('https://api.test/command', {
        method: 'POST',
        body: JSON.stringify({ actorId: 'forged' }),
      }),
      'worker',
      'sha',
      false,
      handle,
    );
    expect(response.status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });
  it('propagates context and never logs credentials or resource paths', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const response = await observedHttpRequest(
        new Request(
          'https://api.test/tenants/private-tenant/customers/private-person',
          {
            headers: {
              authorization: 'Bearer private-credential',
              'x-request-id': 'request',
              'x-correlation-id': 'correlation',
            },
          },
        ),
        'worker',
        'sha',
        true,
        async (request) => {
          expect(request.headers.get('x-request-id')).toBe('request');
          return new Response(null, { status: 204 });
        },
      );
      expect(response.status).toBe(204);
      const output = log.mock.calls[0][0] as string;
      expect(JSON.parse(output)).toMatchObject({
        service: 'worker',
        version: 'sha',
        status: 204,
        requestId: 'request',
        correlationId: 'correlation',
      });
      expect(output).not.toMatch(/private-/);
    } finally {
      log.mockRestore();
    }
  });
});
