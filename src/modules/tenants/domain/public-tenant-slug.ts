import { DomainError } from "@/shared/domain/core";
import type { Tenant } from "@/shared/domain/models";

const MIN_TENANT_SLUG_LENGTH = 3;
const MAX_TENANT_SLUG_LENGTH = 63;

export const RESERVED_TENANT_SLUGS = new Set([
  "api",
  "auth",
  "login",
  "logout",
  "setup",
  "platform",
  "admin",
  "dashboard",
  "landing-page",
  "health",
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
  "_next",
]);

export function normalizePublicTenantSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function assertValidPublicTenantSlug(value: string): string {
  const slug = normalizePublicTenantSlug(value);
  if (slug.length < MIN_TENANT_SLUG_LENGTH || slug.length > MAX_TENANT_SLUG_LENGTH) {
    throw new DomainError(
      "TENANT_SLUG_LENGTH_INVALID",
      `Tenant slug must contain between ${MIN_TENANT_SLUG_LENGTH} and ${MAX_TENANT_SLUG_LENGTH} characters.`,
      { slug },
    );
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new DomainError("TENANT_SLUG_INVALID", "Tenant slug contains unsupported characters.", { slug });
  }
  if (RESERVED_TENANT_SLUGS.has(slug)) {
    throw new DomainError("TENANT_SLUG_RESERVED", "Tenant slug is reserved by the platform.", { slug });
  }
  return slug;
}

/**
 * Returns the tenant's canonical routing identity. Existing tenants without a persisted
 * slug keep the display-name fallback only during the migration window.
 */
export function publicTenantSlug(tenant: Pick<Tenant, "displayName" | "publicSlug">): string {
  return tenant.publicSlug ?? normalizePublicTenantSlug(tenant.displayName);
}
