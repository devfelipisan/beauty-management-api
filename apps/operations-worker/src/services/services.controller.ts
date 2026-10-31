import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentTenant,
  TenantGuard,
  type TenantContext,
} from '@beauty/tenancy';
import {
  AuthenticationGuard,
  PermissionGuard,
  RequirePermission,
} from '@beauty/authentication';
import {
  CreateServiceUseCase,
  DeactivateServiceUseCase,
  GetServiceUseCase,
  ListServicesUseCase,
  UpdateServiceUseCase,
} from '@beauty/operations/modules/services/application/use-cases';
import type { CreateServiceDto } from './http/dto/create-service.dto.js';

@UseGuards(AuthenticationGuard, TenantGuard, PermissionGuard)
@Controller('tenants/:tenantId/services')
@RequirePermission('service.read')
export class ServicesController {
  constructor(
    private readonly create: CreateServiceUseCase,
    private readonly get: GetServiceUseCase,
    private readonly list: ListServicesUseCase,
    private readonly update: UpdateServiceUseCase,
    private readonly deactivate: DeactivateServiceUseCase,
  ) {}
  @Post() @RequirePermission('service.create') createService(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: CreateServiceDto,
  ) {
    return this.create.execute({ ...body, tenantId: tenant.tenantId } as never);
  }
  @Get() listServices(
    @CurrentTenant() tenant: TenantContext,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.list.execute(
      tenant.tenantId,
      Number(limit) || undefined,
      cursor,
    );
  }
  @Get(':id') getService(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.get.execute(tenant.tenantId, id);
  }
  @Patch(':id') @RequirePermission('service.update') updateService(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.update.execute(tenant.tenantId, id, body as never);
  }
  @Delete(':id') @RequirePermission('service.deactivate') deactivateService(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.deactivate.execute(tenant.tenantId, id);
  }
}
