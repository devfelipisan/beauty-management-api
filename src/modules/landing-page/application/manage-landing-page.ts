import type { ExecutionContext } from "@/shared/application/execution-context";
import type { UnitOfWork } from "@/shared/application/ports";
import { createEntityId, nowIso, NotFoundError } from "@/shared/domain/core";
import { assertValidPublicTenantSlug, normalizePublicTenantSlug } from "@/modules/tenants/domain/public-tenant-slug";
import type { LandingPageRepository } from "../domain/landing-page-repository";
import type { LandingPage, SaveLandingPageDraftInput } from "../domain/landing-page";

export class SaveLandingPageDraftUseCase {
  constructor(private readonly unitOfWork: UnitOfWork, private readonly repository: LandingPageRepository) {}

  async execute(context: ExecutionContext, input: SaveLandingPageDraftInput): Promise<LandingPage> {
    if (!context.tenantId) throw new Error("Tenant is required to save landing page.");
    const tenantId = context.tenantId;
    const slug = normalizePublicTenantSlug(input.slug);
    assertValidPublicTenantSlug(slug);

    await this.unitOfWork.execute(context, async (tx) => {
      for (const serviceId of input.publicServiceIds) {
        if (!await tx.services.findById(tenantId, serviceId)) throw new NotFoundError("service", serviceId);
      }
      for (const professionalId of input.publicProfessionalIds) {
        if (!await tx.professionals.findById(tenantId, professionalId)) throw new NotFoundError("professional", professionalId);
      }
    });

    const current = await this.repository.findByTenantId(tenantId);
    return this.repository.save({
      id: current?.id ?? createEntityId(),
      tenantId,
      ...input,
      slug,
      status: "draft",
      publishedAt: current?.publishedAt,
      updatedAt: nowIso(),
    });
  }
}

export class PublishLandingPageUseCase {
  constructor(private readonly repository: LandingPageRepository) {}
  async execute(context: ExecutionContext): Promise<LandingPage> {
    if (!context.tenantId) throw new Error("Tenant is required to publish landing page.");
    const page = await this.repository.findByTenantId(context.tenantId);
    if (!page) throw new NotFoundError("landing_page", context.tenantId);
    if (!page.brandName.trim() || !page.heroTitle.trim() || !page.ctaLabel.trim()) throw new Error("Landing page is incomplete and cannot be published.");
    return this.repository.save({ ...page, status: "published", publishedAt: nowIso(), updatedAt: nowIso() });
  }
}

export class HideLandingPageUseCase {
  constructor(private readonly repository: LandingPageRepository) {}
  async execute(context: ExecutionContext): Promise<LandingPage> {
    if (!context.tenantId) throw new Error("Tenant is required to hide landing page.");
    const page = await this.repository.findByTenantId(context.tenantId);
    if (!page) throw new NotFoundError("landing_page", context.tenantId);
    return this.repository.save({ ...page, status: "hidden", updatedAt: nowIso() });
  }
}
