export interface DepositDecision { available:boolean; required?:boolean; amountCents?:number; }
export interface DepositPolicyPort { evaluate(input:{tenantId:string;serviceId:string;finalPriceCents:number}):Promise<DepositDecision>; }
export const DEPOSIT_POLICY = Symbol('DEPOSIT_POLICY');
