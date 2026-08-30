export interface ProfessionalServiceRepository { attach(tenantId: string, professionalId: string, serviceId: string, createdAt?: string): Promise<void>; }
export const PROFESSIONAL_SERVICE_REPOSITORY = Symbol('PROFESSIONAL_SERVICE_REPOSITORY');
