import { Professional, ProfessionalStatus } from '../domain/professional.js';
import { type ProfessionalRepository } from '../ports/professional-repository.js';
const page = (limit = 20) => Math.min(Math.max(limit, 1), 100);
export class CreateProfessionalUseCase { constructor(private readonly repo: ProfessionalRepository) {} async execute(input: Parameters<typeof Professional.create>[1]) { const item = Professional.create(crypto.randomUUID(), input); await this.repo.create(item); return item; } }
export class GetProfessionalUseCase { constructor(private readonly repo: ProfessionalRepository) {} execute(tenantId: string, id: string) { return this.repo.findById(tenantId, id); } }
export class ListProfessionalsUseCase { constructor(private readonly repo: ProfessionalRepository) {} execute(tenantId: string, limit?: number, cursor?: string) { return this.repo.list(tenantId, page(limit), cursor); } }
export class UpdateProfessionalUseCase { constructor(private readonly repo: ProfessionalRepository) {} async execute(tenantId: string, id: string, input: Parameters<typeof Professional.create>[1]) { const item = await this.repo.findById(tenantId, id); if (!item) return null; item.update(input); await this.repo.update(item); return item; } }
export class DeactivateProfessionalUseCase { constructor(private readonly repo: ProfessionalRepository) {} async execute(tenantId: string, id: string) { const item = await this.repo.findById(tenantId, id); if (!item) return null; item.changeStatus(ProfessionalStatus.INACTIVE); await this.repo.update(item); return item; } }
