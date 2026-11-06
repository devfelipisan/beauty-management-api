import type {
  AgendaAppointment,
  AgendaResponse,
  AgendaQuery,
} from '@beauty/contracts';

export interface AgendaReadQuery extends Omit<AgendaQuery, 'cursor' | 'limit'> {
  tenantId: string;
  limit: number;
  after?: { startsAt: string; id: string };
}

export interface AgendaReadRepository {
  list(query: AgendaReadQuery): Promise<AgendaAppointment[]>;
  summarize(query: AgendaReadQuery): Promise<AgendaResponse['summary']>;
  tenant(tenantId: string): Promise<AgendaResponse['tenant'] | null>;
  find(
    tenantId: string,
    appointmentId: string,
    professionalId?: string,
  ): Promise<AgendaAppointment | null>;
}
