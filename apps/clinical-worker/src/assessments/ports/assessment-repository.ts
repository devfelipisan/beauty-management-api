import type { Assessment } from '../domain/assessment.js';
export interface AssessmentRepository { findLatest(tenantId:string,customerId:string,serviceId:string,professionalId:string):Promise<Assessment|null>; }
export const ASSESSMENT_REPOSITORY=Symbol('ASSESSMENT_REPOSITORY');
