import { Inject, Injectable } from '@nestjs/common';
import { AvailabilityPolicy } from '../domain/policies/availability-policy.js';
import { TimeInterval } from '../domain/time-interval.js';
import { AVAILABILITY_REPOSITORY, type AvailabilityRepository } from '../ports/availability-repository.js';
@Injectable() export class CheckProfessionalAvailabilityUseCase { constructor(@Inject(AVAILABILITY_REPOSITORY) private readonly repo:AvailabilityRepository) {} async execute(tenantId:string,professionalId:string,startsAt:string,endsAt:string) { const interval=TimeInterval.create(startsAt,endsAt); const existing=await this.repo.findExisting(tenantId,professionalId,interval); return { available:new AvailabilityPolicy().isAvailable({interval,existing,blocked:[]}), startsAt:interval.startsAt, endsAt:interval.endsAt }; } }
