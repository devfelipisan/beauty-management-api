import type { IsoDateTime } from "@/shared/domain/core";

export type LandingPageStatus = "not_configured" | "draft" | "ready" | "published" | "hidden";
export type LandingPageTemplate = "editorial_clean" | "institutional_light" | "minimal";

export interface LandingPage {
  id: string;
  tenantId: string;
  slug: string;
  status: LandingPageStatus;
  template: LandingPageTemplate;
  brandName: string;
  heroTitle: string;
  heroSubtitle?: string;
  heroDescription?: string;
  ctaLabel: string;
  about?: string;
  whatsapp?: string;
  phone?: string;
  email?: string;
  address?: string;
  businessHours?: string;
  instagram?: string;
  facebook?: string;
  publicServiceIds: string[];
  publicProfessionalIds: string[];
  galleryFileIds: string[];
  publishedAt?: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type SaveLandingPageDraftInput = Omit<LandingPage, "id" | "tenantId" | "status" | "publishedAt" | "updatedAt">;
