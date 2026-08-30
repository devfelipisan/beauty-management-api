import type { Service } from '../domain/service.js';
export interface ServiceRepository { findById(tenantId: string, id: string): Promise<Service | null>; list(tenantId: string, limit: number, cursor?: string): Promise<Service[]>; create(service: Service): Promise<void>; update(service: Service): Promise<void>; }
export const SERVICE_REPOSITORY = Symbol('SERVICE_REPOSITORY');
