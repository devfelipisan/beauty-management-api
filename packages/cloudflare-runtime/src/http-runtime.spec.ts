import * as sourceRuntime from './index.js';
import * as publicRuntime from '@beauty/cloudflare-runtime';

describe.each([sourceRuntime, publicRuntime])(
  'HTTP runtime helpers',
  (runtime) => {
    const {
      dispatchHealth,
      ids,
      json,
      mappedError,
      notFound,
      observedHttpRequest,
    } = runtime;
    it('exposes working health and not-found responses through the package entrypoint', async () => {
      expect(
        await publicRuntime
          .dispatchHealth(
            new Request('https://api.test/health'),
            'public-service',
          )!
          .json(),
      ).toMatchObject({ service: 'public-service' });
      expect(await publicRuntime.notFound().json()).toMatchObject({
        code: 'NOT_FOUND',
      });
    });
    it('serves GET health only and preserves explicit/default version', async () => {
      const health = dispatchHealth(
        new Request('https://api.test/health'),
        'service',
      );
      expect(await health!.json()).toEqual({
        status: 'ok',
        service: 'service',
        version: 'local',
      });
      expect(
        await dispatchHealth(
          new Request('https://api.test/health'),
          'service',
          'sha',
        )!.json(),
      ).toMatchObject({ version: 'sha' });
      expect(
        dispatchHealth(new Request('https://api.test/other'), 'service'),
      ).toBeUndefined();
      expect(
        dispatchHealth(
          new Request('https://api.test/health', { method: 'POST' }),
          'service',
        ),
      ).toBeUndefined();
      expect(notFound().status).toBe(404);
      expect(await notFound().json()).toEqual({
        status: 'error',
        code: 'NOT_FOUND',
      });
    });
    it('supports responses without correlation metadata and validates incoming IDs', async () => {
      const response = json({ data: 1 });
      expect(response.headers.has('x-request-id')).toBe(false);
      expect(response.headers.has('x-correlation-id')).toBe(false);
      expect(await response.json()).toEqual({ data: 1 });
      expect(
        ids(
          new Request('https://api.test', {
            headers: {
              'x-request-id': 'request',
              'x-correlation-id': 'correlation',
            },
          }),
        ),
      ).toEqual({ requestId: 'request', correlationId: 'correlation' });
      const generated = ids(
        new Request('https://api.test', {
          headers: {
            'x-request-id': 'invalid /',
            'x-correlation-id': 'invalid /',
          },
        }),
      );
      expect(generated.requestId).toMatch(/^[a-f0-9-]{36}$/);
      expect(generated.correlationId).toBe(generated.requestId);
    });
    it('maps explicit public error codes and reasons and keeps unknown primitives generic', async () => {
      const reasons = ['TIME_CONFLICT'];
      const response = mappedError(
        { code: 'VALIDATION_ERROR', reasons },
        'request',
        'correlation',
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'VALIDATION_ERROR',
        reasons,
      });
      for (const error of [
        null,
        'private text',
        { code: 1 },
        { code: 'UNKNOWN', reasons: ['secret'] },
      ]) {
        expect(await mappedError(error, 'r', 'c').json()).toMatchObject({
          code: 'INTERNAL_ERROR',
          message: 'Internal error',
        });
      }
      expect(
        await mappedError(
          { code: 'VALIDATION_ERROR', reasons: 'invalid-shape' },
          'r',
          'c',
        ).json(),
      ).not.toHaveProperty('reasons');
    });
    it('accepts a validated JSON command, preserving its body for the handler and using a default version in safe logs', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        const handle = vi.fn(async (request: Request) =>
          json({ data: await request.json() }),
        );
        const response = await observedHttpRequest(
          new Request('https://api.test/resource', {
            method: 'POST',
            body: JSON.stringify({ value: 1 }),
          }),
          'service',
          undefined,
          true,
          handle,
        );
        expect(await response.json()).toEqual({ data: { value: 1 } });
        expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
          service: 'service',
          version: 'local',
          status: 200,
        });
        expect(handle).toHaveBeenCalledTimes(1);
      } finally {
        log.mockRestore();
      }
    });
    it.each(['null', '[]', 'false', 'invalid json'])(
      'rejects invalid command JSON %s before application execution',
      async (body) => {
        const handle = vi.fn();
        const response = await observedHttpRequest(
          new Request('https://api.test/resource', { method: 'POST', body }),
          'service',
          'sha',
          false,
          handle,
        );
        expect(response.status).toBe(400);
        expect(handle).not.toHaveBeenCalled();
      },
    );
  },
);
