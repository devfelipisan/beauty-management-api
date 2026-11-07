// Optional, local cross-repository transport proof. Does not deploy or alter production.
import { access, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
await access(resolve(root, '../beauty-management-web/src/server/bff/worker-transport.ts'));
const spec = resolve(root, 'test/workers', `agenda-bff-local-${randomUUID()}.spec.ts`);
const source = `
import { env, exports } from 'cloudflare:workers';
import { beforeAll, expect, it } from 'vitest';
import { workerFetch } from '../../../beauty-management-web/src/server/bff/worker-transport.ts';
import { buildDevelopmentSeed } from '../../database/seeds/development.mjs';
const operations=exports.default as {fetch(request:Request):Promise<Response>};
const headers={authorization:'Bearer actor-dev-admin','x-tenant-id':'tenant-dev-001','x-request-id':'agenda-bff-proof','x-correlation-id':'agenda-bff-proof'};
const forwarded=(path:string,options:{method?:string,body?:string,key?:string,tenantId?:string}={})=>workerFetch(
  new Request('https://web.test/api/bff/qualify',{
    method:options.method??'GET',
    headers:{...headers,...(options.tenantId?{'x-tenant-id':options.tenantId}:{}),...(options.key?{'Idempotency-Key':options.key,'content-type':'application/json'}:{})},
    ...(options.body?{body:options.body}:{})
  }),
  new URL('https://operations.internal'+path),operations,
);
beforeAll(async()=>{await env.D1_DATABASE.batch(buildDevelopmentSeed('2028-11-01').statements.map((sql:string)=>env.D1_DATABASE.prepare(sql)));});
it('uses current BFF transport with private Operations, D1 and tenant isolation',async()=>{
  const create=await operations.fetch(new Request('https://operations.test/tenants/tenant-dev-001/appointments',{method:'POST',headers:{...headers,'content-type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({customerId:'mock-customer-maria',serviceId:'mock-service-consulta',professionalId:'mock-professional-ana',startsAt:'2028-11-01T09:00:00Z',origin:'RECEPTION'})}));
  expect(create.status).toBe(201);
  const id=(await create.json() as {data:{id:string}}).data.id;
  const period='from=2028-11-01T00:00:00Z&to=2028-11-02T00:00:00Z';
  const read=await forwarded('/tenants/tenant-dev-001/agenda?'+period);
  expect(read.status).toBe(200);
  const agenda=(await read.json() as {data:{appointments:{id:string;status:string}[]}}).data;
  expect(agenda.appointments).toEqual([expect.objectContaining({id,status:'AWAITING_CONFIRMATION'})]);
  expect(read.headers.get('x-correlation-id')).toBe('agenda-bff-proof');
  const detail=await forwarded('/tenants/tenant-dev-001/appointments/'+id);
  expect((await detail.json() as {data:{allowedActions:string[]}}).data.allowedActions).toEqual(['confirm']);
  const confirm=await forwarded('/tenants/tenant-dev-001/appointments/'+id+'/confirm',{method:'POST',body:'{}',key:crypto.randomUUID()});
  expect(confirm.status).toBe(200);
  const state=await env.D1_DATABASE.prepare('SELECT status FROM appointments WHERE tenant_id=? AND id=?').bind('tenant-dev-001',id).first<{status:string}>();
  expect(state?.status).toBe('CONFIRMED');
  const switched=await forwarded('/tenants/tenant-other/agenda?'+period,{tenantId:'tenant-other'});
  expect(switched.status).toBe(200);
  expect((await switched.json() as {data:{appointments:unknown[]}}).data.appointments).toEqual([]);
});
`;
await writeFile(spec, source, { flag: 'wx' });
try {
  const result = spawnSync(process.execPath, [
    resolve(root, 'node_modules/vitest/vitest.mjs'),
    'run', '--config', resolve(root, 'vitest.config.workers.mjs'), spec,
  ], { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(spec);
}
