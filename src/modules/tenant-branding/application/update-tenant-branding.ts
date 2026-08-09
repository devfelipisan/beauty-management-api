import type { ExecutionContext } from "@/shared/application/execution-context";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { NotFoundError, nowIso } from "@/shared/domain/core";
import { assertAccessibleBrandColor } from "@/modules/tenant-branding/domain/color-contrast";
import type { TenantBranding } from "@/modules/tenant-branding/domain/tenant-branding";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface UpdateTenantBrandingInput {
  primaryColor?: string;
  secondaryColor?: string;
  logoFileId?: string;
  faviconFileId?: string;
  heroFileId?: string;
}

export class UpdateTenantBrandingUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(context: ExecutionContext, input: UpdateTenantBrandingInput): Promise<TenantBranding> {
    if (!context.tenantId) throw new Error("Tenant is required to update branding.");
    const tenantId = context.tenantId;
    if (input.primaryColor) {
      if (!HEX_COLOR.test(input.primaryColor)) throw new Error("Invalid primary color.");
      assertAccessibleBrandColor(input.primaryColor);
    }
    if (input.secondaryColor) {
      if (!HEX_COLOR.test(input.secondaryColor)) throw new Error("Invalid secondary color.");
      assertAccessibleBrandColor(input.secondaryColor);
    }

    return this.unitOfWork.execute(context, async (transaction) => {
      const tenant = await transaction.tenants.findById(tenantId);
      if (!tenant) throw new NotFoundError("tenant", tenantId);
      const previous = await transaction.tenantBranding.findByTenantId(tenantId);
      const branding: TenantBranding = {
        tenantId,
        primaryColor: input.primaryColor ?? previous?.primaryColor,
        secondaryColor: input.secondaryColor ?? previous?.secondaryColor,
        logoFileId: input.logoFileId ?? previous?.logoFileId,
        faviconFileId: input.faviconFileId ?? previous?.faviconFileId,
        heroFileId: input.heroFileId ?? previous?.heroFileId,
        updatedAt: nowIso(),
      };
      await transaction.tenantBranding.save(branding);
      await transaction.audit.append(createAuditEvent(context, {
        action: AuditActions.TenantBrandingUpdated,
        resource: { type: "tenant", id: tenantId },
        changes: {
          primaryColor: { from: previous?.primaryColor, to: branding.primaryColor },
          secondaryColor: { from: previous?.secondaryColor, to: branding.secondaryColor },
        },
      }));
      return branding;
    });
  }
}
