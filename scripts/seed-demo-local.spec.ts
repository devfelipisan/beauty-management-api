import { buildDemoDataset } from '../database/seeds/demo.mjs';
import { executeDemoPlan, validateDemoArguments } from './seed-demo-local.mjs';

describe('demo seed local-only planning', () => {
  it('creates a deterministic, realistic and conflict-free catalogue and agenda', () => {
    const first = buildDemoDataset('2028-04-01');
    expect(first).toEqual(buildDemoDataset('2028-04-01'));
    expect(first.manifest.totals).toEqual({
      tenants: 2,
      customers: 60,
      professionals: 8,
      services: 15,
      appointments: 180,
    });
    expect(first.manifest.plannedStatuses).toEqual({
      awaitingConfirmation: 60,
      confirmed: 120,
    });
    expect(first.manifest.appointments).toHaveLength(180);
    const uniqueKeys = new Set(first.manifest.appointments.map((appointment) => appointment.idempotencyKey));
    const uniqueSlots = new Set(first.manifest.appointments.map((appointment) =>
      `${appointment.body.professionalId}:${appointment.body.startsAt}`,
    ));
    expect(uniqueKeys.size).toBe(180);
    expect(uniqueSlots.size).toBe(180);
    expect(first.statements).toHaveLength(46 + 4 + 8 + 4 * (8 + 1));
    expect(first.statements.every((sql) => /ON CONFLICT \(.+\) DO NOTHING$/.test(sql))).toBe(true);
    expect(first.statements.some((sql) => /\b(appointments|payments|sessions|audit_events|outbox_events)\b/.test(sql))).toBe(false);
    expect(first.statements.every((sql) => !/\bDELETE\b|\bDROP\b|\bUPDATE\b/i.test(sql))).toBe(true);
    expect(first.statements.join('\n')).toContain('example.test');
    expect(() => buildDemoDataset('2026-02-30')).toThrow();
  });

  it('rejects remote, reset, URL and arbitrary CLI arguments', () => {
    expect(validateDemoArguments([])).toBe('--preview');
    expect(validateDemoArguments(['--apply'])).toBe('--apply');
    for (const args of [
      ['--remote'], ['--reset'], ['--config', 'prod.json'],
      ['--apply', '--remote'], ['--url=https://example.com'],
    ]) expect(() => validateDemoArguments(args)).toThrow();
  });

  it('executes through real Operations endpoints, with stable replay and no direct transactional SQL', async () => {
    const dataset = buildDemoDataset('2028-04-01');
    const sample = dataset.manifest.appointments.slice(0, 5);
    const created = new Map<string, string>();
    const confirmed = new Set<string>();
    let calls = 0;
    const fetchImpl = async (url: URL, init: RequestInit): Promise<Response> => {
      calls++;
      expect(url.origin).toBe('http://127.0.0.1:8787');
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer actor-dev-admin');
      const key = new Headers(init.headers).get('idempotency-key');
      if (url.pathname === '/tenants/tenant-dev-001/appointments' && init.method === 'POST') {
        if (!key) return Response.json({ code: 'IDEMPOTENCY_KEY_REQUIRED' }, { status: 400 });
        const id = created.get(key) ?? `appointment-${created.size + 1}`;
        created.set(key, id);
        return Response.json({ data: { id } }, { status: 201 });
      }
      if (url.pathname.endsWith('/confirm')) {
        confirmed.add(url.pathname.split('/')[4]);
        return Response.json({ data: { status: 'CONFIRMED' } });
      }
      const id = url.pathname.split('/')[4];
      return Response.json({
        data: confirmed.has(id)
          ? { status: 'CONFIRMED', allowedActions: ['check-in'] }
          : { status: 'AWAITING_CONFIRMATION', allowedActions: ['confirm'] },
      });
    };
    const first = await executeDemoPlan(sample, fetchImpl);
    const replay = await executeDemoPlan(sample, fetchImpl);
    expect(first.createdOrReplayed).toBe(5);
    expect(first.confirmedOrAlreadyConfirmed).toBe(sample.filter((item) => item.confirm).length);
    expect(replay).toEqual(first);
    expect(created.size).toBe(5);
    expect(confirmed.size).toBe(first.confirmedOrAlreadyConfirmed);
    expect(calls).toBeGreaterThan(10);
  });
});
