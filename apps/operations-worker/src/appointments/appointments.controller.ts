import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthenticationGuard } from '../../../../libs/authentication/src/index.js';
import { CurrentTenant, TenantGuard, type TenantContext } from '../../../../libs/tenancy/src/index.js';
import { CheckProfessionalAvailabilityUseCase } from './application/check-professional-availability.use-case.js';
@Controller('tenants/:tenantId/professionals/:professionalId/availability') @UseGuards(AuthenticationGuard,TenantGuard)
export class AppointmentsController { constructor(private readonly check:CheckProfessionalAvailabilityUseCase) {} @Get() checkAvailability(@CurrentTenant() tenant:TenantContext,@Param('professionalId') professionalId:string,@Query('from') from:string,@Query('to') to:string) { return this.check.execute(tenant.tenantId,professionalId,from,to); } }
