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
import {
  AppointmentStatus,
  AppointmentOrigin,
} from '@beauty/operations/modules/appointments/domain/appointment';

const collection = '/tenants/{tenantId}/agenda';
const item = '/tenants/{tenantId}/appointments/{appointmentId}';
const interval =
  '/tenants/{tenantId}/professionals/{professionalId}/availability';
const reference = object(
  { id: text(), displayName: text({ nullable: true }) },
  ['id', 'displayName'],
);
const fields = {
  tenantId: text(),
  basePriceCents: integer({ minimum: 0, nullable: true }),
  discountCents: integer({ minimum: 0, nullable: true }),
  finalPriceCents: integer({ minimum: 0, nullable: true }),
  depositCents: integer({ minimum: 0, nullable: true }),
  createdAt: text({format: 'date-time'}),
  updatedAt: text({format: 'date-time'}),
  id: text(),
  customer: reference,
  professional: reference,
  service: reference,
  startsAt: text({ format: 'date-time' }),
  endsAt: text({ format: 'date-time' }),
  status: text({ enum: Object.values(AppointmentStatus) }),
  origin: text({ enum: Object.values(AppointmentOrigin) }),
};
const appointment = object(fields, Object.keys(fields));
const dates = [
  query('from', text({ format: 'date-time' }), true),
  query('to', text({ format: 'date-time' }), true),
];
export const agendaPaths = {
  [collection]: {
    get: operation(
      collection,
      'listTenantAgenda',
      'Consultar agenda operacional',
      'agenda.read',
      {
        description:
          'Consulta viva de até 42 dias. Intervalo [from,to), incluindo compromissos sobrepostos. Nomes de referência atuais, sem promessa de snapshot histórico. Resumo aplica os mesmos filtros, sem paginação. Sem garantia de snapshot entre páginas sob mutações concorrentes. Catálogos permanecem nas rotas próprias.',
        parameters: [
          ...dates,
          query('professionalId'),
          query('serviceId'),
          query('status', text({ enum: Object.values(AppointmentStatus) })),
          query('cursor'),
          query('limit', integer({ minimum: 1, maximum: 100, default: 50 })),
        ],
        response: envelope(
          object(
            {
              tenant: object(
                { id: text(), displayName: text(), timezone: text() },
                ['id', 'displayName', 'timezone'],
              ),
              period: object({ from: text(), to: text() }, ['from', 'to']),
              appointments: array(appointment),
              summary: {
                type: 'object',
                additionalProperties: integer({ minimum: 0 }),
              },
              page: object(
                { nextCursor: text({ nullable: true }), hasMore: boolean },
                ['nextCursor', 'hasMore'],
              ),
            },
            ['tenant', 'period', 'appointments', 'summary', 'page'],
          ),
        ),
      },
    ),
  },
  [item]: {
    get: operation(
      item,
      'getAgendaAppointment',
      'Consultar detalhes operacionais',
      'agenda.read',
      {
        description:
          'Sem dados clínicos ou financeiros. allowedActions contém apenas ações cuja elegibilidade foi avaliada; comandos revalidam todas as condições.',
        response: envelope(
          object({ ...fields, allowedActions: array(text()) }, [
            ...Object.keys(fields),
            'allowedActions',
          ]),
        ),
      },
    ),
  },
  [interval]: {
    get: operation(
      interval,
      'checkAgendaInterval',
      'Verificar conflito de intervalo',
      'agenda.read',
      {
        description:
          'Verifica compromissos conflitantes, não jornada, bloqueios ou geração de horários. Não reserva o intervalo. Até 42 dias.',
        parameters: dates,
        response: envelope(
          object({ available: boolean, startsAt: text(), endsAt: text() }, [
            'available',
            'startsAt',
            'endsAt',
          ]),
        ),
      },
    ),
  },
};
