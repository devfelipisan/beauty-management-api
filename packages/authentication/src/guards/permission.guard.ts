import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRED_PERMISSIONS } from '../decorators/require-permission.decorator.js';

type RequestWithMembership = Request & {
  tenantMembership?: { active: boolean; permissions: readonly string[] };
};

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }

    const request = context.switchToHttp().getRequest<RequestWithMembership>();
    const membership = request.tenantMembership;
    if (!membership?.active || !required.every((permission) => membership.permissions.includes(permission))) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    return true;
  }
}
