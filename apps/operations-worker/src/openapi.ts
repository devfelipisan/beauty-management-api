import { servicePaths } from './services/openapi.js';
import {
  array,
  document,
  envelope,
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
        'customer.read',
        {
          body: object({
            fullName: text(),
            phone: text(),
            email: text(),
            document: text(),
          }),
          response: envelope(ref('Customer')),
          description:
            'O transporte atual verifica customer.read também para PATCH. A documentação registra esse comportamento; não altera a autorização.',
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
