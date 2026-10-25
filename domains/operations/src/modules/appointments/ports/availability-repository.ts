import type { TimeInterval } from '../domain/time-interval.js';
export interface AvailabilityRepository { findExisting(tenantId: string, professionalId: string, interval: TimeInterval): Promise<TimeInterval[]>; }
export const AVAILABILITY_REPOSITORY = Symbol('AVAILABILITY_REPOSITORY');
