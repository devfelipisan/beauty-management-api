export type Schema = Record<string, unknown>;
export type Operation = Record<string, unknown>;
export interface ApiDocument {
  openapi: '3.0.3';
  info: { title: string; version: string; description: string };
  servers: { url: string; description: string }[];
  security: { bearerAuth: never[] }[];
  paths: Record<string, Record<string, Operation>>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, Schema>;
  };
}

export const text = (extra: Schema = {}): Schema => ({
  type: 'string',
  ...extra,
});
export const integer = (extra: Schema = {}): Schema => ({
  type: 'integer',
  ...extra,
});
export const boolean: Schema = { type: 'boolean' };
export const array = (items: Schema): Schema => ({ type: 'array', items });
export const ref = (name: string): Schema => ({
  $ref: `#/components/schemas/${name}`,
});
export const object = (
  properties: Record<string, Schema>,
  required: string[] = [],
  additionalProperties = false,
): Schema => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties,
});
export const query = (
  name: string,
  schema: Schema = text(),
  required = false,
) => ({ name, in: 'query', required, schema });
export const header = (
  name: string,
  description: string,
  required = false,
) => ({ name, in: 'header', required, description, schema: text() });
export const jsonBody = (schema: Schema, required = true) => ({
  required,
  content: { 'application/json': { schema } },
});
export const envelope = (data: Schema = {}): Schema =>
  object({ data, requestId: text(), correlationId: text() }, [
    'data',
    'requestId',
    'correlationId',
  ]);

export function operation(
  path: string,
  operationId: string,
  summary: string,
  permission: string | null,
  options: {
    body?: Schema;
    emptyBody?: boolean;
    status?: number;
    response?: Schema;
    parameters?: unknown[];
    description?: string;
    idempotent?: boolean;
  } = {},
): Operation {
  return {
    operationId,
    summary,
    tags: [path.split('/')[3] ?? 'API'],
    description: [
      permission
        ? `Permissão existente: \`${permission}\`.`
        : 'Exige identidade e membership; o handler não verifica uma permissão adicional.',
      options.description ?? '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    ...(permission ? { 'x-permission': permission } : {}),
    parameters: [
      ...Array.from(path.matchAll(/\{([^}]+)\}/g), ([, name]) => ({
        name,
        in: 'path',
        required: true,
        schema: text(name === 'tenantId' ? { example: 'tenant-dev-001' } : {}),
      })),
      header('x-request-id', 'Identificador opcional da requisição.'),
      header('x-correlation-id', 'Identificador opcional de correlação.'),
      ...(options.idempotent
        ? [
            header(
              'Idempotency-Key',
              'Uma chave por operação lógica. Reutilize a mesma chave somente para repetir o mesmo payload.',
              true,
            ),
          ]
        : []),
      ...(options.parameters ?? []),
    ],
    ...(options.body
      ? { requestBody: jsonBody(options.body) }
      : options.emptyBody
        ? { requestBody: jsonBody(object({}), false) }
        : {}),
    responses: {
      [String(options.status ?? 200)]: {
        description: 'Sucesso.',
        content: {
          'application/json': { schema: options.response ?? envelope() },
        },
      },
      ...Object.fromEntries(
        [
          [400, 'Entrada inválida ou chave de idempotência ausente.'],
          [401, 'Autenticação ausente ou inválida.'],
          [403, 'Permissão ou acesso ao tenant negado.'],
          [404, 'Recurso não encontrado.'],
          [409, 'Conflito de estado, concorrência ou idempotência.'],
          [422, 'Regras de elegibilidade bloquearam a operação.'],
          [500, 'Falha interna.'],
        ].map(([status, description]) => [
          String(status),
          {
            description,
            content: { 'application/json': { schema: ref('ApiError') } },
          },
        ]),
      ),
    },
  };
}

export function document(
  title: string,
  paths: ApiDocument['paths'],
  schemas: Record<string, Schema> = {},
): ApiDocument {
  return {
    openapi: '3.0.3',
    info: {
      title,
      version: '0.0.1',
      description:
        'Rotas HTTP implementadas neste Worker Cloudflare. Use Try it out para executar chamadas reais.\n\n' +
        'No provider mock local existente: Authorize → actor-dev-admin; tenantId → tenant-dev-001. IDs de recursos precisam existir no D1 local; a documentação não cria fixtures.\n\n' +
        'Operações RPC internas não são endpoints HTTP e não aparecem como rotas executáveis. Os controllers Nest possuem outro transporte e não são publicados por este documento.',
    },
    servers: [
      { url: '/', description: 'Este Worker (mesma origem da documentação)' },
    ],
    security: [{ bearerAuth: [] }],
    paths: {
      '/health': {
        get: {
          operationId: 'health',
          tags: ['Health'],
          summary: 'Verificar funcionamento do Worker',
          security: [],
          responses: {
            '200': {
              description: 'Worker disponível.',
              content: {
                'application/json': {
                  schema: object(
                    {
                      status: text({ enum: ['ok'] }),
                      service: text(),
                      version: text(),
                    },
                    ['status', 'service', 'version'],
                  ),
                },
              },
            },
          },
        },
      },
      ...paths,
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Token do provider configurado. No mock local: actor-dev-admin (sem prefixo Bearer neste campo).',
        },
      },
      schemas: {
        ApiError: object(
          {
            status: text(),
            code: text(),
            message: text(),
            reasons: array({}),
            requestId: text(),
            correlationId: text(),
          },
          ['status', 'code'],
          true,
        ),
        ...schemas,
      },
    },
  };
}
