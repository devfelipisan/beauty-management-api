import {env,exports} from 'cloudflare:workers';
import {beforeAll,describe,expect,it} from 'vitest';

const worker=exports.default as {fetch(request:Request):Promise<Response>};
const tenantId='tenant-dev-001';
const run=crypto.randomUUID();
const customerId=`change-customer-${run}`;
const serviceId=`change-service-${run}`;
const professionalId=`change-professional-${run}`;

async function seed(){
  await env.D1_DATABASE.batch([
    env.D1_DATABASE.prepare("INSERT OR IGNORE INTO tenants (id,legal_name,display_name,document,timezone,status,created_at,updated_at) VALUES (?,? ,?,?,?,'ACTIVE',?,?)").bind(tenantId,'Development Tenant','Development',`888${run.replaceAll('-','').slice(0,11)}`,'America/Sao_Paulo','2028-01-01','2028-01-01'),
    env.D1_DATABASE.prepare("INSERT INTO customers (id,tenant_id,full_name,status,relationship_profile,blocked_for_new_appointments,created_at,updated_at) VALUES (?,?,'Change Customer','ACTIVE','NEW',0,?,?)").bind(customerId,tenantId,'2028-01-01','2028-01-01'),
    env.D1_DATABASE.prepare("INSERT INTO services (id,tenant_id,name,category,duration_minutes,base_price_cents,status,requires_assessment,allows_discount,deposit_mode,created_at,updated_at) VALUES (?,?,'Change Service','GENERAL',60,20000,'ACTIVE',0,0,'NOT_REQUIRED',?,?)").bind(serviceId,tenantId,'2028-01-01','2028-01-01'),
    env.D1_DATABASE.prepare("INSERT INTO professionals (id,tenant_id,name,status,public_visible,created_at,updated_at) VALUES (?,?,'Change Professional','ACTIVE',1,?,?)").bind(professionalId,tenantId,'2028-01-01','2028-01-01'),
    env.D1_DATABASE.prepare('INSERT INTO professional_services (tenant_id,professional_id,service_id,created_at) VALUES (?,?,?,?)').bind(tenantId,professionalId,serviceId,'2028-01-01'),
    env.D1_DATABASE.prepare("INSERT INTO licenses (id,tenant_id,plan_id,starts_at,status,limits_json,enabled_resources_json) VALUES (?,?,'plan-change',?,'ACTIVE','{}','[\"APPOINTMENT_ADMISSION\"]')").bind(`change-license-${run}`,tenantId,'2028-01-01T00:00:00.000Z'),
  ]);
}

function req(path:string,method='POST',key?:string,body?:unknown){return worker.fetch(new Request(`https://operations.test${path}`,{method,headers:{authorization:'Bearer actor-dev-admin','x-request-id':`change-request-${run}`,'x-correlation-id':`change-correlation-${run}`,...(key?{'Idempotency-Key':key}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}));}

describe('appointment reschedule authoritative flow',()=>{
  beforeAll(seed);
  it('preserves the same appointment, history, audit and idempotent replay',async()=>{
    const created=await req(`/tenants/${tenantId}/appointments`,'POST',`create-change-${run}`,{customerId,serviceId,professionalId,startsAt:'2028-05-10T09:00:00.000Z',origin:'RECEPTION'});
    expect(created.status).toBe(201);
    const appointmentId=((await created.json() as {data:{id:string}}).data.id);
    const key=`reschedule-${run}`;
    const body={startsAt:'2028-05-10T11:00:00.000Z',professionalId,reason:'Customer requested a new time'};
    const first=await req(`/tenants/${tenantId}/appointments/${appointmentId}/reschedule`,'POST',key,body);
    expect(first.status).toBe(200);
    expect((await first.json() as {data:Record<string,unknown>}).data).toMatchObject({appointmentId,status:'RESCHEDULED',startsAt:body.startsAt,professionalId});
    const replay=await req(`/tenants/${tenantId}/appointments/${appointmentId}/reschedule`,'POST',key,body);
    expect(replay.status).toBe(200);
    const counts=await env.D1_DATABASE.batch([
      env.D1_DATABASE.prepare('SELECT COUNT(*) AS count FROM appointment_reschedule_history WHERE tenant_id=? AND appointment_id=?').bind(tenantId,appointmentId),
      env.D1_DATABASE.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE tenant_id=? AND resource_id=? AND action='appointment.rescheduled'").bind(tenantId,appointmentId),
      env.D1_DATABASE.prepare("SELECT COUNT(*) AS count FROM outbox_events WHERE tenant_id=? AND aggregate_id=? AND event_type='AppointmentRescheduled'").bind(tenantId,appointmentId),
    ]);
    expect(counts.map(x=>(x as {results:Array<{count:number}>}).results[0].count)).toEqual([1,1,1]);
  });
});
