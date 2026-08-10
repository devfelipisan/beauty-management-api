import type { LandingPage } from "./landing-page";

export interface LandingPageRepository {
  findByTenantId(tenantId: string): Promise<LandingPage | null>;
  save(page: LandingPage): Promise<LandingPage>;
}
