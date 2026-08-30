import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../permission.js';

export const REQUIRED_PERMISSIONS = 'authentication:required-permissions';
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
