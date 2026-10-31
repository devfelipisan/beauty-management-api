import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildDevelopmentSeed,
  primaryTenant,
  anchorService,
} from '../database/seeds/development.mjs';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--preview') || args.length > 1) {
  console.error(
    'Seed exclusivo do D1 local. Uso: npm run db:seed [-- --preview]. Não aceita --remote, config ou SQL arbitrários.',
  );
  process.exit(1);
}
if (args.includes('--preview')) {
  console.log(JSON.stringify(buildDevelopmentSeed().manifest, null, 2));
  process.exit(0);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const config = join(root, 'apps/operations-worker/wrangler.jsonc');
const wrangler = join(root, 'node_modules/wrangler/bin/wrangler.js');
const output = join(root, '.local/mock-data');
const configHome = await mkdtemp(join(tmpdir(), 'beauty-seed-wrangler-'));
function run(command, json = false) {
  const result = spawnSync(
    process.execPath,
    [
      wrangler,
      'd1',
      ...command,
      '--local',
      '--config',
      config,
      '--env',
      'local',
      ...(json ? ['--json'] : []),
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, XDG_CONFIG_HOME: configHome },
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || 'Wrangler falhou.');
  return json ? JSON.parse(result.stdout) : result.stdout;
}
try {
  console.log('Aplicando migrations existentes no D1 LOCAL de Operations...');
  run(['migrations', 'apply', 'D1_DATABASE']);
  const anchor = run(
    [
      'execute',
      'D1_DATABASE',
      '--command',
      `SELECT created_at FROM services WHERE tenant_id='${primaryTenant}' AND id='${anchorService}'`,
    ],
    true,
  );
  const date = anchor
    .flatMap((result) => result.results ?? [])[0]
    ?.created_at?.slice(0, 10);
  const seed = buildDevelopmentSeed(date);
  await mkdir(output, { recursive: true });
  const sqlPath = join(configHome, 'seed.sql');
  await writeFile(sqlPath, seed.statements.join(';\n') + ';\n');
  // Wrangler's local execute sends this file as one D1 batch (transactional).
  run(['execute', 'D1_DATABASE', '--file', sqlPath], true);
  await writeFile(
    join(output, 'seed.sql'),
    seed.statements.join(';\n') + ';\n',
  );
  await writeFile(
    join(output, 'manifest.json'),
    JSON.stringify(seed.manifest, null, 2) + '\n',
  );
  console.log(
    'Massa sintética local disponível. Registros existentes não foram sobrescritos.',
  );
  console.log('Tenant: tenant-dev-001 | Swagger Authorize: actor-dev-admin');
  console.log(`IDs e cenários: ${join(output, 'manifest.json')}`);
  console.log('Inicie: npm run dev:workers');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  const cleanupPath = resolve(configHome);
  if (
    dirname(cleanupPath) !== resolve(tmpdir()) ||
    !basename(cleanupPath).startsWith('beauty-seed-wrangler-')
  )
    throw new Error('Diretório temporário inesperado; limpeza recusada.');
  await rm(cleanupPath, { recursive: true, force: true });
}
