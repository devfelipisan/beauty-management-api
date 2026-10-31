import { CustomersController } from './customers/customers.controller.js';
import { ProfessionalsController } from './professionals/professionals.controller.js';
import { ServicesController } from './services/services.controller.js';
import { TenantsController } from './tenants/tenants.controller.js';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from '@beauty/authentication';

describe.each([
  {
    Controller: CustomersController,
    noun: 'Customer',
    plural: 'Customers',
    permission: 'customer',
    updatePermission: ['customer.update'],
    deactivatePermission: [],
  },
  {
    Controller: ProfessionalsController,
    noun: 'Professional',
    plural: 'Professionals',
    permission: 'professional',
    updatePermission: [],
    deactivatePermission: [],
  },
  {
    Controller: ServicesController,
    noun: 'Service',
    plural: 'Services',
    permission: 'service',
    updatePermission: ['service.update'],
    deactivatePermission: ['service.deactivate'],
  },
])(
  '$noun controller adapter',
  ({
    Controller,
    noun,
    plural,
    permission,
    updatePermission,
    deactivatePermission,
  }) => {
    function fixture() {
      const create = { execute: vi.fn().mockResolvedValue({ id: 'created' }) };
      const get = { execute: vi.fn().mockResolvedValue({ id: 'resource' }) };
      const list = { execute: vi.fn().mockResolvedValue({ items: [] }) };
      const update = { execute: vi.fn() };
      const deactivate = { execute: vi.fn() };
      const controller = new Controller(
        create as never,
        get as never,
        list as never,
        update as never,
        deactivate as never,
      ) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      return { create, get, list, update, deactivate, controller };
    }
    const tenant = { tenantId: 'authenticated-tenant' };
    it('takes creation tenant from the resolved context and returns the application response', async () => {
      const f = fixture();
      const body = { name: 'Name', tenantId: 'forged-tenant' };
      expect(await f.controller[`create${noun}`](tenant, body)).toEqual({
        id: 'created',
      });
      expect(f.create.execute).toHaveBeenCalledExactlyOnceWith({
        ...body,
        tenantId: tenant.tenantId,
      });
    });
    it.each([
      [undefined, undefined],
      ['20', 20],
      ['invalid', undefined],
      ['0', undefined],
    ] as const)(
      'delegates pagination limit %s without inventing a default',
      async (limit, expected) => {
        const f = fixture();
        expect(
          await f.controller[`list${plural}`](tenant, limit, 'cursor'),
        ).toEqual({ items: [] });
        expect(f.list.execute).toHaveBeenCalledExactlyOnceWith(
          tenant.tenantId,
          expected,
          'cursor',
        );
      },
    );
    it('scopes reads and updates/deactivation to the context tenant and propagates failures', async () => {
      const f = fixture();
      expect(await f.controller[`get${noun}`](tenant, 'resource')).toEqual({
        id: 'resource',
      });
      expect(f.get.execute).toHaveBeenCalledWith(tenant.tenantId, 'resource');
      const body = { name: 'Updated' };
      await f.controller[`update${noun}`](tenant, 'resource', body);
      expect(f.update.execute).toHaveBeenCalledWith(
        tenant.tenantId,
        'resource',
        body,
      );
      await f.controller[`deactivate${noun}`](tenant, 'resource');
      expect(f.deactivate.execute).toHaveBeenCalledWith(
        tenant.tenantId,
        'resource',
      );
      const failure = new Error('RESOURCE_NOT_FOUND');
      f.get.execute.mockRejectedValue(failure);
      await expect(f.controller[`get${noun}`](tenant, 'missing')).rejects.toBe(
        failure,
      );
    });
    it('preserves approved per-operation permission metadata and denies mutations with a read-only membership', () => {
      const f = fixture();
      const reflector = new Reflector();
      const guard = new PermissionGuard(reflector);
      const requirements = {
        [`create${noun}`]: [`${permission}.create`],
        [`get${noun}`]: [`${permission}.read`],
        [`list${plural}`]: [`${permission}.read`],
        [`update${noun}`]: updatePermission,
        [`deactivate${noun}`]: deactivatePermission,
      };
      for (const [method, expected] of Object.entries(requirements)) {
        expect(
          reflector.getAllAndOverride('authentication:required-permissions', [
            f.controller[method],
            Controller,
          ]),
        ).toEqual(expected);
        if (method.startsWith('update') || method.startsWith('deactivate'))
          expect(() =>
            guard.canActivate({
              getHandler: () => f.controller[method],
              getClass: () => Controller,
              switchToHttp: () => ({
                getRequest: () => ({
                  tenantMembership: {
                    active: true,
                    permissions: [`${permission}.read`],
                  },
                }),
              }),
            } as never),
          ).toThrow();
      }
    });
  },
);

describe('legacy tenants controller delegation', () => {
  it('forwards explicit arguments to application cases without applying business policy', async () => {
    const create = { execute: vi.fn().mockResolvedValue({ id: 'tenant' }) };
    const get = { execute: vi.fn().mockResolvedValue({ id: 'tenant' }) };
    const update = { execute: vi.fn() };
    const controller = new TenantsController(
      create as never,
      get as never,
      update as never,
    );
    const body = { displayName: 'Workspace' };
    expect(await controller.createTenant(body as never)).toEqual({
      id: 'tenant',
    });
    expect(create.execute).toHaveBeenCalledWith(body);
    expect(await controller.getTenant('tenant')).toEqual({ id: 'tenant' });
    expect(get.execute).toHaveBeenCalledWith('tenant');
    await controller.updateTenant('tenant', body as never);
    expect(update.execute).toHaveBeenCalledWith('tenant', body);
  });
});
