import { Reflector } from '@nestjs/core';
import { PermissionGuard } from '@beauty/authentication';
import { TenantsController } from './tenants.controller.js';

describe('TenantsController', () => {
  it('denies legacy platform routes until an administration policy is approved', () => {
    const guard = new PermissionGuard(new Reflector());
    for (const handler of [
      TenantsController.prototype.createTenant,
      TenantsController.prototype.getTenant,
      TenantsController.prototype.updateTenant,
    ]) {
      expect(() =>
        guard.canActivate({
          getHandler: () => handler,
          getClass: () => TenantsController,
        } as never),
      ).toThrow();
    }
  });
});
