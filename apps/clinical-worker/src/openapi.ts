import {
  array,
  boolean,
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
} from '@beauty/cloudflare-runtime/openapi';

const tenant = '/tenants/{tenantId}';
const sessions = `${tenant}/sessions/{sessionId}`;
const technicalForms = `${tenant}/services/{serviceId}/technical-forms`;
const photoMetadata = object(
  {
    id: text(),
    tenantId: text(),
    sessionId: text(),
    intercurrenceId: text(),
    purpose: text({ enum: ['BEFORE', 'DURING', 'AFTER', 'INTERCURRENCE'] }),
    contentType: text(),
    sizeBytes: integer(),
    capturedAt: text(),
    uploadedAt: text(),
    status: text({ enum: ['PENDING_UPLOAD', 'AVAILABLE', 'FAILED'] }),
  },
  [
    'id',
    'tenantId',
    'sessionId',
    'purpose',
    'contentType',
    'sizeBytes',
    'status',
  ],
);
const photoUpload = operation(
  `${sessions}/photos`,
  'uploadSessionPhoto',
  'Enviar foto da sessão (arquivo binário)',
  'clinical.photo.upload',
  {
    idempotent: true,
    status: 201,
    response: envelope(ref('PhotoMetadata')),
    parameters: [
      query(
        'purpose',
        text({ enum: ['BEFORE', 'DURING', 'AFTER', 'INTERCURRENCE'] }),
        true,
      ),
      query('intercurrenceId'),
      header(
        'x-content-checksum',
        'Checksum informado pelo cliente (opcional).',
      ),
    ],
    description:
      'Enviar o arquivo diretamente no corpo, sem multipart/form-data. O navegador define Content-Length. O limite vem do binding MAX_CLINICAL_PHOTO_BYTES já previsto pelo runtime; esta documentação não configura esse valor.',
  },
);
photoUpload.requestBody = {
  required: true,
  content: Object.fromEntries(
    ['image/jpeg', 'image/png', 'image/webp'].map((type) => [
      type,
      { schema: { type: 'string', format: 'binary' } },
    ]),
  ),
};

const equipmentRead = operation(
  `${tenant}/equipment`,
  'getEquipmentLegacy',
  'Consultar equipamento — limitação do transporte atual',
  'equipment.read',
  {
    description:
      'O handler atual lê o identificador id de um corpo JSON em GET. Navegadores não permitem esse corpo em fetch; este GET não é testável pelo Swagger UI. Não existe parâmetro query equivalente no runtime. A rota permanece documentada sem inventar outro contrato.',
  },
);
equipmentRead.deprecated = true;
equipmentRead['x-browser-testable'] = false;
equipmentRead['x-browser-limitation'] =
  'Este GET exige corpo JSON no transporte legado, incompatível com fetch do navegador. Consulte a descrição da operação; nenhum parâmetro query equivalente está implementado.';
equipmentRead.requestBody = jsonBody(object({ id: text() }, ['id']));

export const clinicalOpenApi = document(
  'Beauty — Clinical Worker',
  {
    [`${tenant}/appointments/{appointmentId}/session/start`]: {
      post: operation(
        `${tenant}/appointments/{appointmentId}/session/start`,
        'startSession',
        'Iniciar sessão do atendimento',
        'session.start',
        { idempotent: true, status: 201, emptyBody: true },
      ),
    },
    [technicalForms]: {
      get: operation(
        technicalForms,
        'getActiveTechnicalForm',
        'Consultar ficha técnica ativa',
        'technical-form.read',
      ),
      post: operation(
        technicalForms,
        'createTechnicalForm',
        'Criar ficha técnica',
        'technical-form.create',
        {
          idempotent: true,
          status: 201,
          body: object({ fields: array(ref('TechnicalField')) }, ['fields']),
        },
      ),
    },
    [`${technicalForms}/{formId}/publish`]: {
      post: operation(
        `${technicalForms}/{formId}/publish`,
        'publishTechnicalForm',
        'Publicar ficha técnica',
        'technical-form.publish',
        { idempotent: true },
      ),
    },
    [`${sessions}/technical-values`]: {
      post: operation(
        `${sessions}/technical-values`,
        'recordTechnicalValues',
        'Registrar valores da ficha técnica',
        'session.technical.update',
        {
          idempotent: true,
          body: object(
            {
              values: array(
                object({ fieldId: text(), value: {}, unit: text() }, [
                  'fieldId',
                  'value',
                ]),
              ),
            },
            ['values'],
          ),
        },
      ),
    },
    [`${sessions}/power`]: {
      post: operation(
        `${sessions}/power`,
        'recordSessionPower',
        'Registrar potência',
        'session.technical.update',
        {
          idempotent: true,
          body: object(
            { value: { oneOf: [text(), { type: 'number' }] }, unit: text() },
            ['value', 'unit'],
          ),
        },
      ),
    },
    [`${sessions}/completion-eligibility`]: {
      get: operation(
        `${sessions}/completion-eligibility`,
        'checkSessionCompletion',
        'Verificar elegibilidade para conclusão',
        'session.complete',
      ),
    },
    [`${sessions}/complete`]: {
      post: operation(
        `${sessions}/complete`,
        'completeSession',
        'Concluir sessão',
        'session.complete',
        { idempotent: true, emptyBody: true },
      ),
    },
    [`${sessions}/return-recommendation`]: {
      post: operation(
        `${sessions}/return-recommendation`,
        'recommendReturn',
        'Registrar recomendação de retorno',
        'session.complete',
        {
          idempotent: true,
          body: object(
            {
              required: boolean,
              interval: object(
                {
                  value: integer(),
                  unit: text({ enum: ['DAY', 'WEEK', 'MONTH'] }),
                },
                ['value', 'unit'],
              ),
              recommendedFor: text(),
              reasonCode: text(),
              observation: text(),
            },
            ['required'],
          ),
        },
      ),
    },
    [`${sessions}/photos`]: {
      get: operation(
        `${sessions}/photos`,
        'listSessionPhotos',
        'Listar metadados das fotos',
        'clinical.photo.read',
        { response: envelope(array(ref('PhotoMetadata'))) },
      ),
      post: photoUpload,
    },
    [`${sessions}/photos/{photoId}`]: {
      get: {
        ...operation(
          `${sessions}/photos/{photoId}`,
          'getSessionPhoto',
          'Baixar foto da sessão',
          'clinical.photo.read',
        ),
        responses: {
          ...(operation(
            `${sessions}/photos/{photoId}`,
            'getSessionPhoto',
            '',
            '',
          ).responses as object),
          '200': {
            description: 'Arquivo binário privado.',
            content: Object.fromEntries(
              ['image/jpeg', 'image/png', 'image/webp'].map((type) => [
                type,
                { schema: { type: 'string', format: 'binary' } },
              ]),
            ),
          },
        },
      },
    },
    [`${tenant}/equipment`]: {
      get: equipmentRead,
      post: operation(
        `${tenant}/equipment`,
        'createEquipment',
        'Cadastrar equipamento',
        'equipment.create',
        {
          idempotent: true,
          status: 201,
          body: object(
            {
              name: text(),
              model: text(),
              manufacturer: text(),
              serialNumber: text(),
              mainUnit: text(),
              notes: text(),
            },
            ['name'],
          ),
        },
      ),
    },
    [`${tenant}/equipment/{equipmentId}/services`]: {
      post: operation(
        `${tenant}/equipment/{equipmentId}/services`,
        'configureEquipmentServices',
        'Configurar serviços do equipamento',
        'equipment.update',
        {
          idempotent: true,
          body: object({ serviceIds: array(text()) }, ['serviceIds']),
        },
      ),
    },
    [`${sessions}/equipment-usages`]: {
      post: operation(
        `${sessions}/equipment-usages`,
        'recordEquipmentUsage',
        'Registrar uso de equipamento na sessão',
        'session.technical.update',
        {
          idempotent: true,
          body: object({ equipmentId: text() }, ['equipmentId']),
        },
      ),
    },
    [`${sessions}/previous-context`]: {
      get: operation(
        `${sessions}/previous-context`,
        'getPreviousSessionContext',
        'Consultar contexto da sessão anterior',
        null,
      ),
    },
    [`${tenant}/variation-policies`]: {
      post: operation(
        `${tenant}/variation-policies`,
        'configureVariationPolicy',
        'Configurar política de variação',
        'variation-policy.configure',
        {
          idempotent: true,
          body: object(
            {
              serviceId: text(),
              parameterKey: text(),
              mode: text({ enum: ['ABSOLUTE', 'PERCENTAGE'] }),
              threshold: text(),
              unit: text(),
            },
            ['serviceId', 'parameterKey', 'mode', 'threshold'],
          ),
        },
      ),
    },
    [`${sessions}/variation-alerts/{alertId}/justify`]: {
      post: operation(
        `${sessions}/variation-alerts/{alertId}/justify`,
        'justifyVariationAlert',
        'Justificar alerta de variação',
        'session.technical.update',
        {
          idempotent: true,
          body: object({ justification: text() }, ['justification']),
        },
      ),
    },
  },
  {
    PhotoMetadata: photoMetadata,
    TechnicalField: object(
      {
        key: text(),
        name: text(),
        description: text(),
        type: text({
          enum: [
            'SHORT_TEXT',
            'LONG_TEXT',
            'INTEGER',
            'DECIMAL',
            'PERCENTAGE',
            'SINGLE_SELECT',
            'MULTI_SELECT',
            'BOOLEAN',
            'DATE',
            'TIME',
            'MEASUREMENT',
          ],
        }),
        order: integer(),
        required: boolean,
        minimum: text(),
        maximum: text(),
        precision: integer(),
        unit: text(),
        options: array(text()),
        status: text({ enum: ['ACTIVE', 'INACTIVE'] }),
      },
      ['key', 'name', 'type', 'order'],
    ),
  },
);
