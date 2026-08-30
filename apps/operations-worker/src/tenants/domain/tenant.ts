import { DomainError, Entity } from '../../../../../libs/kernel/src/index.js';

export enum TenantStatus { ACTIVE = 'ACTIVE', INACTIVE = 'INACTIVE', SUSPENDED = 'SUSPENDED', CANCELED = 'CANCELED' }

export interface TenantProps { legalName: string; displayName: string; document: string; timezone: string; status: TenantStatus; createdAt: string; updatedAt: string }

export class Tenant extends Entity<string> {
  private constructor(id: string, private props: TenantProps) { super(id); }
  static create(id: string, props: Omit<TenantProps, 'status'|'createdAt'|'updatedAt'> & Partial<Pick<TenantProps, 'status'|'createdAt'|'updatedAt'>>, now = new Date().toISOString()): Tenant {
    const document = props.document.replace(/\D/g, '');
    if (!props.legalName.trim() || !props.displayName.trim() || !document) throw new DomainError('TENANT_INVALID', 'Tenant names and document are required');
    if (!/^[A-Za-z_]+\/[A-Za-z_]+$/.test(props.timezone)) throw new DomainError('TENANT_TIMEZONE_INVALID', 'Tenant timezone must be an IANA timezone');
    return new Tenant(id, { ...props, legalName: props.legalName.trim(), displayName: props.displayName.trim(), document, status: props.status ?? TenantStatus.ACTIVE, createdAt: props.createdAt ?? now, updatedAt: props.updatedAt ?? now });
  }
  get data(): Readonly<TenantProps> { return { ...this.props }; }
  update(input: Partial<Omit<TenantProps, 'status'|'createdAt'|'updatedAt'>>, now = new Date().toISOString()): void { const next = Tenant.create(this.id, { ...this.props, ...input, createdAt: this.props.createdAt, updatedAt: now }); this.props = next.data; }
  changeStatus(status: TenantStatus, now = new Date().toISOString()): void { this.props = { ...this.props, status, updatedAt: now }; }
}
