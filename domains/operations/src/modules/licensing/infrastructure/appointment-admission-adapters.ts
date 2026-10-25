import type { LicenseRepository } from '../ports/license-repository.js';
import { LicenseOperationalPolicy } from '../domain/license-operational-policy.js';
import type { LicenseEligibilityPort } from '../../appointment-eligibility/ports/license-eligibility.port.js';
import type { PlanLimitPort } from '../../appointment-eligibility/ports/plan-limit.port.js';
export class D1LicenseEligibilityAdapter implements LicenseEligibilityPort { constructor(private readonly repo:LicenseRepository){} async check(input:{tenantId:string}){const l=await this.repo.findCurrentByTenant(input.tenantId); return {operational:Boolean(l&&new LicenseOperationalPolicy().admitsAppointments(l))};} }
export class D1PlanLimitAdapter implements PlanLimitPort { constructor(private readonly repo:LicenseRepository){} async check(input:{tenantId:string;operation:string}){const l=await this.repo.findCurrentByTenant(input.tenantId); return {capacityAvailable:Boolean(l&&new LicenseOperationalPolicy().admitsAppointments(l)&&l.data.enabledResources.includes('APPOINTMENT_ADMISSION'))};} }
