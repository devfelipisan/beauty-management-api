import { Service, ServiceStatus } from './service.js';

const input = {
  tenantId: 'tenant',
  name: ' Service ',
  category: ' Category ',
  durationMinutes: 60,
  basePriceCents: 1000,
};
describe('Service existing invariants and mutations', () => {
  it('normalizes names, applies current defaults and does not expose mutable top-level data', () => {
    const service = Service.create('service', input, 'created');
    expect(service.data).toMatchObject({
      name: 'Service',
      category: 'Category',
      status: 'ACTIVE',
      depositMode: 'NOT_REQUIRED',
      requiresAssessment: false,
      allowsDiscount: false,
      requiresEquipment: false,
      requiresPhotography: false,
      hasTechnicalForm: false,
      createdAt: 'created',
      updatedAt: 'created',
    });
    const copy = service.data;
    (copy as { name: string }).name = 'tampered';
    expect(service.data.name).toBe('Service');
  });
  it.each([
    { tenantId: '' },
    { name: ' ' },
    { category: '' },
    { durationMinutes: 0 },
    { durationMinutes: 1.5 },
    { basePriceCents: -1 },
    { basePriceCents: 0.5 },
    { minimumPriceCents: -1 },
    { minimumPriceCents: 0.5 },
  ])('rejects invalid service fields %j', (patch) => {
    expect(() => Service.create('service', { ...input, ...patch })).toThrow(
      'Service fields are invalid',
    );
  });
  it('updates fields preserving identity/creation time and changes status with the supplied timestamp', () => {
    const service = Service.create('service', {
      ...input,
      requiresAssessment: true,
      allowsDiscount: true,
      requiresEquipment: true,
      requiresPhotography: true,
      hasTechnicalForm: true,
      depositMode: 'FIXED',
      minimumPriceCents: 0,
      createdAt: 'created',
      updatedAt: 'updated',
      status: ServiceStatus.INACTIVE,
    });
    service.update({ name: ' Updated ', durationMinutes: 30 }, 'changed');
    expect(service.id).toBe('service');
    expect(service.data).toMatchObject({
      name: 'Updated',
      durationMinutes: 30,
      tenantId: 'tenant',
      createdAt: 'created',
      updatedAt: 'changed',
      requiresPhotography: true,
      status: 'INACTIVE',
    });
    service.changeStatus(ServiceStatus.ACTIVE, 'activated');
    expect(service.data).toMatchObject({
      status: 'ACTIVE',
      updatedAt: 'activated',
    });
    expect(() => service.update({ durationMinutes: 0 })).toThrow();
    expect(service.data.durationMinutes).toBe(30);
  });
});
