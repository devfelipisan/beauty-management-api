import type { AssessmentResult } from '@beauty/contracts';
export interface AssessmentProps { id:string; tenantId:string; customerId:string; serviceId:string; professionalId:string; result:AssessmentResult; performedAt:string; validUntil?:string; }
export class Assessment { constructor(readonly data:AssessmentProps){} }
