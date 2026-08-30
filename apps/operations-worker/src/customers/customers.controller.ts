import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentTenant, TenantGuard, type TenantContext } from '../../../../libs/tenancy/src/index.js';
import { AuthenticationGuard, PermissionGuard, RequirePermission } from '../../../../libs/authentication/src/index.js';
import { CreateCustomerUseCase, DeactivateCustomerUseCase, GetCustomerUseCase, ListCustomersUseCase, UpdateCustomerUseCase } from './application/use-cases.js';
import type { CreateCustomerDto } from './adapters/http/dto/create-customer.dto.js';

@UseGuards(AuthenticationGuard, TenantGuard, PermissionGuard)
@Controller('tenants/:tenantId/customers')
@RequirePermission('customer.read')
export class CustomersController {
  constructor(private readonly create: CreateCustomerUseCase, private readonly get: GetCustomerUseCase, private readonly list: ListCustomersUseCase, private readonly update: UpdateCustomerUseCase, private readonly deactivate: DeactivateCustomerUseCase) {}
  @Post() @RequirePermission('customer.create') createCustomer(@CurrentTenant() tenant: TenantContext, @Body() body: CreateCustomerDto) { return this.create.execute({ ...body, tenantId: tenant.tenantId } as never); }
  @Get() listCustomers(@CurrentTenant() tenant: TenantContext, @Query('limit') limit?: string, @Query('cursor') cursor?: string) { return this.list.execute(tenant.tenantId, Number(limit) || undefined, cursor); }
  @Get(':id') getCustomer(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) { return this.get.execute(tenant.tenantId, id); }
  @Patch(':id') updateCustomer(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.update.execute(tenant.tenantId, id, body as never); }
  @Delete(':id') deactivateCustomer(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) { return this.deactivate.execute(tenant.tenantId, id); }
}
