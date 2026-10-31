import {
  Customer,
  CustomerStatus,
  RelationshipProfile,
} from './customers/domain/customer.js';
import {
  Professional,
  ProfessionalStatus,
} from './professionals/domain/professional.js';
import { Tenant, TenantStatus } from './tenants/domain/tenant.js';

describe('customer aggregate mutations', () => {
  it('preserves identity, status, relationship and block while updating contact details', () => {
    const customer = Customer.create('customer', {
      tenantId: 'tenant',
      fullName: ' Original ',
      document: '12.345-6',
      status: CustomerStatus.INACTIVE,
      relationshipProfile: RelationshipProfile.LOYAL,
      blockedForNewAppointments: true,
      createdAt: 'created',
      updatedAt: 'updated',
    });
    expect(customer.data.document).toBe('123456');
    customer.update(
      { fullName: ' Updated ', phone: 'phone', document: '98.765' },
      'changed',
    );
    expect(customer.data).toMatchObject({
      tenantId: 'tenant',
      fullName: 'Updated',
      phone: 'phone',
      document: '98765',
      status: 'INACTIVE',
      relationshipProfile: 'LOYAL',
      blockedForNewAppointments: true,
      createdAt: 'created',
      updatedAt: 'changed',
    });
    customer.changeStatus(CustomerStatus.ACTIVE, 'activated');
    customer.setAppointmentBlock(false, 'unblocked');
    expect(customer.data).toMatchObject({
      status: 'ACTIVE',
      blockedForNewAppointments: false,
      updatedAt: 'unblocked',
    });
    expect(customer.id).toBe('customer');
    expect(() => customer.update({ fullName: ' ' })).toThrow(
      'Tenant and full name are required',
    );
    expect(customer.data.fullName).toBe('Updated');
    const copy = customer.data;
    (copy as { fullName: string }).fullName = 'tampered';
    expect(customer.data.fullName).toBe('Updated');
  });
  it('rejects absent tenant/name and normalizes an empty document to absence', () => {
    for (const input of [
      { tenantId: '', fullName: 'Client' },
      { tenantId: 'tenant', fullName: ' ' },
    ])
      expect(() => Customer.create('customer', input)).toThrow();
    expect(
      Customer.create('customer', {
        tenantId: 'tenant',
        fullName: 'Client',
        document: '---',
      }).data.document,
    ).toBeUndefined();
  });
});

describe('professional aggregate mutations', () => {
  it('updates presentation without changing tenant/creation/status and can change status independently', () => {
    const professional = Professional.create('professional', {
      tenantId: 'tenant',
      name: ' Name ',
      publicVisible: true,
      status: ProfessionalStatus.INACTIVE,
      createdAt: 'created',
      updatedAt: 'updated',
    });
    professional.update({ publicVisible: false }, 'hidden');
    expect(professional.data).toMatchObject({
      name: 'Name',
      publicVisible: false,
      status: 'INACTIVE',
      createdAt: 'created',
      updatedAt: 'hidden',
    });
    professional.update({ name: ' Updated ' }, 'renamed');
    professional.changeStatus(ProfessionalStatus.ACTIVE, 'activated');
    expect(professional.data).toMatchObject({
      tenantId: 'tenant',
      name: 'Updated',
      status: 'ACTIVE',
      updatedAt: 'activated',
    });
    const copy = professional.data;
    (copy as { name: string }).name = 'tampered';
    expect(professional.data.name).toBe('Updated');
  });
  it('rejects absent tenant/name on creation and blank names on update', () => {
    for (const input of [
      { tenantId: '', name: 'Name' },
      { tenantId: 'tenant', name: ' ' },
    ])
      expect(() =>
        Professional.create('p', { ...input, publicVisible: false }),
      ).toThrow();
    const professional = Professional.create('p', {
      tenantId: 'tenant',
      name: 'Name',
      publicVisible: false,
    });
    expect(() => professional.update({ name: ' ' })).toThrow(
      'Name is required',
    );
  });
});

describe('tenant aggregate mutations', () => {
  const input = {
    legalName: ' Legal ',
    displayName: ' Display ',
    document: '12.345',
    timezone: 'America/Sao_Paulo',
  };
  it('normalizes creation and updates allowed fields while preserving identity, status and creation time', () => {
    const tenant = Tenant.create('tenant', {
      ...input,
      status: TenantStatus.SUSPENDED,
      createdAt: 'created',
      updatedAt: 'updated',
    });
    expect(tenant.data).toMatchObject({
      legalName: 'Legal',
      displayName: 'Display',
      document: '12345',
      status: 'SUSPENDED',
    });
    tenant.update({ displayName: ' Updated ' }, 'changed');
    expect(tenant.data).toMatchObject({
      displayName: 'Updated',
      createdAt: 'created',
      updatedAt: 'changed',
      status: 'SUSPENDED',
    });
    tenant.changeStatus(TenantStatus.ACTIVE, 'activated');
    expect(tenant.data).toMatchObject({
      status: 'ACTIVE',
      updatedAt: 'activated',
    });
    const copy = tenant.data;
    (copy as { displayName: string }).displayName = 'tampered';
    expect(tenant.data.displayName).toBe('Updated');
    expect(() => tenant.update({ timezone: 'UTC' })).toThrow(
      'Tenant timezone must be an IANA timezone',
    );
    expect(tenant.data.timezone).toBe('America/Sao_Paulo');
  });
});
