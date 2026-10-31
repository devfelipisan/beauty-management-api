import SwaggerParser from '@apidevtools/swagger-parser';
import { runInNewContext } from 'node:vm';
import { document } from './openapi.js';
import { serveSwagger } from './swagger.js';

describe('Swagger fetch adapter', () => {
  it('uses the operation description when no explicit browser limitation reason is supplied', async () => {
    const api = document('Test', {
      '/resource': {
        post: {
          'x-browser-testable': false,
          description: 'Browser upload unavailable',
        },
      },
    });
    const response = serveSwagger(
      new Request('https://api.test/swagger/init.js'),
      api,
    )!;
    expect(await response.text()).toContain(
      '"reason":"Browser upload unavailable"',
    );
  });
  const api = document('Test Worker', {});

  it('serves both UI aliases with local assets and no external validator', async () => {
    for (const path of ['/swagger', '/swagger/', '/api-docs', '/api-docs/']) {
      const response = serveSwagger(
        new Request(`https://api.test${path}`),
        api,
      )!;
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      const html = await response.text();
      expect(html).toContain('/swagger/swagger-ui-bundle.js');
      expect(html).not.toMatch(/https?:\/\//);
    }
    const init = await serveSwagger(
      new Request('https://api.test/swagger/init.js'),
      api,
    )!.text();
    expect(init).toContain('validatorUrl: null');
    expect(init).toContain('persistAuthorization: false');
    expect(init).toContain("url: '/openapi.json'");
  });

  it('serves the actual distributable assets and license', async () => {
    const bundle = serveSwagger(
      new Request('https://api.test/swagger/swagger-ui-bundle.js'),
      api,
    )!;
    expect(bundle.headers.get('content-type')).toContain('javascript');
    expect((await bundle.text()).length).toBeGreaterThan(100_000);
    const css = serveSwagger(
      new Request('https://api.test/swagger/swagger-ui.css'),
      api,
    )!;
    expect(await css.text()).toContain('.swagger-ui');
    expect(
      await serveSwagger(
        new Request('https://api.test/swagger/LICENSE'),
        api,
      )!.text(),
    ).toContain('Apache');
  });

  it('serves a valid OpenAPI document without modifying the current server', async () => {
    const response = serveSwagger(
      new Request('https://api.test/openapi.json'),
      api,
    )!;
    const parsed = await response.json();
    await SwaggerParser.validate(parsed as never);
    expect(parsed).toMatchObject({ servers: [{ url: '/' }] });
    expect(api.servers).toEqual([
      { url: '/', description: 'Este Worker (mesma origem da documentação)' },
    ]);
  });

  it('handles HEAD and rejects writes without intercepting business paths', async () => {
    const head = serveSwagger(
      new Request('https://api.test/openapi.json', { method: 'HEAD' }),
      api,
    )!;
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const post = serveSwagger(
      new Request('https://api.test/swagger', { method: 'POST' }),
      api,
    )!;
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET, HEAD');
    expect(
      serveSwagger(new Request('https://api.test/health'), api),
    ).toBeUndefined();
    expect(
      serveSwagger(new Request('https://api.test/swagger/unknown'), api),
    ).toBeUndefined();
  });

  it('explains a documented browser limitation before issuing an impossible GET', async () => {
    const limited = document('Legacy transport', {
      '/tenants/{tenantId}/equipment': {
        get: {
          'x-browser-testable': false,
          'x-browser-limitation': 'GET exige corpo JSON.',
        },
      },
    });
    const script = await serveSwagger(
      new Request('https://api.test/swagger/init.js'),
      limited,
    )!.text();
    const window = {
      location: { href: 'https://api.test/swagger' },
      ui: undefined as unknown,
    };
    const SwaggerUIBundle = Object.assign((config: unknown) => config, {
      presets: { apis: {} },
    });
    runInNewContext(script, { window, URL, SwaggerUIBundle });
    const config = window.ui as {
      requestInterceptor: (request: { url: string; method: string }) => unknown;
    };
    expect(() =>
      config.requestInterceptor({
        url: '/tenants/tenant-dev-001/equipment',
        method: 'GET',
      }),
    ).toThrow('GET exige corpo JSON.');
    const normal = { url: '/health', method: 'GET' };
    expect(config.requestInterceptor(normal)).toBe(normal);
  });
});
