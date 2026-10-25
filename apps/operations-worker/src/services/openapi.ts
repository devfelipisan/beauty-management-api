import {
  array,
  boolean,
  envelope,
  integer,
  object,
  operation,
  query,
  text,
} from '@beauty/cloudflare-runtime/openapi';

const collection = '/tenants/{tenantId}/services';
const item = `${collection}/{serviceId}`;
const fields = {
  name: text(),
  category: text(),
  durationMinutes: integer({ minimum: 1 }),
  basePriceCents: integer({ minimum: 0 }),
  requiresAssessment: boolean,
  allowsDiscount: boolean,
  requiresEquipment: boolean,
  requiresPhotography: boolean,
  hasTechnicalForm: boolean,
  technicalRequirements: { type: 'object', additionalProperties: true },
  minimumPriceCents: integer({ minimum: 0 }),
  depositMode: text({ enum: ['NOT_REQUIRED', 'FIXED', 'PERCENTAGE'] }),
  depositFixedCents: { type: 'number' },
  depositPercentageBasisPoints: { type: 'number' },
};
const response = object(
  {
    id: text(),
    tenantId: text(),
    ...fields,
    status: text({ enum: ['ACTIVE', 'INACTIVE'] }),
    createdAt: text(),
    updatedAt: text(),
  },
  [
    'id',
    'tenantId',
    'name',
    'category',
    'durationMinutes',
    'basePriceCents',
    'status',
  ],
);
const legacy =
  'Reutiliza os casos de uso do cadastro Nest. As escritas legadas são uma instrução D1 por recurso; não possuem contrato de idempotência, auditoria ou outbox. Esta exposição não acrescenta essas garantias.';

export const servicePaths = {
  [collection]: {
    get: operation(
      collection,
      'listServices',
      'Listar serviços',
      'service.read',
      {
        parameters: [query('limit', integer({ minimum: 1 })), query('cursor')],
        response: envelope(array(response)),
      },
    ),
    post: operation(
      collection,
      'createService',
      'Cadastrar serviço',
      'service.create',
      {
        status: 201,
        body: object(fields, [
          'name',
          'category',
          'durationMinutes',
          'basePriceCents',
        ]),
        response: envelope(response),
        description: legacy,
      },
    ),
  },
  [item]: {
    get: operation(item, 'getService', 'Consultar serviço', 'service.read', {
      response: envelope(response),
    }),
    patch: operation(
      item,
      'updateService',
      'Atualizar serviço',
      'service.read',
      {
        body: object(fields),
        response: envelope(response),
        description: `${legacy} O controller existente verifica service.read também para atualização; nenhuma nova permissão foi criada.`,
      },
    ),
    delete: operation(
      item,
      'deactivateService',
      'Desativar serviço',
      'service.read',
      {
        response: envelope(response),
        description: `${legacy} Desativação lógica para INACTIVE, sem exclusão física. O controller existente verifica service.read também para desativação.`,
      },
    ),
  },
};
