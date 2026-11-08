import type {
  AgendaQuery,
  AgendaResponse,
  AgendaAppointmentDetails,
} from '@beauty/contracts';
import { AppointmentStatus } from '../../domain/appointment.js';
import { AppointmentPresencePolicy } from '../../domain/policies/appointment-presence-policy.js';
import type {
  AgendaReadRepository,
  AgendaReadQuery,
} from '../../ports/agenda-read-repository.js';

export interface AgendaAuthority {
  tenantId: string;
  actorId?: string;
  mode?: 'selector';
  permissions: readonly string[];
  professionalId?: string;
  selectedRole?: string;
}

function assertRead(context: AgendaAuthority): void {
  if (
    !context.tenantId ||
    (!context.actorId && context.mode !== 'selector') ||
    !context.permissions.includes('agenda.read')
  ) {
    throw new Error('PERMISSION_DENIED');
  }
}

function instant(value: string): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error('VALIDATION_ERROR');
  }
  const calendarPart = value.slice(0, 19);
  if (new Date(calendarPart + 'Z').toISOString().slice(0, 19) !== calendarPart)
    throw new Error('VALIDATION_ERROR');
  return new Date(value).toISOString();
}

export function agendaPeriod(
  fromValue: string,
  toValue: string,
): { from: string; to: string } {
  const from = instant(fromValue);
  const to = instant(toValue);
  const duration = Date.parse(to) - Date.parse(from);
  if (duration <= 0 || duration > 42 * 24 * 60 * 60 * 1000)
    throw new Error('VALIDATION_ERROR');
  return { from, to };
}

export class ListTenantAgenda {
  constructor(private readonly repository: AgendaReadRepository) {}

  async execute(
    input: AgendaQuery,
    context: AgendaAuthority,
  ): Promise<AgendaResponse> {
    assertRead(context);
    const { from, to } = agendaPeriod(input.from, input.to);
    const limit = input.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new Error('VALIDATION_ERROR');
    if (
      input.status !== undefined &&
      !Object.values(AppointmentStatus).includes(
        input.status as AppointmentStatus,
      )
    )
      throw new Error('VALIDATION_ERROR');
    for (const id of [input.professionalId, input.serviceId]) {
      if (id !== undefined && (typeof id !== 'string' || !id.trim()))
        throw new Error('VALIDATION_ERROR');
    }
    if (
      context.professionalId &&
      input.professionalId &&
      context.professionalId !== input.professionalId
    )
      throw new Error('PERMISSION_DENIED');
    const professionalId = context.professionalId ?? input.professionalId;
    const scope = JSON.stringify([
      context.tenantId,
      context.mode === 'selector' ? ['selector'] : context.actorId,
      context.selectedRole ?? null,
      [...context.permissions].sort(),
      from,
      to,
      professionalId ?? null,
      input.serviceId ?? null,
      input.status ?? null,
    ]);
    let after: AgendaReadQuery['after'];
    if (input.cursor !== undefined) {
      try {
        const decoded: unknown = JSON.parse(
          decodeURIComponent(atob(input.cursor)),
        );
        if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded))
          throw new Error();
        const cursor = decoded as Record<string, unknown>;
        if (
          cursor.scope !== scope ||
          typeof cursor.id !== 'string' ||
          !cursor.id ||
          typeof cursor.startsAt !== 'string' ||
          instant(cursor.startsAt) !== cursor.startsAt
        )
          throw new Error();
        after = { startsAt: cursor.startsAt, id: cursor.id };
      } catch {
        throw new Error('VALIDATION_ERROR');
      }
    }
    const query: AgendaReadQuery = {
      tenantId: context.tenantId,
      from,
      to,
      professionalId,
      serviceId: input.serviceId,
      status: input.status,
      limit: limit + 1,
      after,
    };
    const tenant = await this.repository.tenant(context.tenantId);
    if (!tenant) throw new Error('TENANT_ACCESS_DENIED');
    // Sequential reads share the invocation's D1 budget with authorization.
    const rows = await this.repository.list(query);
    const summary = await this.repository.summarize(query);
    const hasMore = rows.length > limit;
    const appointments = rows.slice(0, limit);
    const last = appointments.at(-1);
    const nextCursor =
      hasMore && last
        ? btoa(
            encodeURIComponent(
              JSON.stringify({ scope, startsAt: last.startsAt, id: last.id }),
            ),
          )
        : null;
    return {
      tenant,
      period: { from, to },
      appointments,
      summary,
      page: { nextCursor, hasMore },
    };
  }
}

export class GetAgendaAppointment {
  constructor(private readonly repository: AgendaReadRepository) {}

  async execute(
    appointmentId: string,
    context: AgendaAuthority,
  ): Promise<AgendaAppointmentDetails> {
    assertRead(context);
    const appointment = await this.repository.find(
      context.tenantId,
      appointmentId,
      context.professionalId,
    );
    if (!appointment) throw new Error('APPOINTMENT_NOT_FOUND');
    const presence = new AppointmentPresencePolicy();
    const allowedActions: string[] = [];
    if (
      context.permissions.includes('appointment.confirm') &&
      presence.canConfirm(appointment.status as AppointmentStatus)
    )
      allowedActions.push('confirm');
    if (
      context.permissions.includes('appointment.check-in') &&
      presence.canCheckIn(appointment.status as AppointmentStatus)
    )
      allowedActions.push('check-in');
    // Clinical/commercial actions are omitted until their complete policies are evaluated.
    return { ...appointment, allowedActions };
  }
}
