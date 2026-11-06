import {
  ListTenantAgenda,
  GetAgendaAppointment,
} from './list-tenant-agenda.js';
import type { AgendaReadRepository } from '../../ports/agenda-read-repository.js';

function fixture() {
  const repository: AgendaReadRepository = {
    list: vi.fn().mockResolvedValue([]),
    summarize: vi.fn().mockResolvedValue({}),
    tenant: vi
      .fn()
      .mockResolvedValue({
        id: 'tenant',
        displayName: 'Tenant',
        timezone: 'America/Sao_Paulo',
      }),
    find: vi.fn().mockResolvedValue(null),
  };
  const authority = {
    tenantId: 'tenant',
    actorId: 'actor',
    permissions: ['agenda.read'],
  };
  return { repository, authority, query: new ListTenantAgenda(repository) };
}
const period = {
  from: '2026-11-01T00:00:00.000Z',
  to: '2026-11-02T00:00:00.000Z',
};
describe('tenant agenda application', () => {
  it('validates authorization before reading', async () => {
    const f = fixture();
    await expect(
      f.query.execute(period, { ...f.authority, permissions: [] }),
    ).rejects.toThrow('PERMISSION_DENIED');
    expect(f.repository.list).not.toHaveBeenCalled();
  });
  it.each([
    { ...period, limit: 101 },
    { ...period, limit: 0 },
    { ...period, to: period.from },
    { ...period, to: '2027-01-01T00:00:00Z' },
    { ...period, from: 'invalid' },
  ])('rejects invalid period/page %#', async (input) => {
    const f = fixture();
    await expect(f.query.execute(input, f.authority)).rejects.toThrow(
      'VALIDATION_ERROR',
    );
    expect(f.repository.list).not.toHaveBeenCalled();
  });
  it('uses default page size, tenant and persisted professional scope', async () => {
    const f = fixture();
    const result = await f.query.execute(period, {
      ...f.authority,
      professionalId: 'professional',
    });
    expect(f.repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant',
        professionalId: 'professional',
        limit: 51,
      }),
    );
    expect(result.page).toEqual({ nextCursor: null, hasMore: false });
    await expect(
      f.query.execute(
        { ...period, professionalId: 'other' },
        { ...f.authority, professionalId: 'professional' },
      ),
    ).rejects.toThrow('PERMISSION_DENIED');
  });
  it('binds cursors to the filters and tenant authority', async () => {
    const f = fixture();
    vi.mocked(f.repository.list).mockResolvedValue([
      { id: 'a', startsAt: period.from },
      { id: 'b', startsAt: period.from },
    ] as never);
    const first = await f.query.execute({ ...period, limit: 1 }, f.authority);
    expect(first.page.hasMore).toBe(true);
    const cursor = first.page.nextCursor!;
    await f.query.execute({ ...period, cursor }, f.authority);
    expect(f.repository.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ after: { id: 'a', startsAt: period.from } }),
    );
    await expect(
      f.query.execute(
        { ...period, cursor },
        { ...f.authority, tenantId: 'other' },
      ),
    ).rejects.toThrow('VALIDATION_ERROR');
    await expect(
      f.query.execute({ ...period, cursor, serviceId: 'other' }, f.authority),
    ).rejects.toThrow('VALIDATION_ERROR');
  });
  it('hides missing or foreign details without claiming unevaluated actions', async () => {
    const f = fixture();
    const details = new GetAgendaAppointment(f.repository);
    await expect(details.execute('foreign', f.authority)).rejects.toThrow(
      'APPOINTMENT_NOT_FOUND',
    );
    expect(f.repository.find).toHaveBeenCalledWith(
      'tenant',
      'foreign',
      undefined,
    );
  });
});
