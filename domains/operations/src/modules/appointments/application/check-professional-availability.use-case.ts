import { AvailabilityPolicy } from '../domain/policies/availability-policy.js';
import { TimeInterval } from '../domain/time-interval.js';
import { type AvailabilityRepository } from '../ports/availability-repository.js';
export class CheckProfessionalAvailabilityUseCase { constructor(private readonly repo:AvailabilityRepository) {} async execute(tenantId:string,professionalId:string,startsAt:string,endsAt:string) { const interval=TimeInterval.create(startsAt,endsAt); const existing=await this.repo.findExisting(tenantId,professionalId,interval); return { available:new AvailabilityPolicy().isAvailable({interval,existing,blocked:[]}), startsAt:interval.startsAt, endsAt:interval.endsAt }; } }
