export interface AssessmentEligibility { required: boolean; valid: boolean; }
export interface AssessmentEligibilityPort { check(input: { tenantId: string; customerId: string; serviceId: string; required: boolean }): Promise<AssessmentEligibility>; }
export const ASSESSMENT_ELIGIBILITY = Symbol('ASSESSMENT_ELIGIBILITY');
