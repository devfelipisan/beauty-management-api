import type { EntityId, IsoDateTime } from "@/shared/domain/core";

export interface TenantBranding {
  tenantId: EntityId;
  primaryColor?: string;
  secondaryColor?: string;
  logoFileId?: EntityId;
  faviconFileId?: EntityId;
  heroFileId?: EntityId;
  updatedAt: IsoDateTime;
}
