import { DomainError, Entity } from '../../../../../libs/kernel/src/index.js';

export type SessionStatus='IN_PROGRESS'|'COMPLETED';
export interface SessionProps { tenantId:string; appointmentId:string; customerId:string; serviceId:string; professionalId:string; status:SessionStatus; startedAt:string; startedBy:string; completedAt?:string; completedBy?:string; completionRequirements?:{requiresTechnicalForm?:boolean;requiresPower?:boolean;requiresEquipment?:boolean;requiresPhotography?:boolean}; createdAt:string; updatedAt:string; }
export class Session extends Entity<string> {
  private constructor(id:string,private readonly props:SessionProps){super(id);}
  static start(id:string,props:Omit<SessionProps,'status'|'createdAt'|'updatedAt'> & Partial<Pick<SessionProps,'createdAt'|'updatedAt'>>,now=new Date().toISOString()){if(!props.tenantId||!props.appointmentId||!props.customerId||!props.serviceId||!props.professionalId||!props.startedBy)throw new DomainError('SESSION_INVALID','Session references and executor are required');return new Session(id,{...props,status:'IN_PROGRESS',createdAt:props.createdAt??now,updatedAt:props.updatedAt??now});}
  complete(completedBy:string,completedAt:string){if(this.props.status!=='IN_PROGRESS')throw new DomainError('SESSION_NOT_IN_PROGRESS','Session is not in progress');if(!completedBy||!completedAt)throw new DomainError('SESSION_COMPLETION_INVALID','Completion actor and time are required');return new Session(this.id,{...this.props,status:'COMPLETED',completedAt,completedBy,updatedAt:completedAt});}
  static restore(id:string,props:SessionProps){return new Session(id,props);}
  get data():Readonly<SessionProps>{return {...this.props};}
}
