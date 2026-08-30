import type { Professional } from '../domain/professional.js';
export interface ProfessionalRepository { findById(tenantId: string, id: string): Promise<Professional | null>; list(tenantId: string, limit: number, cursor?: string): Promise<Professional[]>; create(professional: Professional): Promise<void>; update(professional: Professional): Promise<void>; }
export const PROFESSIONAL_REPOSITORY = Symbol('PROFESSIONAL_REPOSITORY');
