import type { D1DatabaseLike } from '../../../../../libs/database/src/d1/d1.types.js';
import type { AppointmentChangeFinancialDecision, FinancialDecisionSnapshotV2, PaymentRefundDecision } from '../../../../../libs/contracts/src/index.js';

type Deposit={id:string;status:string;amount_cents:number;version:number};
type Receivable={id:string;status:string;net_amount_cents:number;paid_amount_cents:number;outstanding_amount_cents:number;version:number};
type Payment={id:string;amount_cents:number;refunded_amount_cents:number;version:number};

function canonical(value:unknown):string { return JSON.stringify(value,(key,item)=>key==='payments'&&Array.isArray(item)?[...item].sort((a,b)=>String(a.paymentId).localeCompare(String(b.paymentId))):item); }
export async function financialSnapshotFingerprint(value:unknown):Promise<string>{const bytes=new TextEncoder().encode(canonical(value));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}

export class BuildFinancialDecisionSnapshot {
  constructor(private readonly db:D1DatabaseLike){}
  async execute(i:{tenantId:string;appointmentId:string;customerId:string;depositDisposition:AppointmentChangeFinancialDecision['depositDisposition'];paymentDisposition:AppointmentChangeFinancialDecision['paymentDisposition'];receivableDisposition:AppointmentChangeFinancialDecision['receivableDisposition'];policyId:string;policyVersion:number;evaluatedAt:string;relationshipImpact:AppointmentChangeFinancialDecision['relationshipImpact']}):Promise<FinancialDecisionSnapshotV2>{
    const deposit=await this.db.prepare('SELECT id,status,amount_cents,version FROM deposits WHERE tenant_id=? AND appointment_id=?').bind(i.tenantId,i.appointmentId).first<Deposit>();
    const receivable=await this.db.prepare("SELECT id,status,net_amount_cents,paid_amount_cents,outstanding_amount_cents,version FROM receivables WHERE tenant_id=? AND source_type='APPOINTMENT' AND source_id=?").bind(i.tenantId,i.appointmentId).first<Receivable>();
    let rows:{results:Payment[]};
    if(receivable) rows=await this.db.prepare('SELECT id,amount_cents,refunded_amount_cents,version FROM payments WHERE tenant_id=? AND receivable_id=? AND amount_cents>refunded_amount_cents ORDER BY received_at ASC,id ASC LIMIT 100').bind(i.tenantId,receivable.id).all<Payment>();
    else rows={results:[]};
    const payments:PaymentRefundDecision[]=rows.results.map(p=>({paymentId:p.id,paymentAmountCents:p.amount_cents,amountCents:i.paymentDisposition==='REFUND'?p.amount_cents-p.refunded_amount_cents:0,refundableAmountCents:p.amount_cents-p.refunded_amount_cents,paymentVersion:p.version,refundedAmountAtEvaluation:p.refunded_amount_cents}));
    const snapshot={tenantId:i.tenantId,policyId:i.policyId,policyVersion:i.policyVersion,evaluatedAt:i.evaluatedAt,deposit:deposit?{id:deposit.id,status:deposit.status,amountCents:deposit.amount_cents,version:deposit.version}:undefined,receivable:receivable?{id:receivable.id,status:receivable.status,netAmountCents:receivable.net_amount_cents,paidAmountCents:receivable.paid_amount_cents,outstandingAmountCents:receivable.outstanding_amount_cents,version:receivable.version}:undefined,payments,depositDisposition:i.depositDisposition,depositAmountCents:deposit?.status==='CONFIRMED'?deposit.amount_cents:0,paymentDisposition:i.paymentDisposition,refundablePaymentAmountCents:payments.reduce((total,p)=>total+p.refundableAmountCents,0),creditAmountCents:i.depositDisposition==='CONVERT_TO_CREDIT'?(deposit?.amount_cents??0):0,receivableDisposition:i.receivableDisposition,relationshipImpact:i.relationshipImpact,financialStateVersion:`${deposit?.version??0}:${receivable?.version??0}`};
    return {...snapshot,financialFingerprint:await financialSnapshotFingerprint(snapshot)};
  }
}
