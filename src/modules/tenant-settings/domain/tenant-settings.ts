import type { IsoDateTime } from "@/shared/domain/core";

export type TenantThemeMode = "light" | "dark" | "system";
export type TenantInterfaceDensity = "comfortable" | "compact";
export type TenantRadius = "subtle" | "soft" | "rounded";
export type TenantAgendaView = "day" | "week" | "month";
export type TenantWeekStart = "monday" | "sunday";

export interface TenantSettings {
  tenantId: string;
  displayName: string;
  legalName?: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  primaryUnitName?: string;
  timezone: string;
  locale: string;
  currency: string;
  weekStartsOn: TenantWeekStart;
  themeMode: TenantThemeMode;
  interfaceDensity: TenantInterfaceDensity;
  radius: TenantRadius;
  shortName?: string;
  showBrandName: boolean;
  showBreadcrumbs: boolean;
  showDashboardShortcuts: boolean;
  compactNavigation: boolean;
  defaultAgendaView: TenantAgendaView;
  sessionTimeoutMinutes: number;
  logoutOnInactivity: boolean;
  privacyContact?: string;
  planName?: string;
  licenseStatus?: string;
  updatedAt?: IsoDateTime;
}

export type UpdateTenantSettingsInput = Omit<TenantSettings, "tenantId" | "planName" | "licenseStatus" | "updatedAt">;
