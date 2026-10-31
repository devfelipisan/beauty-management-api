import { AppointmentEligibilityPolicy } from './appointment-eligibility-policy.js';
describe('AppointmentEligibilityPolicy', () => {
  it('requires valid assessment when assessment is mandatory and exposes the result eligibility', () => {
    const policy = new AppointmentEligibilityPolicy();
    const blocked = policy.evaluate({
      ...base,
      assessmentRequired: true,
      assessmentValid: false,
    });
    expect(blocked.reason).toBe('ASSESSMENT_INVALID');
    expect(blocked.eligible).toBe(false);
    expect(
      policy.evaluate({
        ...base,
        assessmentRequired: true,
        assessmentValid: true,
      }).eligible,
    ).toBe(true);
  });
  const base = {
    tenantOperational: true,
    customerActive: true,
    customerRestricted: false,
    serviceActive: true,
    professionalActive: true,
    professionalEnabled: true,
    licenseOperational: true,
    assessmentRequired: false,
    assessmentValid: false,
    planCapacityAvailable: true,
    professionalAvailable: true,
    timeConflict: false,
  };
  it('returns READY only when every fact is proven', () => {
    expect(new AppointmentEligibilityPolicy().evaluate(base).status).toBe(
      'READY',
    );
  });
  it('fails closed on an unavailable license', () => {
    expect(
      new AppointmentEligibilityPolicy().evaluate({
        ...base,
        licenseOperational: false,
      }).reason,
    ).toBe('LICENSE_NOT_OPERATIONAL');
  });
  it('blocks an inactive customer and never evaluates later facts as permission', () => {
    expect(
      new AppointmentEligibilityPolicy().evaluate({
        ...base,
        customerActive: false,
      }).reason,
    ).toBe('CUSTOMER_INACTIVE');
  });
});
