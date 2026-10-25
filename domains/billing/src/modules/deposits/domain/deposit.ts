import { DomainError, Entity } from '@beauty/kernel';

export type DepositStatus = 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELED' | 'RETURNED' | 'RETAINED' | 'CONVERTED_TO_CREDIT';
export interface DepositProps { tenantId:string; appointmentId:string; amountCents:number; status:DepositStatus; expiresAt?:string; confirmedAt?:string; canceledAt?:string; createdAt:string; updatedAt:string; }
export class Deposit extends Entity<string> {
  private constructor(id:string, private props:DepositProps) { super(id); }
  static create(id:string, props:Omit<DepositProps,'status'|'createdAt'|'updatedAt'> & Partial<Pick<DepositProps,'status'|'createdAt'|'updatedAt'>>, now=new Date().toISOString()) { if(!props.tenantId||!props.appointmentId||!Number.isInteger(props.amountCents)||props.amountCents<0)throw new DomainError('DEPOSIT_INVALID','Deposit references and amount are required'); return new Deposit(id,{...props,status:props.status??'PENDING',createdAt:props.createdAt??now,updatedAt:props.updatedAt??now}); }
  get data():Readonly<DepositProps>{return {...this.props};}
}
