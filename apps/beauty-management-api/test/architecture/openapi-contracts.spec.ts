import SwaggerParser from '@apidevtools/swagger-parser';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { operationsOpenApi } from '../../../operations-worker/src/openapi.js';
import { billingOpenApi } from '../../../billing-worker/src/openapi.js';
import { clinicalOpenApi } from '../../../clinical-worker/src/openapi.js';

describe('HTTP OpenAPI contracts', () => {
  for (const [name, api, count] of [
    ['operations', operationsOpenApi, 17],
    ['billing', billingOpenApi, 2],
    ['clinical', clinicalOpenApi, 20],
  ] as const) {
    it(`validates ${name} and covers every HTTP route matcher`, async () => {
      await SwaggerParser.validate(JSON.parse(JSON.stringify(api)));
      const operations = Object.values(api.paths).flatMap((path) =>
        Object.values(path),
      );
      expect(operations).toHaveLength(count);
      expect(
        new Set(operations.map((operation) => operation.operationId)).size,
      ).toBe(count);
      const samples = Object.keys(api.paths).map((path) =>
        path.replace(/\{[^}]+\}/g, 'sample'),
      );
      for (const filename of [
        'worker.ts',
        'composition-root.ts',
        ...(name === 'operations' ? ['services/worker-routes.ts'] : []),
      ]) {
        const file = `apps/${name}-worker/src/${filename}`;
        const source = ts.createSourceFile(
          file,
          readFileSync(file, 'utf8'),
          ts.ScriptTarget.Latest,
          true,
        );
        function visit(node: ts.Node) {
          if (
            ts.isRegularExpressionLiteral(node) &&
            node.text.startsWith('/^\\/')
          ) {
            const end = node.text.lastIndexOf('/');
            const matcher = new RegExp(
              node.text.slice(1, end),
              node.text.slice(end + 1),
            );
            expect(
              samples.some((path) => matcher.test(path)),
              `${file}: missing OpenAPI for ${node.text}`,
            ).toBe(true);
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
      expect(api.paths).not.toHaveProperty('/refunds');
      expect(api.paths).not.toHaveProperty('/dispatchOutboxBatch');
    });
  }

  it('documents browser and authorization discrepancies instead of inventing contracts', () => {
    expect(
      clinicalOpenApi.paths['/tenants/{tenantId}/equipment'].get,
    ).toMatchObject({ deprecated: true, 'x-browser-testable': false });
    expect(
      operationsOpenApi.paths['/tenants/{tenantId}/customers/{customerId}']
        .patch['x-permission'],
    ).toBe('customer.read');
    expect(
      operationsOpenApi.paths['/tenants/{tenantId}/customers'],
    ).not.toHaveProperty('post');
    expect(
      clinicalOpenApi.paths['/tenants/{tenantId}/equipment'].get.parameters,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: 'query', name: 'id' }),
      ]),
    );
  });
});
