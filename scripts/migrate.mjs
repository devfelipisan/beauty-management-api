import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const files = (await readdir('database/migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const version = file.split('.')[0];
    const applied = await client.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      [version],
    );
    if (applied.rowCount) continue;
    await client.query(await readFile(`database/migrations/${file}`, 'utf8'));
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [
      version,
    ]);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
