import { AdministrationApi } from "@/api/administration-api";
import { BusinessApi } from "@/api/business-api";
import { MemoryAssessmentRepository, MemoryFollowUpRepository, MemoryTechnicalRecordRepository } from "@/infrastructure/memory/memory-extracted-context-repositories";
import { createMemoryRuntime } from "@/infrastructure/memory/memory-runtime";
import { CreateAssessmentUseCase } from "@/modules/assessments/application/create-assessment";
import { CreateAppointmentUseCase } from "@/modules/appointments/application/create-appointment";
import { CreatePublicAppointmentUseCase } from "@/modules/appointments/application/create-public-appointment";
import { CreateDiscountPolicyUseCase } from "@/modules/commercial-policy/application/create-discount-policy";
import { MemoryCommercialPolicyRepository } from "@/modules/commercial-policy/infrastructure/memory-commercial-policy-repository";
import { CreateCustomerUseCase } from "@/modules/customers/application/create-customer";
import { ConfirmDepositUseCase } from "@/modules/deposits/application/confirm-deposit";
import { CreateEquipmentUseCase } from "@/modules/equipment/application/create-equipment";
import { MemoryEquipmentRepository } from "@/modules/equipment/infrastructure/memory-equipment-repository";
import { CreateFollowUpUseCase } from "@/modules/follow-ups/application/create-follow-up";
import { UpdateFollowUpStatusUseCase } from "@/modules/follow-ups/application/update-follow-up-status";
import { HideLandingPageUseCase, PublishLandingPageUseCase, SaveLandingPageDraftUseCase } from "@/modules/landing-page/application/manage-landing-page";
import { MemoryLandingPageRepository } from "@/modules/landing-page/infrastructure/memory-landing-page-repository";
import { CreatePublicLeadUseCase } from "@/modules/leads/application/create-public-lead";
import { UpdateLeadStatusUseCase } from "@/modules/leads/application/update-lead-status";
import { CreatePackageUseCase } from "@/modules/packages/application/create-package";
import { MemoryPackageRepository } from "@/modules/packages/infrastructure/memory-package-repository";
import { RegisterPaymentUseCase } from "@/modules/payments/application/register-payment";
import { CreateProfessionalUseCase } from "@/modules/professionals/application/create-professional";
import { CreateServiceUseCase } from "@/modules/services/application/create-service";
import { CompleteSessionUseCase } from "@/modules/sessions/application/complete-session";
import { StartSessionUseCase } from "@/modules/sessions/application/start-session";
import { CreateTechnicalRecordUseCase } from "@/modules/technical-records/application/create-technical-record";
import { UpdateTenantBrandingUseCase } from "@/modules/tenant-branding/application/update-tenant-branding";
import { UpdateTenantSettingsUseCase } from "@/modules/tenant-settings/application/update-tenant-settings";
import { MemoryTenantSettingsRepository } from "@/modules/tenant-settings/infrastructure/memory-tenant-settings-repository";
import { CreateTenantUseCase } from "@/modules/tenants/application/create-tenant";
import { CreateTenantUserUseCase, UpdateTenantUserUseCase } from "@/modules/users/application/manage-users";
import { MemoryTenantUserRepository } from "@/modules/users/infrastructure/memory-user-repository";
import { createAuthVerifier, resolveApiAuthMode, type AuthVerifier } from "@/server/auth/authentication";
import { AuthorizationService } from "@/server/auth/authorization";

let singleton: BusinessApi | null = null;
let administrationSingleton: AdministrationApi | null = null;
let authVerifierSingleton: AuthVerifier | null = null;

export function getAuthVerifier(): AuthVerifier {
  if (authVerifierSingleton) return authVerifierSingleton;

  const mode = resolveApiAuthMode(process.env.API_AUTH_MODE);
  authVerifierSingleton = createAuthVerifier({
    mode,
    supabaseUrl: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    disabledSubject: process.env.API_DEV_AUTH_SUBJECT ?? "user-tenant-admin",
  });
  return authVerifierSingleton;
}

export function getAdministrationApi(): AdministrationApi {
  if (administrationSingleton) return administrationSingleton;
  const users = new MemoryTenantUserRepository();
  const commercialPolicies = new MemoryCommercialPolicyRepository();
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
  if (singleton) return singleton;
  const runtime = createMemoryRuntime();
  const equipmentRepository = new MemoryEquipmentRepository();
  const packageRepository = new MemoryPackageRepository();
  const assessmentRepository = new MemoryAssessmentRepository();
  const technicalRecordRepository = new MemoryTechnicalRecordRepository();
  const followUpRepository = new MemoryFollowUpRepository();
  const tenantSettingsRepository = new MemoryTenantSettingsRepository();
  const landingPageRepository = new MemoryLandingPageRepository();
  const authorization = new AuthorizationService(runtime.accessControl);
  singleton = new BusinessApi({
    authorization,
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
  return singleton;
}
