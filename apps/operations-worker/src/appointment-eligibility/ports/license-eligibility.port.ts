export interface LicenseEligibility { operational: boolean; }
export interface LicenseEligibilityPort { check(input: { tenantId: string }): Promise<LicenseEligibility>; }
export const LICENSE_ELIGIBILITY = Symbol('LICENSE_ELIGIBILITY');
