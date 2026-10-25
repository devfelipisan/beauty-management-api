import { Tenant } from '../domain/tenant.js';
import { type TenantRepository } from '../ports/tenant-repository.js';
export class CreateTenantUseCase { constructor(private readonly repo: TenantRepository) {} async execute(input: Parameters<typeof Tenant.create>[1]) { const tenant = Tenant.create(crypto.randomUUID(), input); if (await this.repo.findByDocument(tenant.data.document)) throw new Error('TENANT_DOCUMENT_CONFLICT'); await this.repo.create(tenant); return tenant; } }
export class GetTenantUseCase { constructor(private readonly repo: TenantRepository) {} execute(id: string) { return this.repo.findById(id); } }
export class UpdateTenantUseCase { constructor(private readonly repo: TenantRepository) {} async execute(id: string, input: Parameters<typeof Tenant.create>[1]) { const tenant = await this.repo.findById(id); if (!tenant) return null; tenant.update(input); await this.repo.update(tenant); return tenant; } }
