import { Module } from '@nestjs/common';
import { D1LicenseRepository } from '@beauty/operations/modules/licensing/infrastructure/d1-license-repository';
import { D1LicenseEligibilityAdapter, D1PlanLimitAdapter } from '@beauty/operations/modules/licensing/infrastructure/appointment-admission-adapters';
import { LICENSE_REPOSITORY } from '@beauty/operations/modules/licensing/ports/license-repository';
@Module({providers:[D1LicenseRepository,D1LicenseEligibilityAdapter,D1PlanLimitAdapter,{provide:LICENSE_REPOSITORY,useExisting:D1LicenseRepository}],exports:[LICENSE_REPOSITORY,D1LicenseEligibilityAdapter,D1PlanLimitAdapter]}) export class LicensingModule{}
