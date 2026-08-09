import { BusinessApi } from "@/api/business-api";
import { createMemoryRuntime } from "@/infrastructure/memory/memory-runtime";
import { CreateAppointmentUseCase } from "@/modules/appointments/application/create-appointment";
import { CreatePublicAppointmentUseCase } from "@/modules/appointments/application/create-public-appointment";
import { CreateCustomerUseCase } from "@/modules/customers/application/create-customer";
import { ConfirmDepositUseCase } from "@/modules/deposits/application/confirm-deposit";
import { CreatePublicLeadUseCase } from "@/modules/leads/application/create-public-lead";
import { UpdateLeadStatusUseCase } from "@/modules/leads/application/update-lead-status";
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
  const authorization = new AuthorizationService(runtime.accessControl);
  singleton = new BusinessApi({
    authorization,
    unitOfWork: runtime.unitOfWork,
    leadRepository: runtime.leadRepository,
    useCases: {
      createTenant: new CreateTenantUseCase(runtime.unitOfWork),
      createProfessional: new CreateProfessionalUseCase(runtime.unitOfWork),
      createService: new CreateServiceUseCase(runtime.unitOfWork),
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
