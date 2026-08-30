import { DomainError, Entity } from '../../../../../libs/kernel/src/index.js';
export enum CustomerStatus { ACTIVE = 'ACTIVE', INACTIVE = 'INACTIVE' }
export enum RelationshipProfile { NEW = 'NEW', OLD = 'OLD', REGULAR = 'REGULAR', LOYAL = 'LOYAL', INACTIVE = 'INACTIVE', RECURRING_ABSENCES = 'RECURRING_ABSENCES' }
export interface CustomerProps { tenantId: string; fullName: string; phone?: string; email?: string; document?: string; status: CustomerStatus; relationshipProfile: RelationshipProfile; blockedForNewAppointments: boolean; createdAt: string; updatedAt: string }
export class Customer extends Entity<string> {
  private constructor(id: string, private props: CustomerProps) { super(id); }
  static create(id: string, props: Omit<CustomerProps, 'status'|'relationshipProfile'|'blockedForNewAppointments'|'createdAt'|'updatedAt'> & Partial<Pick<CustomerProps, 'status'|'relationshipProfile'|'blockedForNewAppointments'|'createdAt'|'updatedAt'>>, now = new Date().toISOString()): Customer { if (!props.tenantId || !props.fullName.trim()) throw new DomainError('CUSTOMER_INVALID', 'Tenant and full name are required'); return new Customer(id, { ...props, fullName: props.fullName.trim(), document: props.document?.replace(/\D/g, '') || undefined, status: props.status ?? CustomerStatus.ACTIVE, relationshipProfile: props.relationshipProfile ?? RelationshipProfile.NEW, blockedForNewAppointments: props.blockedForNewAppointments ?? false, createdAt: props.createdAt ?? now, updatedAt: props.updatedAt ?? now }); }
  get data(): Readonly<CustomerProps> { return { ...this.props }; }
  changeStatus(status: CustomerStatus, now = new Date().toISOString()): void { this.props = { ...this.props, status, updatedAt: now }; }
  setAppointmentBlock(blocked: boolean, now = new Date().toISOString()): void { this.props = { ...this.props, blockedForNewAppointments: blocked, updatedAt: now }; }
  update(input: Partial<Pick<CustomerProps, 'fullName'|'phone'|'email'|'document'>>, now = new Date().toISOString()): void { const next = Customer.create(this.id, { ...this.props, ...input, createdAt: this.props.createdAt, updatedAt: now }); this.props = next.data; }
}
