import { BusinessApi } from "@/api/business-api";
import { createMemoryRuntime } from "@/infrastructure/memory/memory-runtime";
import { CreateAppointmentUseCase } from "@/modules/appointments/application/create-appointment";
import { CreatePublicAppointmentUseCase } from "@/modules/appointments/application/create-public-appointment";
import { CreateCustomerUseCase } from "@/modules/customers/application/create-customer";
import { ConfirmDepositUseCase } from "@/modules/deposits/application/confirm-deposit";
import { CreateEquipmentUseCase } from "@/modules/equipment/application/create-equipment";
import { MemoryEquipmentRepository } from "@/modules/equipment/infrastructure/memory-equipment-repository";
import { CreatePublicLeadUseCase } from "@/modules/leads/application/create-public-lead";
import { UpdateLeadStatusUseCase } from "@/modules/leads/application/update-lead-status";
import { CreatePackageUseCase } from "@/modules/packages/application/create-package";
import { MemoryPackageRepository } from "@/modules/packages/infrastructure/memory-package-repository";
import { RegisterPaymentUseCase } from "@/modules/payments/application/register-payment";
import { CreateProfessionalUseCase } from "@/modules/professionals/application/create-professional";
import { CreateServiceUseCase } from "@/modules/services/application/create-service";
import { CompleteSessionUseCase } from "@/modules/sessions/application/complete-session";
import { StartSessionUseCase } from "@/modules/sessions/application/start-session";
import { UpdateTenantBrandingUseCase } from "@/modules/tenant-branding/application/update-tenant-branding";
import { CreateTenantUseCase } from "@/modules/tenants/application/create-tenant";
import { AuthorizationService } from "@/server/auth/authorization";

let singleton: BusinessApi | null = null;

export function getBusinessApi(): BusinessApi {
  if (singleton) return singleton;
  const runtime = createMemoryRuntime();
  const equipmentRepository = new MemoryEquipmentRepository();
  const packageRepository = new MemoryPackageRepository();
  const authorization = new AuthorizationService(runtime.accessControl);
  singleton = new BusinessApi({
    authorization,
    unitOfWork: runtime.unitOfWork,
    leadRepository: runtime.leadRepository,
    equipmentRepository,
    packageRepository,
    useCases: {
      createTenant: new CreateTenantUseCase(runtime.unitOfWork),
      createProfessional: new CreateProfessionalUseCase(runtime.unitOfWork),
      createService: new CreateServiceUseCase(runtime.unitOfWork),
      createEquipment: new CreateEquipmentUseCase(runtime.unitOfWork, equipmentRepository),
      createPackage: new CreatePackageUseCase(runtime.unitOfWork, packageRepository),
      createCustomer: new CreateCustomerUseCase(runtime.unitOfWork),
      createAppointment: new CreateAppointmentUseCase(runtime.unitOfWork),
      createPublicAppointment: new CreatePublicAppointmentUseCase(runtime.unitOfWork),
      createPublicLead: new CreatePublicLeadUseCase(runtime.leadRepository),
      updateLeadStatus: new UpdateLeadStatusUseCase(runtime.leadRepository),
      confirmDeposit: new ConfirmDepositUseCase(runtime.unitOfWork),
      startSession: new StartSessionUseCase(runtime.unitOfWork),
      completeSession: new CompleteSessionUseCase(runtime.unitOfWork),
      registerPayment: new RegisterPaymentUseCase(runtime.unitOfWork),
      updateTenantBranding: new UpdateTenantBrandingUseCase(runtime.unitOfWork),
    },
  });
  return singleton;
}
