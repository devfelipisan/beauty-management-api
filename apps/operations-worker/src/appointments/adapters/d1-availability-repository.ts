import { Inject, Injectable } from '@nestjs/common';
import { D1_DATABASE, type D1DatabaseLike } from '../../../../../libs/database/src/index.js';
import { TimeInterval } from '../domain/time-interval.js';
import type { AvailabilityRepository } from '../ports/availability-repository.js';
@Injectable() export class D1AvailabilityRepository implements AvailabilityRepository { constructor(@Inject(D1_DATABASE) private readonly db:D1DatabaseLike) {} async findExisting(tenantId:string,professionalId:string,interval:TimeInterval) { const rows=await this.db.prepare("SELECT starts_at, ends_at FROM appointments WHERE tenant_id = ? AND professional_id = ? AND starts_at < ? AND ends_at > ? AND status NOT IN ('CANCELED','RESCHEDULED','EXPIRED')").bind(tenantId,professionalId,interval.endsAt,interval.startsAt).all<{starts_at:string;ends_at:string}>(); return rows.results.map((r)=>TimeInterval.create(r.starts_at,r.ends_at)); } }
