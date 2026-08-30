import type { License } from '../domain/license.js';
export interface LicenseRepository { findCurrentByTenant(tenantId:string):Promise<License|null>; }
export const LICENSE_REPOSITORY=Symbol('LICENSE_REPOSITORY');
