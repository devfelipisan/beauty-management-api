import { Inject, Injectable } from '@nestjs/common';
import { D1_DATABASE, type D1DatabaseLike } from '../../../../../libs/database/src/index.js';
import { Assessment } from '../domain/assessment.js';
import type { AssessmentRepository } from '../ports/assessment-repository.js';
type Row={id:string;tenant_id:string;customer_id:string;service_id:string;professional_id:string;result:'APTO'|'APTO_COM_RESTRICOES'|'NAO_APTO';performed_at:string;valid_until?:string};
@Injectable() export class D1AssessmentRepository implements AssessmentRepository { constructor(@Inject(D1_DATABASE) private readonly db:D1DatabaseLike){} async findLatest(tenantId:string,customerId:string,serviceId:string,professionalId:string){const r=await this.db.prepare('SELECT * FROM assessments WHERE tenant_id = ? AND customer_id = ? AND service_id = ? AND professional_id = ? ORDER BY performed_at DESC LIMIT 1').bind(tenantId,customerId,serviceId,professionalId).first<Row>(); return r?new Assessment({id:r.id,tenantId:r.tenant_id,customerId:r.customer_id,serviceId:r.service_id,professionalId:r.professional_id,result:r.result,performedAt:r.performed_at,validUntil:r.valid_until}):null;} }
