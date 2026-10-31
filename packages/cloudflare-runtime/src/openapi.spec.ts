import * as sourceApi from './openapi.js';
import * as publicApi from '@beauty/cloudflare-runtime/openapi';

describe.each([sourceApi, publicApi])(
  'OpenAPI schema and operation helpers',
  (api) => {
    const {
      array,
      document,
      envelope,
      header,
      integer,
      jsonBody,
      object,
      operation,
      query,
      ref,
      text,
    } = api;
    it('constructs default and explicit schemas without mutating the supplied definitions', () => {
      expect(text()).toEqual({ type: 'string' });
      expect(integer()).toEqual({ type: 'integer' });
      expect(integer({ minimum: 0 })).toEqual({ type: 'integer', minimum: 0 });
      expect(array(text())).toEqual({
        type: 'array',
        items: { type: 'string' },
      });
      expect(ref('Result')).toEqual({ $ref: '#/components/schemas/Result' });
      expect(object({})).toEqual({
        type: 'object',
        properties: {},
        additionalProperties: false,
      });
      expect(object({ value: text() }, ['value'], true)).toMatchObject({
        required: ['value'],
        additionalProperties: true,
      });
      expect(query('search')).toEqual({
        name: 'search',
        in: 'query',
        required: false,
        schema: text(),
      });
      expect(query('page', integer(), true)).toMatchObject({
        required: true,
        schema: integer(),
      });
      expect(header('x-context', 'Context')).toMatchObject({
        in: 'header',
        required: false,
      });
      expect(header('x-context', 'Context', true)).toMatchObject({
        required: true,
      });
      expect(jsonBody(text())).toEqual({
        required: true,
        content: { 'application/json': { schema: text() } },
      });
      expect(jsonBody(text(), false).required).toBe(false);
      expect(envelope()).toMatchObject({
        properties: { data: {}, requestId: text(), correlationId: text() },
      });
      expect(envelope(ref('Result'))).toMatchObject({
        properties: { data: ref('Result') },
      });
    });
    it('constructs default responses, default tags and no body for an unadorned read', () => {
      const read = operation('/resource', 'read', 'Read', null);
      expect(read.tags).toEqual(['API']);
      expect(read).not.toHaveProperty('x-permission');
      expect(read).not.toHaveProperty('requestBody');
      expect(read.responses).toHaveProperty('200');
      expect(document('API', {}).components.schemas).toHaveProperty('ApiError');
    });
    it('describes authenticated path parameters, custom responses, explicit body and idempotency', () => {
      const body = object({ value: text() }, ['value']);
      const response = ref('Created');
      const result = operation(
        '/tenants/{tenantId}/resources/{resourceId}',
        'create',
        'Create',
        'resource.create',
        {
          body,
          status: 201,
          response,
          description: 'Details',
          idempotent: true,
          parameters: [query('filter')],
        },
      );
      expect(result).toMatchObject({
        'x-permission': 'resource.create',
        tags: ['resources'],
        requestBody: jsonBody(body),
        responses: {
          '201': { content: { 'application/json': { schema: response } } },
        },
      });
      expect(result.description).toContain('Details');
      expect(result.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'tenantId',
            required: true,
            schema: text({ example: 'tenant-dev-001' }),
          }),
          expect.objectContaining({ name: 'resourceId', schema: text() }),
          expect.objectContaining({ name: 'Idempotency-Key', required: true }),
          query('filter'),
        ]),
      );
      const optional = operation(
        '/tenants/{tenantId}/resources',
        'command',
        'Command',
        null,
        { emptyBody: true },
      );
      expect(optional.requestBody).toEqual(jsonBody(object({}), false));
    });
  },
);
