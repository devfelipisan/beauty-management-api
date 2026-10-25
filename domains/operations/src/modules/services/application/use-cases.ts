import { Service, ServiceStatus } from '../domain/service.js';
import { type ServiceRepository } from '../ports/service-repository.js';
const page = (limit = 20) => Math.min(Math.max(limit, 1), 100);
export class CreateServiceUseCase { constructor(private readonly repo: ServiceRepository) {} async execute(input: Parameters<typeof Service.create>[1]) { const item = Service.create(crypto.randomUUID(), input); await this.repo.create(item); return item; } }
export class GetServiceUseCase { constructor(private readonly repo: ServiceRepository) {} execute(tenantId: string, id: string) { return this.repo.findById(tenantId, id); } }
export class ListServicesUseCase { constructor(private readonly repo: ServiceRepository) {} execute(tenantId: string, limit?: number, cursor?: string) { return this.repo.list(tenantId, page(limit), cursor); } }
export class UpdateServiceUseCase { constructor(private readonly repo: ServiceRepository) {} async execute(tenantId: string, id: string, input: Parameters<typeof Service.create>[1]) { const item = await this.repo.findById(tenantId, id); if (!item) return null; item.update(input); await this.repo.update(item); return item; } }
export class DeactivateServiceUseCase { constructor(private readonly repo: ServiceRepository) {} async execute(tenantId: string, id: string) { const item = await this.repo.findById(tenantId, id); if (!item) return null; item.changeStatus(ServiceStatus.INACTIVE); await this.repo.update(item); return item; } }
