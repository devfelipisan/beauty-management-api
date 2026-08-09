export interface PublicTenantIdentity { displayName: string; }

export function normalizePublicTenantSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function publicTenantSlug(tenant: PublicTenantIdentity): string {
  return normalizePublicTenantSlug(tenant.displayName);
}
