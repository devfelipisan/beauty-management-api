import { RequestIdMiddleware, resolveSafeId } from './request-id.middleware.js';

describe('RequestIdMiddleware', () => {
  it('generates an id when the inbound id is absent or invalid', () => {
    expect(resolveSafeId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveSafeId('x'.repeat(129))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('preserves a valid inbound id and returns it in the response', () => {
    const request = {
      header: () => 'request-123',
      headers: {},
    } as never;
    const headers = new Map<string, string>();
    const response = { setHeader: (key: string, value: string) => headers.set(key, value) } as never;
    let called = false;

    new RequestIdMiddleware().use(request, response, () => { called = true; });

    expect((request as { requestId: string }).requestId).toBe('request-123');
    expect(headers.get('x-request-id')).toBe('request-123');
    expect(called).toBe(true);
  });
});
