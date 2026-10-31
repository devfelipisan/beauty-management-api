import { servicePaths } from './services/openapi.js';
import {
  array,
  document,
  envelope,
  header,
  integer,
  object,
  operation,
  query,
  ref,
  text,
} from '@beauty/cloudflare-runtime/openapi';

const tenant = '/tenants/{tenantId}';
const appointments = `${tenant}/appointments`;
const customer = object(
  {
    id: text(),
    tenantId: text(),
    fullName: text(),
    phone: text(),
    email: text(),
    document: text(),
    status: text(),
    relationshipProfile: text(),
    createdAt: text(),
    updatedAt: text(),
  },
  ['id', 'tenantId', 'fullName'],
  true,
);

export const operationsOpenApi = document(
  'Beauty — Operations Worker',
  {
    '/v1/me/tenants': {
      get: operation(
        '/v1/me/tenants',
        'myTenants',
        'Consultar empresas da identidade autenticada',
        null,
        {
          response: envelope(
            object(
              {
                tenants: array(
                  object(
                    {
                      id: text(),
                      displayName: text(),
                      status: text(),
                      roles: array(object({}, [], true)),
                    },
                    ['id', 'displayName', 'roles'],
                  ),
                ),
              },
              ['tenants'],
            ),
          ),
          description:
            'Exige Bearer válido. Não lista empresas de outra identidade nem concede papéis.',
        },
      ),
    },
    '/v1/me/context': {
      get: operation(
        '/v1/me/context',
        'myContext',
        'Consultar contexto autorizado',
        null,
        {
          parameters: [
            header(
              'x-tenant-id',
              'Empresa selecionada, confrontada com membership ativa.',
              true,
            ),
            header(
              'x-workspace-role',
              'Papel selecionado, sem autoridade própria.',
            ),
            header('x-professional-id', 'Profissional associado à identidade.'),
          ],
          response: envelope(
            object(
              {
                actorId: text(),
                tenantId: text(),
                roles: array(text()),
                permissions: array(text()),
                professionalId: text(),
              },
              ['actorId', 'tenantId', 'roles', 'permissions'],
            ),
          ),
          description:
            'Exige Bearer e x-tenant-id. Seletores x-workspace-role e x-professional-id são confrontados com o vínculo atual.',
        },
      ),
    },
    ...servicePaths,
    [`${tenant}/customers`]: {
      get: operation(
        `${tenant}/customers`,
        'listCustomers',
        'Listar clientes',
        'customer.read',
        {
          response: envelope(array(ref('Customer'))),
          description:
            'O handler atual usa a paginação padrão do caso de uso; não lê parâmetros de paginação da URL.',
        },
      ),
    },
    [`${tenant}/customers/{customerId}`]: {
      get: operation(
        `${tenant}/customers/{customerId}`,
        'getCustomer',
        'Consultar cliente',
        'customer.read',
        { response: envelope(ref('Customer')) },
      ),
      patch: operation(
        `${tenant}/customers/{customerId}`,
        'updateCustomer',
        'Atualizar dados do cliente',
        'customer.update',
        {
          body: object({
            fullName: text(),
            phone: text(),
            email: text(),
            document: text(),
          }),
          response: envelope(ref('Customer')),
          description: 'PATCH exige customer.update, sem concessão automática.',
        },
      ),
    },
    [`${tenant}/customers/{customerId}/history`]: {
      get: operation(
        `${tenant}/customers/{customerId}/history`,
        'listCustomerHistory',
        'Consultar histórico do cliente',
        'customer.history.read',
        {
          parameters: [
            'from',
            'to',
            'serviceId',
            'professionalId',
            'eventType',
            'status',
            'cursor',
          ]
            .map((name) => query(name))
            .concat([query('limit', integer())]),
        },
      ),
    },
    [appointments]: {
      post: operation(
        appointments,
        'createAppointment',
        'Agendar atendimento',
        'appointment.create',
        {
          idempotent: true,
          status: 201,
          body: ref('CreateAppointment'),
          description:
            'Clientes, profissionais, serviços, disponibilidade, licença e avaliação precisam estar configurados. O Swagger não cria essas dependências.',
        },
      ),
    },
    ...Object.fromEntries(
      [
        [
          'confirm',
          'confirmAppointment',
          'Confirmar atendimento',
          'appointment.confirm',
        ],
        [
          'check-in',
          'checkInAppointment',
          'Registrar chegada',
          'appointment.check-in',
        ],
        ['no-show', 'markNoShow', 'Registrar ausência', 'appointment.no-show'],
      ].map(([action, id, summary, permission]) => [
        `${appointments}/{appointmentId}/${action}`,
        {
          post: operation(
            `${appointments}/{appointmentId}/${action}`,
            id,
            summary,
            permission,
            {
              idempotent: true,
              ...(action === 'no-show'
                ? { body: object({}) }
                : { emptyBody: true }),
            },
          ),
        },
      ]),
    ),
    [`${appointments}/{appointmentId}/reschedule`]: {
      post: operation(
        `${appointments}/{appointmentId}/reschedule`,
        'rescheduleAppointment',
        'Reagendar atendimento',
        'appointment.reschedule',
        {
          idempotent: true,
          body: object(
            {
              startsAt: text({ format: 'date-time' }),
              professionalId: text(),
              reason: text(),
            },
            ['startsAt', 'professionalId', 'reason'],
          ),
        },
      ),
    },
    [`${appointments}/{appointmentId}/cancel`]: {
      post: operation(
        `${appointments}/{appointmentId}/cancel`,
        'cancelAppointment',
        'Cancelar atendimento',
        'appointment.cancel',
        {
          idempotent: true,
          body: object(
            {
              origin: text({
                enum: [
                  'CUSTOMER',
                  'COMPANY',
                  'PROFESSIONAL',
                  'SYSTEM_EXPIRATION',
                ],
              }),
              reason: text(),
              note: text(),
            },
            ['origin', 'reason'],
          ),
        },
      ),
    },
    [`${appointments}/{appointmentId}/package`]: {
      post: operation(
        `${appointments}/{appointmentId}/package`,
        'assignAppointmentPackage',
        'Vincular pacote ao atendimento',
        'appointment.package.assign',
        {
          idempotent: true,
          body: object({ customerPackageId: text() }, ['customerPackageId']),
        },
      ),
    },
  },
  {
    Customer: customer,
    CreateAppointment: object(
      {
        customerId: text(),
        serviceId: text(),
        professionalId: text(),
        startsAt: text({ format: 'date-time' }),
        origin: text({
          enum: [
            'RECEPTION',
            'LANDING_PAGE',
            'WHATSAPP',
            'RETURN',
            'CAMPAIGN',
            'REFERRAL',
            'MANUAL',
          ],
        }),
        customerPackageId: text(),
      },
      ['customerId', 'serviceId', 'professionalId', 'startsAt', 'origin'],
    ),
  },
);
