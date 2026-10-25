import type { Tenant } from '../domain/tenant.js';
export interface TenantRepository { findById(id: string): Promise<Tenant | null>; findByDocument(document: string): Promise<Tenant | null>; create(tenant: Tenant): Promise<void>; update(tenant: Tenant): Promise<void>; }
export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');
