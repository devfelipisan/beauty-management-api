import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
import { Deposit, type DepositStatus } from '../domain/deposit.js';
import type { DepositRepository } from '../ports/deposit-repository.js';
type Row={id:string;tenant_id:string;appointment_id:string;amount_cents:number;status:DepositStatus;expires_at?:string;confirmed_at?:string;canceled_at?:string;created_at:string;updated_at:string};
export class D1DepositRepository implements DepositRepository {
  constructor(private readonly db:D1DatabaseLike){}
  private map(r:Row){return Deposit.create(r.id,{tenantId:r.tenant_id,appointmentId:r.appointment_id,amountCents:r.amount_cents,status:r.status,expiresAt:r.expires_at??undefined,confirmedAt:r.confirmed_at??undefined,canceledAt:r.canceled_at??undefined,createdAt:r.created_at,updatedAt:r.updated_at});}
  async findById(tenantId:string,id:string){const r=await this.db.prepare('SELECT * FROM deposits WHERE tenant_id = ? AND id = ?').bind(tenantId,id).first<Row>();return r?this.map(r):null;}
  async findByAppointment(tenantId:string,appointmentId:string){const r=await this.db.prepare('SELECT * FROM deposits WHERE tenant_id = ? AND appointment_id = ?').bind(tenantId,appointmentId).first<Row>();return r?this.map(r):null;}
  async create(deposit:Deposit,tx:TransactionalWriteContext){const x=deposit.data;tx.add({kind:'D1_SQL',failureCode:'DEPOSIT_ALREADY_EXISTS',expectedChanges:1,sql:'INSERT INTO deposits (id,tenant_id,appointment_id,amount_cents,status,expires_at,confirmed_at,canceled_at,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',params:[deposit.id,x.tenantId,x.appointmentId,x.amountCents,x.status,x.expiresAt??null,x.confirmedAt??null,x.canceledAt??null,x.createdAt,x.updatedAt]});}
  async transition(tenantId:string,id:string,from:DepositStatus,to:DepositStatus,at:string,tx:TransactionalWriteContext){const confirmed=to==='CONFIRMED'?at:null;const canceled=to==='CANCELED'?at:null;tx.add({kind:'D1_SQL',failureCode:'DEPOSIT_TRANSITION_CONFLICT',expectedChanges:1,sql:'UPDATE deposits SET status = ?, confirmed_at = COALESCE(?, confirmed_at), canceled_at = COALESCE(?, canceled_at), version = version + 1, updated_at = ? WHERE tenant_id = ? AND id = ? AND status = ?',params:[to,confirmed,canceled,at,tenantId,id,from]});}
}
