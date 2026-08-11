import type { LandingPage, LandingPageStatus, LandingPageTemplate } from "@/modules/landing-page/domain/landing-page";
import type { LandingPageRepository } from "@/modules/landing-page/domain/landing-page-repository";
import type { TenantSettings, TenantAgendaView, TenantInterfaceDensity, TenantRadius, TenantThemeMode, TenantWeekStart } from "@/modules/tenant-settings/domain/tenant-settings";
import type { TenantSettingsRepository } from "@/modules/tenant-settings/domain/tenant-settings-repository";
import type { SqlExecutor } from "./sql-client";

const asIso = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value);
const optional = (value: unknown): string | undefined => value == null ? undefined : String(value);
const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];

type TenantSettingsRow = {
  tenant_id: string; display_name: string; legal_name: string | null; document: string | null; phone: string | null; email: string | null;
  address: string | null; city: string | null; state: string | null; postal_code: string | null; primary_unit_name: string | null;
  timezone: string; locale: string; currency: string; week_starts_on: TenantWeekStart; theme_mode: TenantThemeMode;
  interface_density: TenantInterfaceDensity; radius: TenantRadius; short_name: string | null; show_brand_name: boolean;
  show_breadcrumbs: boolean; show_dashboard_shortcuts: boolean; compact_navigation: boolean; default_agenda_view: TenantAgendaView;
  session_timeout_minutes: number; logout_on_inactivity: boolean; privacy_contact: string | null; plan_name: string | null;
  license_status: string | null; updated_at: unknown;
};

function mapTenantSettings(row: TenantSettingsRow): TenantSettings {
  return {
    tenantId: row.tenant_id, displayName: row.display_name, legalName: optional(row.legal_name), document: optional(row.document),
    phone: optional(row.phone), email: optional(row.email), address: optional(row.address), city: optional(row.city), state: optional(row.state),
    postalCode: optional(row.postal_code), primaryUnitName: optional(row.primary_unit_name), timezone: row.timezone, locale: row.locale,
    currency: row.currency, weekStartsOn: row.week_starts_on, themeMode: row.theme_mode, interfaceDensity: row.interface_density,
    radius: row.radius, shortName: optional(row.short_name), showBrandName: row.show_brand_name, showBreadcrumbs: row.show_breadcrumbs,
    showDashboardShortcuts: row.show_dashboard_shortcuts, compactNavigation: row.compact_navigation, defaultAgendaView: row.default_agenda_view,
    sessionTimeoutMinutes: Number(row.session_timeout_minutes), logoutOnInactivity: row.logout_on_inactivity,
    privacyContact: optional(row.privacy_contact), planName: optional(row.plan_name), licenseStatus: optional(row.license_status), updatedAt: asIso(row.updated_at),
  };
}

export class PostgresTenantSettingsRepository implements TenantSettingsRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async findByTenantId(tenantId: string) {
    const result = await this.sql.query<TenantSettingsRow>("select * from app.tenant_settings where tenant_id=$1", [tenantId]);
    return result.rows[0] ? mapTenantSettings(result.rows[0]) : null;
  }
  async save(s: TenantSettings) {
    await this.sql.query(`insert into app.tenant_settings (
      tenant_id,display_name,legal_name,document,phone,email,address,city,state,postal_code,primary_unit_name,timezone,locale,currency,
      week_starts_on,theme_mode,interface_density,radius,short_name,show_brand_name,show_breadcrumbs,show_dashboard_shortcuts,
      compact_navigation,default_agenda_view,session_timeout_minutes,logout_on_inactivity,privacy_contact,plan_name,license_status,updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
      on conflict (tenant_id) do update set display_name=excluded.display_name,legal_name=excluded.legal_name,document=excluded.document,
      phone=excluded.phone,email=excluded.email,address=excluded.address,city=excluded.city,state=excluded.state,postal_code=excluded.postal_code,
      primary_unit_name=excluded.primary_unit_name,timezone=excluded.timezone,locale=excluded.locale,currency=excluded.currency,
      week_starts_on=excluded.week_starts_on,theme_mode=excluded.theme_mode,interface_density=excluded.interface_density,radius=excluded.radius,
      short_name=excluded.short_name,show_brand_name=excluded.show_brand_name,show_breadcrumbs=excluded.show_breadcrumbs,
      show_dashboard_shortcuts=excluded.show_dashboard_shortcuts,compact_navigation=excluded.compact_navigation,
      default_agenda_view=excluded.default_agenda_view,session_timeout_minutes=excluded.session_timeout_minutes,
      logout_on_inactivity=excluded.logout_on_inactivity,privacy_contact=excluded.privacy_contact,updated_at=excluded.updated_at`,
      [s.tenantId,s.displayName,s.legalName??null,s.document??null,s.phone??null,s.email??null,s.address??null,s.city??null,s.state??null,
       s.postalCode??null,s.primaryUnitName??null,s.timezone,s.locale,s.currency,s.weekStartsOn,s.themeMode,s.interfaceDensity,s.radius,s.shortName??null,
       s.showBrandName,s.showBreadcrumbs,s.showDashboardShortcuts,s.compactNavigation,s.defaultAgendaView,s.sessionTimeoutMinutes,s.logoutOnInactivity,
       s.privacyContact??null,s.planName??null,s.licenseStatus??null,s.updatedAt??new Date().toISOString()]);
    return s;
  }
}

type LandingPageRow = {
  id: string; tenant_id: string; slug: string; status: LandingPageStatus; template: LandingPageTemplate; brand_name: string;
  hero_title: string; hero_subtitle: string | null; hero_description: string | null; cta_label: string; about: string | null;
  whatsapp: string | null; phone: string | null; email: string | null; address: string | null; business_hours: string | null;
  instagram: string | null; facebook: string | null; public_service_ids: unknown; public_professional_ids: unknown; gallery_file_ids: unknown;
  published_at: unknown | null; updated_at: unknown;
};

function mapLandingPage(row: LandingPageRow): LandingPage {
  return { id: row.id, tenantId: row.tenant_id, slug: row.slug, status: row.status, template: row.template, brandName: row.brand_name,
    heroTitle: row.hero_title, heroSubtitle: optional(row.hero_subtitle), heroDescription: optional(row.hero_description), ctaLabel: row.cta_label,
    about: optional(row.about), whatsapp: optional(row.whatsapp), phone: optional(row.phone), email: optional(row.email), address: optional(row.address),
    businessHours: optional(row.business_hours), instagram: optional(row.instagram), facebook: optional(row.facebook),
    publicServiceIds: stringArray(row.public_service_ids), publicProfessionalIds: stringArray(row.public_professional_ids), galleryFileIds: stringArray(row.gallery_file_ids),
    publishedAt: row.published_at == null ? undefined : asIso(row.published_at), updatedAt: asIso(row.updated_at) };
}

export class PostgresLandingPageRepository implements LandingPageRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async findByTenantId(tenantId: string) {
    const result = await this.sql.query<LandingPageRow>("select * from app.landing_pages where tenant_id=$1", [tenantId]);
    return result.rows[0] ? mapLandingPage(result.rows[0]) : null;
  }
  async save(p: LandingPage) {
    await this.sql.query(`insert into app.landing_pages (id,tenant_id,slug,status,template,brand_name,hero_title,hero_subtitle,hero_description,cta_label,about,
      whatsapp,phone,email,address,business_hours,instagram,facebook,public_service_ids,public_professional_ids,gallery_file_ids,published_at,updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      on conflict (tenant_id) do update set slug=excluded.slug,status=excluded.status,template=excluded.template,brand_name=excluded.brand_name,
      hero_title=excluded.hero_title,hero_subtitle=excluded.hero_subtitle,hero_description=excluded.hero_description,cta_label=excluded.cta_label,
      about=excluded.about,whatsapp=excluded.whatsapp,phone=excluded.phone,email=excluded.email,address=excluded.address,business_hours=excluded.business_hours,
      instagram=excluded.instagram,facebook=excluded.facebook,public_service_ids=excluded.public_service_ids,public_professional_ids=excluded.public_professional_ids,
      gallery_file_ids=excluded.gallery_file_ids,published_at=excluded.published_at,updated_at=excluded.updated_at`,
      [p.id,p.tenantId,p.slug,p.status,p.template,p.brandName,p.heroTitle,p.heroSubtitle??null,p.heroDescription??null,p.ctaLabel,p.about??null,
       p.whatsapp??null,p.phone??null,p.email??null,p.address??null,p.businessHours??null,p.instagram??null,p.facebook??null,p.publicServiceIds,
       p.publicProfessionalIds,p.galleryFileIds,p.publishedAt??null,p.updatedAt]);
    return p;
  }
}
