import { spawnSync } from 'node:child_process';
import { buildDevelopmentSeed } from '../database/seeds/development.mjs';

describe('local synthetic seed tooling', () => {
  it('is deterministic for an explicit reference date and quotes SQL text safely', () => {
    const first = buildDevelopmentSeed('2026-10-25');
    expect(first).toEqual(buildDevelopmentSeed('2026-10-25'));
    expect(first.statements.join('\n')).toContain("Luísa D''Ávila");
    expect(first.manifest.counts.customers).toBe(14);
    expect(first.manifest.scenarios).toHaveLength(13);
    expect(
      first.statements.every(
        (sql) =>
          sql.startsWith('SELECT ') || /ON CONFLICT .* DO NOTHING$/.test(sql),
      ),
    ).toBe(true);
    expect(
      first.manifest.records.every(
        (record) =>
          ![
            'appointments',
            'sessions',
            'payments',
            'ledger_movements',
            'audit_events',
            'outbox_events',
          ].includes(record.table),
      ),
    ).toBe(true);
    expect(() => buildDevelopmentSeed('2026-02-30')).toThrow();
  });

  it('refuses remote or arbitrary target arguments before accessing a database', () => {
    for (const arg of ['--remote', '--config', '--reset']) {
      const result = spawnSync(
        process.execPath,
        ['scripts/seed-local.mjs', arg],
        { encoding: 'utf8' },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('exclusivo do D1 local');
      expect(result.stdout).not.toContain('Aplicando migrations');
    }
  });
});
