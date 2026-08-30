import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateTenantUseCase, GetTenantUseCase, UpdateTenantUseCase } from './application/use-cases.js';
import type { CreateTenantDto } from './adapters/http/dto/create-tenant.dto.js';
import type { UpdateTenantDto } from './adapters/http/dto/update-tenant.dto.js';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly create: CreateTenantUseCase, private readonly get: GetTenantUseCase, private readonly update: UpdateTenantUseCase) {}
  @Post() createTenant(@Body() body: CreateTenantDto) { return this.create.execute(body as never); }
  @Get(':id') getTenant(@Param('id') id: string) { return this.get.execute(id); }
  @Patch(':id') updateTenant(@Param('id') id: string, @Body() body: UpdateTenantDto) { return this.update.execute(id, body as never); }
}
