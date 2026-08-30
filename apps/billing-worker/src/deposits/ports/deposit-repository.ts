import type { TransactionalWriteContext } from '../../../../../libs/reliability/src/unit-of-work/transactional-write-context.js';
import type { Deposit, DepositStatus } from '../domain/deposit.js';
export interface DepositRepository { findById(tenantId:string,id:string):Promise<Deposit|null>; findByAppointment(tenantId:string,appointmentId:string):Promise<Deposit|null>; create(deposit:Deposit,tx:TransactionalWriteContext):Promise<void>; transition(tenantId:string,id:string,from:DepositStatus,to:DepositStatus,at:string,tx:TransactionalWriteContext):Promise<void>; }
export const DEPOSIT_REPOSITORY=Symbol('DEPOSIT_REPOSITORY');
