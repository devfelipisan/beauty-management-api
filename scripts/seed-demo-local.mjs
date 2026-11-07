import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildDemoDataset } from '../database/seeds/demo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = join(root, 'apps/operations-worker/wrangler.jsonc');
const wrangler = join(root, 'node_modules/wrangler/bin/wrangler.js');
const manifestPath = join(root, '.local/mock-data/manifest.json');
const reportPath = join(root, '.local/mock-data/demo-execution.json');
const operations = 'http://127.0.0.1:8787';
const tenantId = 'tenant-dev-001';
const actor = 'actor-dev-admin';

export function validateDemoArguments(args) {
  if (
    args.length > 1 ||
    !['--preview', '--apply'].includes(args[0] ?? '--preview')
  ) {
    throw new Error(
      'Uso local: node scripts/seed-demo-local.mjs [--preview|--apply]. --remote, --reset e --config são proibidos.',
    );
  }
  return args[0] ?? '--preview';
}

async function localJson(
  path,
  { method = 'GET', body, key } = {},
  fetchImpl = fetch,
) {
  const correlation = key ?? 'demo-local-read';
  let response;
  try {
    response = await fetchImpl(new URL(path, operations), {
      method,
      headers: {
        authorization: `Bearer ${actor}`,
        'x-tenant-id': tenantId,
        'x-request-id': correlation,
        'x-correlation-id': correlation,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(
      'Operations local indisponível em 127.0.0.1:8787. Inicie npm run dev:workers.',
    );
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      `Operations retornou resposta não JSON (HTTP ${response.status}) em ${path.split('?')[0]}`,
    );
  }
  return { status: response.status, payload };
}

async function assertLocalWorker(fetchImpl) {
  const health = await localJson('/health', {}, fetchImpl);
  if (
    health.status !== 200 ||
    health.payload?.service !== 'beauty-operations-worker' ||
    health.payload?.status !== 'ok'
  ) {
    throw new Error(
      'Preflight rejeitado: destino não é o Operations Worker local esperado.',
    );
  }
  const context = await localJson('/v1/me/tenants', {}, fetchImpl);
  if (
    context.status !== 200 ||
    !JSON.stringify(context.payload?.data ?? {}).includes(tenantId)
  ) {
    throw new Error(
      'Preflight rejeitado: identidade sintética sem acesso ao tenant-dev-001 local.',
    );
  }
}

export async function executeDemoPlan(plan, fetchImpl = fetch) {
  const progress = {
    createdOrReplayed: 0,
    confirmedOrAlreadyConfirmed: 0,
    ids: [],
  };
  for (const item of plan) {
    const created = await localJson(
      `/tenants/${tenantId}/appointments`,
      {
        method: 'POST',
        key: item.idempotencyKey,
        body: item.body,
      },
      fetchImpl,
    );
    if (
      created.status !== 201 ||
      typeof created.payload?.data?.id !== 'string'
    ) {
      throw new Error(
        `Falha no agendamento ${item.id}: HTTP ${created.status} (${created.payload?.code ?? 'UNKNOWN'}).`,
      );
    }
    const id = created.payload.data.id;
    progress.ids.push(id);
    progress.createdOrReplayed++;
    if (!item.confirm) continue;
    const detail = await localJson(
      `/tenants/${tenantId}/appointments/${encodeURIComponent(id)}`,
      {},
      fetchImpl,
    );
    if (
      detail.status !== 200 ||
      !Array.isArray(detail.payload?.data?.allowedActions)
    ) {
      throw new Error(
        `Falha ao consultar ações do agendamento ${item.id}: HTTP ${detail.status}.`,
      );
    }
    const { allowedActions, status } = detail.payload.data;
    if (allowedActions.includes('confirm')) {
      const confirmed = await localJson(
        `/tenants/${tenantId}/appointments/${encodeURIComponent(id)}/confirm`,
        {
          method: 'POST',
          key: `${item.idempotencyKey}-confirm`,
          body: {},
        },
        fetchImpl,
      );
      if (confirmed.status !== 200) {
        throw new Error(
          `Falha ao confirmar ${item.id}: HTTP ${confirmed.status} (${confirmed.payload?.code ?? 'UNKNOWN'}).`,
        );
      }
    } else if (!['CONFIRMED', 'confirmed'].includes(status)) {
      throw new Error(
        `Estado inesperado na repetição de ${item.id}; execução interrompida.`,
      );
    }
    progress.confirmedOrAlreadyConfirmed++;
  }
  return progress;
}

async function verifyAgenda(plan, ids, fetchImpl) {
  const first = plan[0].body.startsAt;
  const last = plan[plan.length - 1].body.startsAt;
  const from = new Date(Date.parse(first) - 86_400_000).toISOString();
  const to = new Date(Date.parse(last) + 86_400_000).toISOString();
  const all = new Set();
  let cursor;
  for (let i = 0; i < 30; i++) {
    const params = new URLSearchParams({ from, to, limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const response = await localJson(
      `/tenants/${tenantId}/agenda?${params}`,
      {},
      fetchImpl,
    );
    if (
      response.status !== 200 ||
      !Array.isArray(response.payload?.data?.appointments)
    ) {
      throw new Error(
        'A verificação de agenda retornou erro ou contrato inesperado.',
      );
    }
    for (const appointment of response.payload.data.appointments)
      all.add(appointment.id);
    const page = response.payload.data.page;
    if (!page?.hasMore) break;
    if (!page.nextCursor || page.nextCursor === cursor)
      throw new Error('Paginação de agenda inconsistente.');
    cursor = page.nextCursor;
  }
  if (ids.some((id) => !all.has(id)))
    throw new Error(
      'A consulta da agenda não retornou todos os registros criados.',
    );
  return { validated: ids.length, totalInPeriod: all.size };
}

function applyLocalSql(sqlPath) {
  const result = spawnSync(
    process.execPath,
    [
      wrangler,
      'd1',
      'execute',
      'D1_DATABASE',
      '--local',
      '--env',
      'local',
      '--config',
      config,
      '--file',
      sqlPath,
      '--json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        // Never forward deployment credentials into a local seed subprocess.
        CLOUDFLARE_API_TOKEN: '',
        CLOUDFLARE_ACCOUNT_ID: '',
      },
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      'Inserção cadastral no D1 local falhou; não foram criadas transações.',
    );
  }
}

export async function runDemoSeed(
  args = process.argv.slice(2),
  fetchImpl = fetch,
) {
  const mode = validateDemoArguments(args);
  if (
    mode === '--apply' &&
    (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true')
  ) {
    throw new Error('Aplicação de massa sintética proibida no CI.');
  }
  if (mode === '--preview') {
    const dataset = buildDemoDataset();
    console.log(
      JSON.stringify(
        {
          ...dataset.manifest,
          appointments: dataset.manifest.appointments.slice(0, 3),
        },
        null,
        2,
      ),
    );
    return { mode: 'preview', expected: dataset.manifest.totals };
  }

  // All targets are constant and local; no user-supplied URL, config or remote flag.
  await assertLocalWorker(fetchImpl);
  const base = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (base.tenantId !== tenantId || base.synthetic !== true)
    throw new Error(
      'Seed cadastral local ausente ou inválido. Rode npm run db:seed.',
    );
  const dataset = buildDemoDataset(base.referenceDate);
  const tempDir = await mkdtemp(join(tmpdir(), 'beauty-demo-local-'));
  try {
    const sqlPath = join(tempDir, 'demo.sql');
    await writeFile(sqlPath, dataset.statements.join(';\n') + ';\n');
    applyLocalSql(sqlPath);
    const progress = await executeDemoPlan(
      dataset.manifest.appointments,
      fetchImpl,
    );
    const verified = await verifyAgenda(
      dataset.manifest.appointments,
      progress.ids,
      fetchImpl,
    );
    const report = {
      ...dataset.manifest,
      appointments: undefined,
      applied: progress.createdOrReplayed,
      confirmed: progress.confirmedOrAlreadyConfirmed,
      agendaVerification: verified,
      verifiedAt: new Date().toISOString(),
    };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    return { mode: 'apply', ...report };
  } finally {
    const resolved = resolve(tempDir);
    if (
      dirname(resolved) !== resolve(tmpdir()) ||
      !basename(resolved).startsWith('beauty-demo-local-')
    ) {
      throw new Error('Recusa de limpeza de diretório temporário inesperado.');
    }
    await rm(resolved, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runDemoSeed().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Falha ao gerar a massa de demonstração.',
    );
    process.exitCode = 1;
  });
}
