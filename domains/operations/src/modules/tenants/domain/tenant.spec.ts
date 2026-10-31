import { Tenant, TenantStatus } from './tenant.js';
describe('Tenant', () => {
  it('rejects absent legal name, display name and document', () => {
    const input = {
      legalName: 'Legal',
      displayName: 'Display',
      document: '123',
      timezone: 'America/Sao_Paulo',
    };
    for (const key of ['legalName', 'displayName', 'document'])
      expect(() => Tenant.create('tenant', { ...input, [key]: '' })).toThrow(
        'Tenant names and document are required',
      );
  });
  it('normalizes document and defaults to ACTIVE', () => {
    const tenant = Tenant.create('t1', {
      legalName: 'Legal',
      displayName: 'Display',
      document: '12.345/678-90',
      timezone: 'America/Sao_Paulo',
    });
    expect(tenant.data.document).toBe('1234567890');
    expect(tenant.data.status).toBe(TenantStatus.ACTIVE);
  });
});
