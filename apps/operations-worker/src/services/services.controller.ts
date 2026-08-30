import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentTenant, TenantGuard, type TenantContext } from '../../../../libs/tenancy/src/index.js';
import { AuthenticationGuard, PermissionGuard, RequirePermission } from '../../../../libs/authentication/src/index.js';
import { CreateServiceUseCase, DeactivateServiceUseCase, GetServiceUseCase, ListServicesUseCase, UpdateServiceUseCase } from './application/use-cases.js';
import type { CreateServiceDto } from './adapters/http/dto/create-service.dto.js';

@UseGuards(AuthenticationGuard, TenantGuard, PermissionGuard)
@Controller('tenants/:tenantId/services')
@RequirePermission('service.read')
export class ServicesController {
  constructor(private readonly create: CreateServiceUseCase, private readonly get: GetServiceUseCase, private readonly list: ListServicesUseCase, private readonly update: UpdateServiceUseCase, private readonly deactivate: DeactivateServiceUseCase) {}
  @Post() @RequirePermission('service.create') createService(@CurrentTenant() tenant: TenantContext, @Body() body: CreateServiceDto) { return this.create.execute({ ...body, tenantId: tenant.tenantId } as never); }
  @Get() listServices(@CurrentTenant() tenant: TenantContext, @Query('limit') limit?: string, @Query('cursor') cursor?: string) { return this.list.execute(tenant.tenantId, Number(limit) || undefined, cursor); }
  @Get(':id') getService(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) { return this.get.execute(tenant.tenantId, id); }
  @Patch(':id') updateService(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.update.execute(tenant.tenantId, id, body as never); }
  @Delete(':id') deactivateService(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) { return this.deactivate.execute(tenant.tenantId, id); }
}
