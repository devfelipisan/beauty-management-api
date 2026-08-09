export interface PublicTenantIdentity {
  displayName: string;
}

export function normalizePublicTenantSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Temporary deterministic public identity while persisted custom slug support
 * is completed in the backend repository. The function intentionally depends
 * only on the data it needs instead of the full Tenant aggregate.
 */
export function publicTenantSlug(tenant: PublicTenantIdentity): string {
  return normalizePublicTenantSlug(tenant.displayName);
}
