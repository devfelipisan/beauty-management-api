export interface ProfessionalServiceEligibilityPort { isEnabled(tenantId: string, professionalId: string, serviceId: string): Promise<boolean>; }
export const PROFESSIONAL_SERVICE_ELIGIBILITY = Symbol('PROFESSIONAL_SERVICE_ELIGIBILITY');
