import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentTenant, TenantGuard, type TenantContext } from '@beauty/tenancy';
import { AuthenticationGuard, PermissionGuard, RequirePermission } from '@beauty/authentication';
import { CreateProfessionalUseCase, DeactivateProfessionalUseCase, GetProfessionalUseCase, ListProfessionalsUseCase, UpdateProfessionalUseCase } from '@beauty/operations/modules/professionals/application/use-cases';
import type { CreateProfessionalDto } from './http/dto/create-professional.dto.js';

@UseGuards(AuthenticationGuard, TenantGuard, PermissionGuard)
@Controller('tenants/:tenantId/professionals')
@RequirePermission('professional.read')
export class ProfessionalsController {
  constructor(private readonly create: CreateProfessionalUseCase, private readonly get: GetProfessionalUseCase, private readonly list: ListProfessionalsUseCase, private readonly update: UpdateProfessionalUseCase, private readonly deactivate: DeactivateProfessionalUseCase) {}
  @Post() @RequirePermission('professional.create') createProfessional(@CurrentTenant() tenant: TenantContext, @Body() body: CreateProfessionalDto) { return this.create.execute({ ...body, tenantId: tenant.tenantId } as never); }
  @Get() listProfessionals(@CurrentTenant() tenant: TenantContext, @Query('limit') limit?: string, @Query('cursor') cursor?: string) { return this.list.execute(tenant.tenantId, Number(limit) || undefined, cursor); }
  @Get(':id') getProfessional(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) { return this.get.execute(tenant.tenantId, id); }
  @Patch(':id') updateProfessional(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.update.execute(tenant.tenantId, id, body as never); }
  @Delete(':id') deactivateProfessional(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) { return this.deactivate.execute(tenant.tenantId, id); }
}
