import { DomainError, Entity } from '../../../../../libs/kernel/src/index.js';
export enum ProfessionalStatus { ACTIVE = 'ACTIVE', INACTIVE = 'INACTIVE' }
export interface ProfessionalProps { tenantId: string; name: string; status: ProfessionalStatus; publicVisible: boolean; createdAt: string; updatedAt: string }
export class Professional extends Entity<string> {
  private constructor(id: string, private props: ProfessionalProps) { super(id); }
  static create(id: string, props: Omit<ProfessionalProps, 'status'|'createdAt'|'updatedAt'> & Partial<Pick<ProfessionalProps, 'status'|'createdAt'|'updatedAt'>>, now = new Date().toISOString()): Professional { if (!props.tenantId || !props.name.trim()) throw new DomainError('PROFESSIONAL_INVALID', 'Tenant and name are required'); return new Professional(id, { ...props, name: props.name.trim(), status: props.status ?? ProfessionalStatus.ACTIVE, createdAt: props.createdAt ?? now, updatedAt: props.updatedAt ?? now }); }
  get data(): Readonly<ProfessionalProps> { return { ...this.props }; }
  changeStatus(status: ProfessionalStatus, now = new Date().toISOString()): void { this.props = { ...this.props, status, updatedAt: now }; }
  update(input: Partial<Pick<ProfessionalProps, 'name'|'publicVisible'>>, now = new Date().toISOString()): void { this.props = { ...this.props, ...input, name: input.name?.trim() ?? this.props.name, updatedAt: now }; if (!this.props.name) throw new DomainError('PROFESSIONAL_INVALID', 'Name is required'); }
}
