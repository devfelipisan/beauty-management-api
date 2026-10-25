import { Inject, Injectable } from '@nestjs/common';
import { D1_DATABASE } from '@beauty/database/tokens';
import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
import type { ProfessionalServiceRepository } from '../ports/professional-service-repository.js';
@Injectable()
export class D1ProfessionalServiceRepository implements ProfessionalServiceRepository {
  constructor(@Inject(D1_DATABASE) private readonly db: D1DatabaseLike) {}
  async attach(tenantId: string, professionalId: string, serviceId: string, createdAt = new Date().toISOString()): Promise<void> {
    const valid = await this.db.prepare('SELECT p.id AS professional_id, s.id AS service_id FROM professionals p JOIN services s ON s.tenant_id = p.tenant_id WHERE p.id = ? AND s.id = ? AND p.tenant_id = ?').bind(professionalId, serviceId, tenantId).first<{ professional_id: string; service_id: string }>();
    if (!valid) throw new Error('CROSS_TENANT_RELATION_FORBIDDEN');
    const result = await this.db.prepare('INSERT INTO professional_services (tenant_id, professional_id, service_id, created_at) SELECT ?, p.id, s.id, ? FROM professionals p JOIN services s ON s.id = ? AND s.tenant_id = ? WHERE p.id = ? AND p.tenant_id = ?').bind(tenantId, createdAt, serviceId, tenantId, professionalId, tenantId).run();
    if (!result.success) throw new Error('PROFESSIONAL_SERVICE_ATTACH_FAILED');
  }
}
