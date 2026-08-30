import { Injectable } from '@nestjs/common';
import type { AssessmentEligibilityPort } from '../ports/assessment-eligibility.port.js';
import type { CustomerRestrictionPort } from '../ports/customer-restriction.port.js';
import type { LicenseEligibilityPort } from '../ports/license-eligibility.port.js';
import type { PlanLimitPort } from '../ports/plan-limit.port.js';
@Injectable() export class UnavailableLicenseEligibility implements LicenseEligibilityPort { async check() { return { operational: false }; } }
@Injectable() export class UnavailableAssessmentEligibility implements AssessmentEligibilityPort { async check(input: { required: boolean }) { return { required: input.required, valid: false }; } }
@Injectable() export class UnavailableCustomerRestriction implements CustomerRestrictionPort { async check() { return { restricted: true }; } }
@Injectable() export class UnavailablePlanLimit implements PlanLimitPort { async check() { return { capacityAvailable: false }; } }
