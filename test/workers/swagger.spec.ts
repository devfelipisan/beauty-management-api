import { env, exports } from 'cloudflare:workers';

type HttpWorker = { fetch(request: Request): Promise<Response> };
const workers: [string, HttpWorker, number][] = [
  ['Operations', exports.default as HttpWorker, 22],
  [
    'Billing',
    (env as unknown as { BILLING_SERVICE: HttpWorker }).BILLING_SERVICE,
    2,
  ],
  [
    'Clinical',
    (env as unknown as { CLINICAL_SERVICE: HttpWorker }).CLINICAL_SERVICE,
    20,
  ],
];

describe('Swagger through physical Workers and Service Bindings', () => {
  for (const [name, worker, count] of workers) {
    it(`serves ${name} documentation and protects all documented business operations`, async () => {
      const ui = await worker.fetch(new Request('https://worker.test/swagger'));
      expect(ui.status).toBe(200);
      expect(await ui.text()).toContain('swagger-ui');
      const alias = await worker.fetch(
        new Request('https://worker.test/api-docs'),
      );
      expect(alias.status).toBe(200);
      const response = await worker.fetch(
        new Request('https://worker.test/openapi.json'),
      );
      expect(response.status).toBe(200);
      const spec = (await response.json()) as {
        paths: Record<string, Record<string, unknown>>;
      };
      expect(Object.values(spec.paths).flatMap(Object.keys)).toHaveLength(
        count,
      );
      for (const [path, methods] of Object.entries(spec.paths)) {
        for (const method of Object.keys(methods)) {
          const concrete = path
            .replace('{tenantId}', 'tenant-dev-001')
            .replace(/\{[^}]+\}/g, 'missing-resource');
          const result = await worker.fetch(
            new Request(`https://worker.test${concrete}`, {
              method: method.toUpperCase(),
            }),
          );
          expect(result.status, `${name} ${method} ${path}`).toBe(
            path === '/health' ? 200 : 401,
          );
        }
      }
      const js = await worker.fetch(
        new Request('https://worker.test/swagger/swagger-ui-bundle.js'),
      );
      expect(js.status).toBe(200);
      expect((await js.text()).length).toBeGreaterThan(100_000);
    });
  }
});
