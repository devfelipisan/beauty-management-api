// Optional, local cross-repository proof. Does not change either application.
import { access, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
await access(
  resolve(root, '../beauty-management-web/src/server/bff/worker-transport.ts'),
);
const spec = resolve(
  root,
  'test/workers',
  `agenda-bff-local-${randomUUID()}.spec.ts`,
);
const source = `
import { env, exports } from 'cloudflare:workers';
import { beforeAll, expect, it } from 'vitest';
import { workerRequest } from '../../../beauty-management-web/src/server/bff/worker-transport.ts';
import { buildDevelopmentSeed } from '../../database/seeds/development.mjs';
const operations=exports.default as {fetch(request:Request):Promise<Response>};
const headers={authorization:'Bearer actor-dev-admin','x-tenant-id':'tenant-dev-001','x-workspace-role':'administrator','x-request-id':'agenda-bff-proof','x-correlation-id':'agenda-bff-proof'};
beforeAll(async()=>{await env.D1_DATABASE.batch(buildDevelopmentSeed('2028-11-01').statements.map((sql:string)=>env.D1_DATABASE.prepare(sql)));});
it('runs BFF transport through the real Operations Worker, user RPC dependencies and D1',async()=>{
  const create=await operations.fetch(new Request('https://operations.test/tenants/tenant-dev-001/appointments',{method:'POST',headers:{...headers,'content-type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({customerId:'mock-customer-maria',serviceId:'mock-service-consulta',professionalId:'mock-professional-ana',startsAt:'2028-11-01T09:00:00Z',origin:'RECEPTION'})}));
  expect(create.status).toBe(201);
  const id=(await create.json() as {data:{id:string}}).data.id;
  const read=await workerRequest(new Request('https://web.test',{headers}),'/v1/agenda?from=2028-11-01T00:00:00Z&to=2028-11-02T00:00:00Z',{OPERATIONS_SERVICE:operations});
  expect(read.status).toBe(200);
  const data=await read.json() as {appointments:{id:string;status:string}[];customers:unknown[]};
  expect(data.appointments).toEqual([expect.objectContaining({id,status:'awaiting_confirmation'})]);
  expect(data.customers).toHaveLength(1);
  expect(read.headers.get('x-correlation-id')).toBe('agenda-bff-proof');
  const detail=await workerRequest(new Request('https://web.test',{headers}),'/v1/agenda/appointments/'+id,{OPERATIONS_SERVICE:operations});
  expect((await detail.json() as {allowedActions:string[]}).allowedActions).toEqual(['confirm']);
  const confirm=await workerRequest(new Request('https://web.test',{method:'POST',headers:{...headers,'Idempotency-Key':crypto.randomUUID()},body:'{}'}),'/v1/agenda/appointments/'+id+'/confirm',{OPERATIONS_SERVICE:operations});
  expect(confirm.status).toBe(200);
  const state=await env.D1_DATABASE.prepare('SELECT status FROM appointments WHERE tenant_id=? AND id=?').bind('tenant-dev-001',id).first<{status:string}>();
  expect(state?.status).toBe('CONFIRMED');
  const switched=await workerRequest(new Request('https://web.test',{headers:{...headers,'x-tenant-id':'tenant-other'}}),'/v1/agenda?from=2028-11-01T00:00:00Z&to=2028-11-02T00:00:00Z',{OPERATIONS_SERVICE:operations});
  expect((await switched.json() as {appointments:unknown[]}).appointments).toEqual([]);
});
`;
await writeFile(spec, source, { flag: 'wx' });
try {
  const result = spawnSync(
    process.execPath,
    [
      resolve(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      resolve(root, 'vitest.config.workers.mjs'),
      spec,
    ],
    { cwd: root, stdio: 'inherit', env: process.env },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  // Exact file created above, never a recursive delete or a computed directory.
  await rm(spec);
}
