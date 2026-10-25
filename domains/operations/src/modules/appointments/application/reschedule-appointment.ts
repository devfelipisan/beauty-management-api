import type {RescheduleAppointmentRequest,RescheduleAppointmentResponse} from '@beauty/contracts';
import type {AppointmentRepository} from '../ports/appointment-repository.js';
import type {UnitOfWork} from '@beauty/reliability/unit-of-work/unit-of-work';
import type {IdempotencyStore} from '@beauty/reliability/idempotency/idempotency-store';
import {IdempotencyService} from '@beauty/reliability/idempotency/idempotency.service';
import type { AppointmentChangeRepository } from '../ports/appointment-change-repository.js';

const tx=(s:IdempotencyStore,t:any):IdempotencyStore=>({find:(a,b,c)=>s.find(a,b,c),reserve:r=>t.idempotency.reserve(r),complete:(a,b,c,d)=>t.idempotency.complete(a,b,c,d),fail:(a,b,c)=>t.idempotency.fail(a,b,c)});

export class RescheduleAppointment {
  constructor(private readonly appointments:AppointmentRepository,private readonly changes:AppointmentChangeRepository,private readonly uow:UnitOfWork,private readonly store:IdempotencyStore,private readonly idem=new IdempotencyService()){}
  async execute(i:RescheduleAppointmentRequest):Promise<RescheduleAppointmentResponse>{
    if(!i.reason?.trim())throw new Error('RESCHEDULE_REASON_REQUIRED');
    const a=await this.appointments.findById(i.tenantId,i.appointmentId); if(!a)throw new Error('APPOINTMENT_NOT_FOUND');
    const endsAt=new Date(Date.parse(i.startsAt)+a.data.interval.durationMinutes*60000).toISOString();
    const conflicts=await this.appointments.findConflicts(i.tenantId,i.professionalId,{startsAt:i.startsAt,endsAt,durationMinutes:a.data.interval.durationMinutes} as never);
    if(conflicts.some(x=>x.id!==a.id))throw new Error('APPOINTMENT_TIME_CONFLICT');
    const at=new Date().toISOString();
    return this.uow.execute(async t=>{
      const k=await this.idem.reserveOrReplay(tx(this.store,t),i.tenantId,'RESCHEDULE_APPOINTMENT',i.idempotencyKey,i);
      if(k.replay)return k.record.response as RescheduleAppointmentResponse;
      if(['COMPLETED','CANCELED','NO_SHOW','IN_PROGRESS'].includes(a.data.status))throw new Error('APPOINTMENT_RESCHEDULE_NOT_ALLOWED');
      this.changes.reschedule({tenantId:i.tenantId,appointmentId:a.id,startsAt:new Date(i.startsAt).toISOString(),endsAt,professionalId:i.professionalId,previousStartsAt:a.data.interval.startsAt,previousEndsAt:a.data.interval.endsAt,previousProfessionalId:a.data.professionalId,reason:i.reason,changedAt:at,changedBy:i.actorId,requestId:i.requestId},t.persistence);
      const out={appointmentId:a.id,status:'RESCHEDULED' as const,startsAt:new Date(i.startsAt).toISOString(),professionalId:i.professionalId};
      await t.audit.append({id:crypto.randomUUID(),tenantId:i.tenantId,actorId:i.actorId,action:'appointment.rescheduled',resourceType:'APPOINTMENT',resourceId:a.id,requestId:i.requestId,correlationId:i.correlationId,occurredAt:at,metadata:{reason:i.reason,previousStartsAt:a.data.interval.startsAt,newStartsAt:out.startsAt,previousProfessionalId:a.data.professionalId,newProfessionalId:i.professionalId}});
      await t.outbox.append({id:crypto.randomUUID(),tenantId:i.tenantId,type:'AppointmentRescheduled',aggregateType:'APPOINTMENT',aggregateId:a.id,correlationId:i.correlationId,payload:{...out,tenantId:i.tenantId,reason:i.reason},status:'PENDING',createdAt:at});
      await t.idempotency.complete(i.tenantId,'RESCHEDULE_APPOINTMENT',i.idempotencyKey,out); return out;
    });
  }
}
