import { D1RefundsPersistence } from '@beauty/billing/modules/refunds/infrastructure/d1-persistence';
import { D1CreditsPersistence } from '@beauty/billing/modules/credits/infrastructure/d1-persistence';
import { D1AppointmentChangePoliciesPersistence } from '@beauty/billing/modules/appointment-change-policies/infrastructure/d1-persistence';

import { CalculateCommercialTerms } from '@beauty/billing/modules/commercial-terms/application/calculate-commercial-terms';
import { ConfiguredDiscountPolicy } from '@beauty/billing/modules/discounts/infrastructure/configured-discount-policy';
import { D1DiscountPolicyRepository } from '@beauty/billing/modules/discounts/infrastructure/d1-discount-policy-repository';
import { ConfiguredDepositPolicy } from '@beauty/billing/modules/deposits/infrastructure/configured-deposit-policy';
import type {
  CalculateCommercialTermsRequest,
  CommercialTermsResponse,
  ConfirmDepositRequest,
  CreateDepositRequest,
  ExpireDepositRequest,
} from '@beauty/contracts';
import {
  CreateDepositForAppointment,
  ConfirmDeposit,
  ExpireDeposit,
} from '@beauty/billing/modules/deposits/application/deposit-lifecycle';
import { D1DepositRepository } from '@beauty/billing/modules/deposits/infrastructure/d1-deposit-repository';
import { D1IdempotencyStore } from '@beauty/reliability/d1/d1-reliability-store';
import { D1UnitOfWork } from '@beauty/reliability/d1/d1-unit-of-work';
import type { AppointmentDepositTransitionPort } from '@beauty/billing/modules/deposits/ports/appointment-deposit-transition.port';
import { D1OutboxDeliveryRepository } from '@beauty/reliability/d1/d1-outbox-delivery-repository';
import { DispatchOutboxBatch } from '@beauty/reliability/outbox/dispatch-outbox-batch';
import { OperationsDepositDelivery } from '@beauty/billing/infrastructure/outbox/operations-deposit-delivery';
import { OperationsPackageDelivery } from '@beauty/billing/infrastructure/outbox/operations-package-delivery';
import { ApplySessionPackageConsumption } from '@beauty/billing/modules/packages/application/apply-session-package-consumption';
import { D1CustomerPackageRepository } from '@beauty/billing/modules/packages/infrastructure/d1-customer-package-repository';
import { MaterializeCustomerPackage } from '@beauty/billing/modules/packages/application/materialize-customer-package';
import { CheckPackageUsageEligibility } from '@beauty/billing/modules/packages/application/check-package-usage-eligibility';
import { D1ReceivableRepository } from '@beauty/billing/modules/receivables/infrastructure/d1-receivable-repository';
import { ApplyFinancialSettlementRequested } from '@beauty/billing/modules/receivables/application/apply-financial-settlement-requested';
import { RegisterPayment } from '@beauty/billing/modules/payments/application/register-payment';
import { OperationsPaymentDelivery } from '@beauty/billing/infrastructure/outbox/operations-payment-delivery';
import { OperationsRefundDelivery } from '@beauty/billing/infrastructure/outbox/operations-refund-delivery';
import { IssueRefund } from '@beauty/billing/modules/refunds/application/issue-refund';
import { GrantInternalCredit } from '@beauty/billing/modules/credits/application/grant-internal-credit';
import { EvaluateAppointmentChangeFinancials } from '@beauty/billing/modules/appointment-change-policies/application/evaluate-appointment-change-financials';
import { ValidateFinancialDecisionSnapshot } from '@beauty/billing/modules/appointment-change-policies/application/validate-financial-decision-snapshot';
import { BuildFinancialDecisionSnapshot } from '@beauty/billing/modules/appointment-change-policies/application/build-financial-decision-snapshot';
import { FinancialEffectExecutor } from '@beauty/billing/modules/appointment-change-policies/application/financial-effect-executor';
import type { BillingEnv } from './env.js';

export class BillingComposition {
  constructor(readonly env: BillingEnv) {}
  async calculateCommercialTerms(
    input: CalculateCommercialTermsRequest,
  ): Promise<CommercialTermsResponse> {
    if (
      !input.tenantId ||
      !input.customerId ||
      !input.serviceId ||
      !Number.isInteger(input.basePriceCents) ||
      input.basePriceCents < 0
    )
      return { status: 'BLOCKED', reason: 'INVALID_COMMERCIAL_TERMS' };
    return new CalculateCommercialTerms(
      new ConfiguredDiscountPolicy(
        new D1DiscountPolicyRepository(this.env.D1_DATABASE),
      ),
      new ConfiguredDepositPolicy(),
    ).execute(input);
  }
  async createDepositForAppointment(input: CreateDepositRequest) {
    return new CreateDepositForAppointment(
      new D1DepositRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async confirmDeposit(input: ConfirmDepositRequest) {
    const transitions = this.env.OPERATIONS_SERVICE as
      AppointmentDepositTransitionPort | undefined;
    return new ConfirmDeposit(
      new D1DepositRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
      transitions,
    ).execute(input);
  }
  async expireDeposit(input: ExpireDepositRequest) {
    const transitions = this.env.OPERATIONS_SERVICE as
      AppointmentDepositTransitionPort | undefined;
    return new ExpireDeposit(
      new D1DepositRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
      transitions,
    ).execute(input);
  }
  async dispatchOutboxBatch(input: {
    workerId: string;
    batchSize: number;
    leaseSeconds: number;
    now?: string;
  }) {
    return new DispatchOutboxBatch(
      new D1OutboxDeliveryRepository(this.env.D1_DATABASE, [
        'DepositConfirmed',
        'DepositExpired',
        'PackageUnitConsumed',
        'PaymentReceived',
        'RefundIssued',
      ]),
      {
        deliver: async (e) =>
          e.type === 'PackageUnitConsumed'
            ? new OperationsPackageDelivery(
                this.env.OPERATIONS_SERVICE as never,
              ).deliver(e)
            : e.type === 'PaymentReceived'
              ? new OperationsPaymentDelivery(
                  this.env.OPERATIONS_SERVICE as never,
                ).deliver(e)
              : e.type === 'RefundIssued'
                ? new OperationsRefundDelivery(
                    this.env.OPERATIONS_SERVICE as never,
                  ).deliver(e)
                : new OperationsDepositDelivery(
                    this.env.OPERATIONS_SERVICE as never,
                  ).deliver(e),
      },
    ).execute(input);
  }
  async applyPackageConsumptionRequested(
    input: import('@beauty/contracts').ApplyPackageConsumptionRequest,
  ) {
    return new ApplySessionPackageConsumption(
      new D1CustomerPackageRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async materializeCustomerPackage(
    input: import('@beauty/contracts').MaterializeCustomerPackageRequest,
  ) {
    return new MaterializeCustomerPackage(
      new D1CustomerPackageRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async checkPackageUsageEligibility(
    input: import('@beauty/contracts').CheckPackageUsageEligibilityRequest,
  ) {
    return new CheckPackageUsageEligibility(
      new D1CustomerPackageRepository(this.env.D1_DATABASE),
    ).execute(input);
  }
  async applyFinancialSettlementRequested(
    input: import('@beauty/contracts').FinancialSettlementRequestedEvent,
  ) {
    return new ApplyFinancialSettlementRequested(
      new D1ReceivableRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async registerPayment(
    input: import('@beauty/contracts').RegisterPaymentRequest,
  ) {
    return new RegisterPayment(
      new D1ReceivableRepository(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async issueRefund(input: import('@beauty/contracts').IssueRefundRequest) {
    return new IssueRefund(
      new D1RefundsPersistence(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async grantInternalCredit(
    input: import('@beauty/contracts').GrantInternalCreditRequest,
  ) {
    return new GrantInternalCredit(
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
      new D1CreditsPersistence(this.env.D1_DATABASE),
    ).execute(input);
  }
  async evaluateAppointmentCancellationFinancials(
    input: import('@beauty/contracts').EvaluateCancellationFinancialsRequest,
  ) {
    return new EvaluateAppointmentChangeFinancials(
      new D1AppointmentChangePoliciesPersistence(this.env.D1_DATABASE),
    ).cancellation(input);
  }
  async evaluateAppointmentNoShowFinancials(
    input: import('@beauty/contracts').EvaluateNoShowFinancialsRequest,
  ) {
    return new EvaluateAppointmentChangeFinancials(
      new D1AppointmentChangePoliciesPersistence(this.env.D1_DATABASE),
    ).noShow(input);
  }
  async validateFinancialDecisionSnapshot(input: {
    tenantId: string;
    snapshot: import('@beauty/contracts').FinancialDecisionSnapshotV2;
  }) {
    return new ValidateFinancialDecisionSnapshot(
      new D1AppointmentChangePoliciesPersistence(this.env.D1_DATABASE),
    ).execute(input.tenantId, input.snapshot);
  }
  async buildFinancialDecisionSnapshot(
    input: Parameters<BuildFinancialDecisionSnapshot['execute']>[0],
  ) {
    return new BuildFinancialDecisionSnapshot(
      new D1AppointmentChangePoliciesPersistence(this.env.D1_DATABASE),
    ).execute(input);
  }
  async applyAppointmentCanceledFinancialEffects(
    input: import('@beauty/contracts').AppointmentFinancialEffectEvent,
  ) {
    return new FinancialEffectExecutor(
      new D1AppointmentChangePoliciesPersistence(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
  async applyAppointmentNoShowFinancialEffects(
    input: import('@beauty/contracts').AppointmentFinancialEffectEvent,
  ) {
    return new FinancialEffectExecutor(
      new D1AppointmentChangePoliciesPersistence(this.env.D1_DATABASE),
      new D1UnitOfWork(this.env.D1_DATABASE),
      new D1IdempotencyStore(this.env.D1_DATABASE),
    ).execute(input);
  }
}
