import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
import type { AgendaAppointment, AgendaResponse } from '@beauty/contracts';
import type {
  AgendaReadQuery,
  AgendaReadRepository,
} from '../ports/agenda-read-repository.js';

interface Row {
  id: string;
  customer_id: string;
  customer_name: string | null;
  professional_id: string;
  professional_name: string | null;
  service_id: string;
  service_name: string | null;
  starts_at: string;
  ends_at: string;
  status: AgendaAppointment['status'];
  origin: AgendaAppointment['origin'];
}
const projection = `SELECT a.id,a.customer_id,c.full_name AS customer_name,
  a.professional_id,p.name AS professional_name,a.service_id,s.name AS service_name,
  a.starts_at,a.ends_at,a.status,a.origin FROM appointments a
  LEFT JOIN customers c ON c.tenant_id=a.tenant_id AND c.id=a.customer_id
  LEFT JOIN professionals p ON p.tenant_id=a.tenant_id AND p.id=a.professional_id
  LEFT JOIN services s ON s.tenant_id=a.tenant_id AND s.id=a.service_id`;

function map(row: Row): AgendaAppointment {
  return {
    id: row.id,
    customer: { id: row.customer_id, displayName: row.customer_name },
    professional: {
      id: row.professional_id,
      displayName: row.professional_name,
    },
    service: { id: row.service_id, displayName: row.service_name },
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    origin: row.origin,
  };
}
function filters(query: AgendaReadQuery) {
  const clauses = ['a.tenant_id=?', 'a.starts_at<?', 'a.ends_at>?'];
  const params: (string | number)[] = [query.tenantId, query.to, query.from];
  for (const [column, value] of [
    ['professional_id', query.professionalId],
    ['service_id', query.serviceId],
    ['status', query.status],
  ] as const) {
    if (value !== undefined) {
      clauses.push(`a.${column}=?`);
      params.push(value);
    }
  }
  return { clauses, params };
}
export class D1AgendaReadRepository implements AgendaReadRepository {
  constructor(private readonly db: D1DatabaseLike) {}
  async tenant(tenantId: string): Promise<AgendaResponse['tenant'] | null> {
    const row = await this.db
      .prepare(
        "SELECT id,display_name,timezone FROM tenants WHERE id=? AND status='ACTIVE'",
      )
      .bind(tenantId)
      .first<{ id: string; display_name: string; timezone: string }>();
    return row
      ? { id: row.id, displayName: row.display_name, timezone: row.timezone }
      : null;
  }
  async list(query: AgendaReadQuery) {
    const { clauses, params } = filters(query);
    if (query.after) {
      clauses.push('(a.starts_at>? OR (a.starts_at=? AND a.id>?))');
      params.push(query.after.startsAt, query.after.startsAt, query.after.id);
    }
    const result = await this.db
      .prepare(
        `${projection} WHERE ${clauses.join(' AND ')} ORDER BY a.starts_at,a.id LIMIT ?`,
      )
      .bind(...params, query.limit)
      .all<Row>();
    return result.results.map(map);
  }
  async summarize(query: AgendaReadQuery): Promise<AgendaResponse['summary']> {
    const { clauses, params } = filters(query);
    const result = await this.db
      .prepare(
        `SELECT a.status,COUNT(*) AS count FROM appointments a WHERE ${clauses.join(' AND ')} GROUP BY a.status`,
      )
      .bind(...params)
      .all<{ status: AgendaAppointment['status']; count: number }>();
    return Object.fromEntries(
      result.results.map((row) => [row.status, row.count]),
    );
  }
  async find(tenantId: string, appointmentId: string, professionalId?: string) {
    const params = [tenantId, appointmentId];
    if (professionalId) params.push(professionalId);
    const row = await this.db
      .prepare(
        `${projection} WHERE a.tenant_id=? AND a.id=?${professionalId ? ' AND a.professional_id=?' : ''}`,
      )
      .bind(...params)
      .first<Row>();
    return row ? map(row) : null;
  }
}
