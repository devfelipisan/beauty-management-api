/// <reference types="@cloudflare/workers-types" />
import { WorkerEntrypoint } from 'cloudflare:workers';
import { dispatchHealth, notFound } from '../../../libs/cloudflare-runtime/src/index.js';
import { CalculateCommercialTerms } from './commercial-terms/application/calculate-commercial-terms.js';
import { ConfiguredDiscountPolicy } from './discounts/adapters/configured-discount-policy.js';
import { D1DiscountPolicyRepository } from './discounts/adapters/d1-discount-policy-repository.js';
import { ConfiguredDepositPolicy } from './deposits/adapters/configured-deposit-policy.js';
import type { CalculateCommercialTermsRequest, CommercialTermsResponse, ConfirmDepositRequest, CreateDepositRequest, ExpireDepositRequest } from '../../../libs/contracts/src/index.js';
import { CreateDepositForAppointment, ConfirmDeposit, ExpireDeposit } from './deposits/application/deposit-lifecycle.js';
import { D1DepositRepository } from './deposits/adapters/d1-deposit-repository.js';
import { D1IdempotencyStore } from '../../../libs/reliability/src/d1/d1-reliability-store.js';
import { D1UnitOfWork } from '../../../libs/reliability/src/d1/d1-unit-of-work.js';
import type { AppointmentDepositTransitionPort } from './deposits/ports/appointment-deposit-transition.port.js';
import { D1OutboxDeliveryRepository } from '../../../libs/reliability/src/d1/d1-outbox-delivery-repository.js';
import { DispatchOutboxBatch } from '../../../libs/reliability/src/outbox/dispatch-outbox-batch.js';
import { OperationsDepositDelivery } from './outbox/operations-deposit-delivery.js';
import { OperationsPackageDelivery } from './outbox/operations-package-delivery.js';
import { ApplySessionPackageConsumption } from './packages/application/apply-session-package-consumption.js';
import { D1CustomerPackageRepository } from './packages/adapters/d1-customer-package-repository.js';
import { MaterializeCustomerPackage } from './packages/application/materialize-customer-package.js';
import { CheckPackageUsageEligibility } from './packages/application/check-package-usage-eligibility.js';
export interface BillingEnv { D1_DATABASE:D1Database; OPERATIONS_SERVICE?:unknown; }
export default class BillingWorker extends WorkerEntrypoint<BillingEnv> {
  async fetch(request:Request):Promise<Response>{return dispatchHealth(request,'beauty-billing-worker')??notFound();}
  async calculateCommercialTerms(input:CalculateCommercialTermsRequest):Promise<CommercialTermsResponse>{if(!input.tenantId||!input.customerId||!input.serviceId||!Number.isInteger(input.basePriceCents)||input.basePriceCents<0)return {status:'BLOCKED',reason:'INVALID_COMMERCIAL_TERMS'}; return new CalculateCommercialTerms(new ConfiguredDiscountPolicy(new D1DiscountPolicyRepository(this.env.D1_DATABASE)),new ConfiguredDepositPolicy()).execute(input);}
  async createDepositForAppointment(input:CreateDepositRequest){return new CreateDepositForAppointment(new D1DepositRepository(this.env.D1_DATABASE),new D1UnitOfWork(this.env.D1_DATABASE),new D1IdempotencyStore(this.env.D1_DATABASE)).execute(input);}
  async confirmDeposit(input:ConfirmDepositRequest){const transitions=this.env.OPERATIONS_SERVICE as AppointmentDepositTransitionPort|undefined;return new ConfirmDeposit(new D1DepositRepository(this.env.D1_DATABASE),new D1UnitOfWork(this.env.D1_DATABASE),new D1IdempotencyStore(this.env.D1_DATABASE),transitions).execute(input);}
  async expireDeposit(input:ExpireDepositRequest){const transitions=this.env.OPERATIONS_SERVICE as AppointmentDepositTransitionPort|undefined;return new ExpireDeposit(new D1DepositRepository(this.env.D1_DATABASE),new D1UnitOfWork(this.env.D1_DATABASE),new D1IdempotencyStore(this.env.D1_DATABASE),transitions).execute(input);}
  async dispatchOutboxBatch(input:{workerId:string;batchSize:number;leaseSeconds:number;now?:string}){return new DispatchOutboxBatch(new D1OutboxDeliveryRepository(this.env.D1_DATABASE,['DepositConfirmed','DepositExpired','PackageUnitConsumed']),{deliver:async e=>e.type==='PackageUnitConsumed'?new OperationsPackageDelivery(this.env.OPERATIONS_SERVICE as never).deliver(e):new OperationsDepositDelivery(this.env.OPERATIONS_SERVICE as never).deliver(e)}).execute(input);}
  async applyPackageConsumptionRequested(input:import('../../../libs/contracts/src/index.js').ApplyPackageConsumptionRequest){return new ApplySessionPackageConsumption(new D1CustomerPackageRepository(this.env.D1_DATABASE),new D1UnitOfWork(this.env.D1_DATABASE),new D1IdempotencyStore(this.env.D1_DATABASE)).execute(input);}
  async materializeCustomerPackage(input:import('../../../libs/contracts/src/index.js').MaterializeCustomerPackageRequest){return new MaterializeCustomerPackage(new D1CustomerPackageRepository(this.env.D1_DATABASE),new D1UnitOfWork(this.env.D1_DATABASE),new D1IdempotencyStore(this.env.D1_DATABASE)).execute(input);}
  async checkPackageUsageEligibility(input:import('../../../libs/contracts/src/index.js').CheckPackageUsageEligibilityRequest){return new CheckPackageUsageEligibility(new D1CustomerPackageRepository(this.env.D1_DATABASE)).execute(input);}
}
