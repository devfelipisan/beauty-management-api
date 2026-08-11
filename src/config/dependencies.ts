import postgres from "postgres";
import { AdministrationApi } from "@/api/administration-api";
import { BusinessApi } from "@/api/business-api";
import { PostgresCommercialPolicyRepository, PostgresTenantUserRepository } from "@/infrastructure/postgres/postgres-administration-repositories";
import { PostgresAssessmentRepository, PostgresFollowUpRepository, PostgresTechnicalRecordRepository } from "@/infrastructure/postgres/postgres-extracted-context-repositories";
import { PostgresJsSqlClientFactory, type PostgresJsFactory } from "@/infrastructure/postgres/postgres-js-sql-client";
import { createPostgresRuntime } from "@/infrastructure/postgres/postgres-runtime";
import { PostgresLandingPageRepository, PostgresTenantSettingsRepository } from "@/infrastructure/postgres/postgres-tenant-experience-repositories";
import type { SqlClient } from "@/infrastructure/postgres/sql-client";
import { CreateAssessmentUseCase } from "@/modules/assessments/application/create-assessment";
import { CreateAppointmentUseCase } from "@/modules/appointments/application/create-appointment";
import { CreatePublicAppointmentUseCase } from "@/modules/appointments/application/create-public-appointment";
import { CreateDiscountPolicyUseCase } from "@/modules/commercial-policy/application/create-discount-policy";
import { CreateCustomerUseCase } from "@/modules/customers/application/create-customer";
import { ConfirmDepositUseCase } from "@/modules/deposits/application/confirm-deposit";
import { CreateEquipmentUseCase } from "@/modules/equipment/application/create-equipment";
import { PostgresEquipmentRepository } from "@/modules/equipment/infrastructure/postgres-equipment-repository";
import { CreateFollowUpUseCase } from "@/modules/follow-ups/application/create-follow-up";
import { UpdateFollowUpStatusUseCase } from "@/modules/follow-ups/application/update-follow-up-status";
import { HideLandingPageUseCase, PublishLandingPageUseCase, SaveLandingPageDraftUseCase } from "@/modules/landing-page/application/manage-landing-page";
import { CreatePublicLeadUseCase } from "@/modules/leads/application/create-public-lead";
import { UpdateLeadStatusUseCase } from "@/modules/leads/application/update-lead-status";
import { CreatePackageUseCase } from "@/modules/packages/application/create-package";
import { PostgresPackageRepository } from "@/modules/packages/infrastructure/postgres-package-repository";
import { RegisterPaymentUseCase } from "@/modules/payments/application/register-payment";
import { CreateProfessionalUseCase } from "@/modules/professionals/application/create-professional";
import { CreateServiceUseCase } from "@/modules/services/application/create-service";
import { CompleteSessionUseCase } from "@/modules/sessions/application/complete-session";
import { StartSessionUseCase } from "@/modules/sessions/application/start-session";
import { CreateTechnicalRecordUseCase } from "@/modules/technical-records/application/create-technical-record";
import { UpdateTenantBrandingUseCase } from "@/modules/tenant-branding/application/update-tenant-branding";
import { UpdateTenantSettingsUseCase } from "@/modules/tenant-settings/application/update-tenant-settings";
import { CreateTenantUseCase } from "@/modules/tenants/application/create-tenant";
import { ResolveOperationalTenantContextUseCase } from "@/modules/tenants/application/resolve-operational-tenant-context";
import { ResolvePublicTenantContextUseCase } from "@/modules/tenants/application/resolve-public-tenant-context";
import { PostgresOperationalTenantContextRepository } from "@/modules/tenants/infrastructure/postgres-operational-tenant-context.repository";
import { PostgresPublicTenantContextRepository } from "@/modules/tenants/infrastructure/postgres-public-tenant-context.repository";
import { CreateTenantUserUseCase, UpdateTenantUserUseCase } from "@/modules/users/application/manage-users";
import { SupabaseAuthVerifier, type AuthVerifier } from "@/server/auth/authentication";
import { AuthorizationService } from "@/server/auth/authorization";
import { readDatabaseRuntimeConfig, readSupabaseAuthConfig } from "./supabase-config";

let businessSingleton: BusinessApi | null = null;
let administrationSingleton: AdministrationApi | null = null;
let authVerifierSingleton: AuthVerifier | null = null;
let sqlClientSingleton: SqlClient | null = null;
let postgresRuntimeSingleton: ReturnType<typeof createPostgresRuntime> | null = null;
let authorizationSingleton: AuthorizationService | null = null;
let publicTenantResolverSingleton: ResolvePublicTenantContextUseCase | null = null;
let operationalTenantResolverSingleton: ResolveOperationalTenantContextUseCase | null = null;

export function getSqlClient(): SqlClient {
  if (sqlClientSingleton) return sqlClientSingleton;
  const config = readDatabaseRuntimeConfig();
  const factory = new PostgresJsSqlClientFactory(postgres as unknown as PostgresJsFactory, {
    max: 1,
    prepare: false,
    fetch_types: false,
    idle_timeout: 10,
    connect_timeout: 5,
  });
  sqlClientSingleton = factory.create(config.runtimeConnectionString);
  return sqlClientSingleton;
}

function getPostgresRuntime() {
  if (postgresRuntimeSingleton) return postgresRuntimeSingleton;
  postgresRuntimeSingleton = createPostgresRuntime(getSqlClient());
  return postgresRuntimeSingleton;
}

export function getAuthorizationService(): AuthorizationService {
  if (authorizationSingleton) return authorizationSingleton;
  authorizationSingleton = new AuthorizationService(getPostgresRuntime().accessControl);
  return authorizationSingleton;
}

export function getOperationalTenantResolver(): ResolveOperationalTenantContextUseCase {
  if (operationalTenantResolverSingleton) return operationalTenantResolverSingleton;
  operationalTenantResolverSingleton = new ResolveOperationalTenantContextUseCase(
    new PostgresOperationalTenantContextRepository(getSqlClient()),
  );
  return operationalTenantResolverSingleton;
}

export function getPublicTenantResolver(): ResolvePublicTenantContextUseCase {
  if (publicTenantResolverSingleton) return publicTenantResolverSingleton;
  publicTenantResolverSingleton = new ResolvePublicTenantContextUseCase(new PostgresPublicTenantContextRepository(getSqlClient()));
  return publicTenantResolverSingleton;
}

export function getAuthVerifier(): AuthVerifier {
  if (authVerifierSingleton) return authVerifierSingleton;
  const config = readSupabaseAuthConfig();
  authVerifierSingleton = new SupabaseAuthVerifier(config.supabaseUrl, config.apiKey);
  return authVerifierSingleton;
}

export function getAdministrationApi(): AdministrationApi {
  if (administrationSingleton) return administrationSingleton;
  const sql = getSqlClient();
  const users = new PostgresTenantUserRepository(sql);
  const commercialPolicies = new PostgresCommercialPolicyRepository(sql);
  administrationSingleton = new AdministrationApi({
    users,
    commercialPolicies,
    createUser: new CreateTenantUserUseCase(users),
    updateUser: new UpdateTenantUserUseCase(users),
    createDiscountPolicy: new CreateDiscountPolicyUseCase(commercialPolicies),
  });
  return administrationSingleton;
}

export function getBusinessApi(): BusinessApi {
  if (businessSingleton) return businessSingleton;
  const sql = getSqlClient();
  const runtime = getPostgresRuntime();
  const equipmentRepository = new PostgresEquipmentRepository(sql);
  const packageRepository = new PostgresPackageRepository(sql);
  const assessmentRepository = new PostgresAssessmentRepository(sql);
  const technicalRecordRepository = new PostgresTechnicalRecordRepository(sql);
  const followUpRepository = new PostgresFollowUpRepository(sql);
  const tenantSettingsRepository = new PostgresTenantSettingsRepository(sql);
  const landingPageRepository = new PostgresLandingPageRepository(sql);

  businessSingleton = new BusinessApi({
    authorization: getAuthorizationService(),
    publicTenantResolver: getPublicTenantResolver(),
    unitOfWork: runtime.unitOfWork,
    leadRepository: runtime.leadRepository,
    equipmentRepository,
    packageRepository,
    assessmentRepository,
    technicalRecordRepository,
    followUpRepository,
    tenantSettingsRepository,
    landingPageRepository,
    useCases: {
      createTenant: new CreateTenantUseCase(runtime.unitOfWork),
      createProfessional: new CreateProfessionalUseCase(runtime.unitOfWork),
      createService: new CreateServiceUseCase(runtime.unitOfWork),
      createEquipment: new CreateEquipmentUseCase(runtime.unitOfWork, equipmentRepository),
      createPackage: new CreatePackageUseCase(runtime.unitOfWork, packageRepository),
      createCustomer: new CreateCustomerUseCase(runtime.unitOfWork),
      createAssessment: new CreateAssessmentUseCase(runtime.unitOfWork, assessmentRepository),
      createAppointment: new CreateAppointmentUseCase(runtime.unitOfWork),
      createPublicAppointment: new CreatePublicAppointmentUseCase(runtime.unitOfWork),
      createPublicLead: new CreatePublicLeadUseCase(runtime.leadRepository),
      updateLeadStatus: new UpdateLeadStatusUseCase(runtime.leadRepository),
      confirmDeposit: new ConfirmDepositUseCase(runtime.unitOfWork),
      startSession: new StartSessionUseCase(runtime.unitOfWork),
      completeSession: new CompleteSessionUseCase(runtime.unitOfWork),
      createTechnicalRecord: new CreateTechnicalRecordUseCase(runtime.unitOfWork, technicalRecordRepository, equipmentRepository),
      createFollowUp: new CreateFollowUpUseCase(runtime.unitOfWork, followUpRepository),
      updateFollowUpStatus: new UpdateFollowUpStatusUseCase(runtime.unitOfWork, followUpRepository),
      registerPayment: new RegisterPaymentUseCase(runtime.unitOfWork),
      updateTenantBranding: new UpdateTenantBrandingUseCase(runtime.unitOfWork),
      updateTenantSettings: new UpdateTenantSettingsUseCase(tenantSettingsRepository),
      saveLandingPageDraft: new SaveLandingPageDraftUseCase(runtime.unitOfWork, landingPageRepository),
      publishLandingPage: new PublishLandingPageUseCase(landingPageRepository),
      hideLandingPage: new HideLandingPageUseCase(landingPageRepository),
    },
  });
  return businessSingleton;
}
