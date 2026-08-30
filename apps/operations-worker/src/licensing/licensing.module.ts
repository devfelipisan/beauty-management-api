import { Module } from '@nestjs/common';
import { D1LicenseRepository } from './adapters/d1-license-repository.js';
import { D1LicenseEligibilityAdapter, D1PlanLimitAdapter } from './adapters/appointment-admission-adapters.js';
import { LICENSE_REPOSITORY } from './ports/license-repository.js';
@Module({providers:[D1LicenseRepository,D1LicenseEligibilityAdapter,D1PlanLimitAdapter,{provide:LICENSE_REPOSITORY,useExisting:D1LicenseRepository}],exports:[LICENSE_REPOSITORY,D1LicenseEligibilityAdapter,D1PlanLimitAdapter]}) export class LicensingModule{}
