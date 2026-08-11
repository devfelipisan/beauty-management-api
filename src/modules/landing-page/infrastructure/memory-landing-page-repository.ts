import type { LandingPageRepository } from "../domain/landing-page-repository";
import type { LandingPage } from "../domain/landing-page";

export class MemoryLandingPageRepository implements LandingPageRepository {
  private readonly items = new Map<string, LandingPage>();

  constructor(initialItems: LandingPage[] = []) {
    for (const page of initialItems) this.items.set(page.tenantId, structuredClone(page));
  }

  async findByTenantId(tenantId: string) {
    return this.items.get(tenantId) ?? null;
  }

  async save(page: LandingPage) {
    this.items.set(page.tenantId, structuredClone(page));
    return page;
  }
}
