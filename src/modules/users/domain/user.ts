import { ConflictError, DomainError, createEntityId, nowIso, type EntityId, type IsoDateTime } from "@/shared/domain/core";

export type UserProfile = "administrator" | "reception" | "professional";
export type UserStatus = "active" | "inactive";

export interface TenantUser {
  id: EntityId;
  tenantId: EntityId;
  fullName: string;
  email: string;
  phone?: string;
  profile: UserProfile;
  status: UserStatus;
  lastAccessAt?: IsoDateTime;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CreateTenantUserProps {
  tenantId: EntityId;
  fullName: string;
  email: string;
  phone?: string;
  profile: UserProfile;
  status?: UserStatus;
}

export interface UpdateTenantUserProps {
  fullName?: string;
  phone?: string;
  profile?: UserProfile;
  status?: UserStatus;
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new DomainError("USER_FIELD_REQUIRED", `${field} is required.`, { field });
  return normalized;
}

function optionalText(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeEmail(email: string): string {
  const normalized = requiredText(email, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new DomainError("USER_EMAIL_INVALID", "A valid user email is required.");
  }
  return normalized;
}

export function createTenantUser(props: CreateTenantUserProps): TenantUser {
  const timestamp = nowIso();
  return {
    id: createEntityId(),
    tenantId: requiredText(props.tenantId, "tenantId"),
    fullName: requiredText(props.fullName, "fullName"),
    email: normalizeEmail(props.email),
    phone: optionalText(props.phone),
    profile: props.profile,
    status: props.status ?? "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateTenantUser(current: TenantUser, patch: UpdateTenantUserProps): TenantUser {
  return {
    ...current,
    fullName: patch.fullName === undefined ? current.fullName : requiredText(patch.fullName, "fullName"),
    phone: patch.phone === undefined ? current.phone : optionalText(patch.phone),
    profile: patch.profile ?? current.profile,
    status: patch.status ?? current.status,
    updatedAt: nowIso(),
  };
}

export function duplicateUserEmail(email: string): ConflictError {
  return new ConflictError("USER_EMAIL_ALREADY_EXISTS", `A user with email ${email} already exists in this tenant.`, { email });
}
