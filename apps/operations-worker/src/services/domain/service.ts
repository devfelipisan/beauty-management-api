import { DomainError, Entity } from '../../../../../libs/kernel/src/index.js';
export enum ServiceStatus { ACTIVE = 'ACTIVE', INACTIVE = 'INACTIVE' }
export interface ServiceProps { tenantId: string; name: string; category: string; durationMinutes: number; basePriceCents: number; status: ServiceStatus; requiresAssessment: boolean; createdAt: string; updatedAt: string }
export class Service extends Entity<string> {
  private constructor(id: string, private props: ServiceProps) { super(id); }
  static create(id: string, props: Omit<ServiceProps, 'status'|'requiresAssessment'|'createdAt'|'updatedAt'> & Partial<Pick<ServiceProps, 'status'|'requiresAssessment'|'createdAt'|'updatedAt'>>, now = new Date().toISOString()): Service { if (!props.tenantId || !props.name.trim() || !props.category.trim() || props.durationMinutes <= 0 || !Number.isInteger(props.durationMinutes) || props.basePriceCents < 0 || !Number.isInteger(props.basePriceCents)) throw new DomainError('SERVICE_INVALID', 'Service fields are invalid'); return new Service(id, { ...props, name: props.name.trim(), category: props.category.trim(), status: props.status ?? ServiceStatus.ACTIVE, requiresAssessment: props.requiresAssessment ?? false, createdAt: props.createdAt ?? now, updatedAt: props.updatedAt ?? now }); }
  get data(): Readonly<ServiceProps> { return { ...this.props }; }
  changeStatus(status: ServiceStatus, now = new Date().toISOString()): void { this.props = { ...this.props, status, updatedAt: now }; }
  update(input: Partial<Pick<ServiceProps, 'name'|'category'|'durationMinutes'|'basePriceCents'|'requiresAssessment'>>, now = new Date().toISOString()): void { const next = Service.create(this.id, { ...this.props, ...input, createdAt: this.props.createdAt, updatedAt: now }); this.props = next.data; }
}
