import { Inject, Injectable } from '@nestjs/common';
import { D1_DATABASE, type D1DatabaseLike } from '../../../../../libs/database/src/index.js';
import type { ProfessionalServiceEligibilityPort } from '../ports/professional-service-eligibility.port.js';
@Injectable() export class D1ProfessionalServiceEligibility implements ProfessionalServiceEligibilityPort { constructor(@Inject(D1_DATABASE) private readonly db:D1DatabaseLike) {} async isEnabled(tenantId:string,professionalId:string,serviceId:string) { const row=await this.db.prepare('SELECT 1 AS enabled FROM professional_services WHERE tenant_id = ? AND professional_id = ? AND service_id = ?').bind(tenantId,professionalId,serviceId).first<{enabled:number}>(); return Boolean(row); } }
