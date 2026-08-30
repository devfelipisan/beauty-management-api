import { Inject, Injectable } from '@nestjs/common';
import { Tenant } from '../domain/tenant.js';
import { TENANT_REPOSITORY, type TenantRepository } from '../ports/tenant-repository.js';
@Injectable() export class CreateTenantUseCase { constructor(@Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository) {} async execute(input: Parameters<typeof Tenant.create>[1]) { const tenant = Tenant.create(crypto.randomUUID(), input); if (await this.repo.findByDocument(tenant.data.document)) throw new Error('TENANT_DOCUMENT_CONFLICT'); await this.repo.create(tenant); return tenant; } }
@Injectable() export class GetTenantUseCase { constructor(@Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository) {} execute(id: string) { return this.repo.findById(id); } }
@Injectable() export class UpdateTenantUseCase { constructor(@Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository) {} async execute(id: string, input: Parameters<typeof Tenant.create>[1]) { const tenant = await this.repo.findById(id); if (!tenant) return null; tenant.update(input); await this.repo.update(tenant); return tenant; } }
