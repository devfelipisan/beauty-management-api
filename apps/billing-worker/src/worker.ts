import { executionEnv, scopeEntrypoint } from '@beauty/database/d1/invocation';
import { assertRpcContract } from '@beauty/contracts';
import { observedHttpRequest } from '@beauty/cloudflare-runtime';
import {
  authorizeSystemDispatch,
  authorizeWorkerRpc,
  bindRpcAuthority,
  userRpcMetadata,
} from '@beauty/tenancy/adapters/rpc-security';
import { serveSwagger } from '@beauty/cloudflare-runtime/swagger';
import { billingOpenApi } from './openapi.js';
import { BillingComposition } from './composition-root.js';
import type { BillingEnv } from './env.js';
/// <reference types="@cloudflare/workers-types" />
import { WorkerEntrypoint } from 'cloudflare:workers';
import {
  dispatchHealth,
  notFound,
  json,
  ids,
  mappedError,
} from '@beauty/cloudflare-runtime';
import {
  workerSecurity,
  requireHttpAuthority,
} from '@beauty/tenancy/adapters/worker-security';

export type { BillingEnv } from './env.js';
export default class BillingWorker extends WorkerEntrypoint<
  BillingEnv,
  { caller?: string }
> {
  async fetch(request: Request): Promise<Response> {
    return observedHttpRequest(
      request,
      'beauty-billing-worker',
      executionEnv(this.env).SERVICE_VERSION,
      executionEnv(this.env).OBSERVE_ENABLED === 'true',
      async (request) => {
        const docs = serveSwagger(request, billingOpenApi);
        if (docs) return docs;
        const health = dispatchHealth(
          request,
          'beauty-billing-worker',
          executionEnv(this.env).SERVICE_VERSION,
        );
        if (health) return health;
        const match = new URL(request.url).pathname.match(
          /^\/tenants\/([^/]+)\/receivables\/([^/]+)\/payments$/,
        );
        if (!match) return notFound();
        const { requestId, correlationId } = ids(request);
        try {
          if (request.method !== 'POST') return notFound();
          const token = request.headers
            .get('authorization')
            ?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
          const identity = token
            ? await workerSecurity(
                executionEnv(this.env),
              ).identity.authenticate(token)
            : null;
          if (!identity)
            return json(
              {
                status: 'error',
                code: token
                  ? 'INVALID_AUTHENTICATION'
                  : 'AUTHENTICATION_REQUIRED',
                requestId,
                correlationId,
              },
              401,
            );
          const membership = await workerSecurity(
            executionEnv(this.env),
          ).membership.findActiveMembership(identity.actorId, match[1]);
          if (!membership)
            return json(
              {
                status: 'error',
                code: 'TENANT_ACCESS_DENIED',
                requestId,
                correlationId,
              },
              403,
            );
          if (!membership.permissions.includes('payment.create'))
            return json(
              {
                status: 'error',
                code: 'PERMISSION_DENIED',
                requestId,
                correlationId,
              },
              403,
            );
          const key = request.headers.get('Idempotency-Key');
          if (!key?.trim())
            return json(
              {
                status: 'error',
                code: 'IDEMPOTENCY_KEY_REQUIRED',
                requestId,
                correlationId,
              },
              400,
            );
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            throw new Error('VALIDATION_ERROR');
          }
          if (!validPaymentBody(body)) throw new Error('VALIDATION_ERROR');
          return json(
            {
              data: await this.registerPayment({
                ...userRpcMetadata(request),
                tenantId: match[1],
                receivableId: match[2],
                customerId:
                  typeof body.customerId === 'string'
                    ? body.customerId
                    : undefined,
                amountCents: body.amountCents as number,
                method: body.method as never,
                externalReference: body.externalReference as string | undefined,
                notes: body.notes as string | undefined,
                actorId: identity.actorId,
                idempotencyKey: key,
                requestId,
                correlationId,
              }),
              requestId,
              correlationId,
            },
            201,
          );
        } catch (error) {
          return mappedError(error, requestId, correlationId);
        }
      },
      (incoming) => requireHttpAuthority(incoming, executionEnv(this.env)),
    );
  }
  async calculateCommercialTerms(
    ...args: Parameters<BillingComposition['calculateCommercialTerms']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['appointment.create'] },
      args[0],
    );
    assertRpcContract('calculateCommercialTerms', authorized.input);
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).calculateCommercialTerms(
      authorized.input as unknown as Parameters<
        BillingComposition['calculateCommercialTerms']
      >[0],
    );
  }
  async createDepositForAppointment(
    ...args: Parameters<BillingComposition['createDepositForAppointment']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { eventType: 'AppointmentCreated' },
      args[0],
    );
    assertRpcContract('createDepositForAppointment', authorized.input);
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).createDepositForAppointment(
      authorized.input as unknown as Parameters<
        BillingComposition['createDepositForAppointment']
      >[0],
    );
  }
  async confirmDeposit(
    ...args: Parameters<BillingComposition['confirmDeposit']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      {},
      args[0],
    );
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).confirmDeposit(
      authorized.input as unknown as Parameters<
        BillingComposition['confirmDeposit']
      >[0],
    );
  }
  async expireDeposit(
    ...args: Parameters<BillingComposition['expireDeposit']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      {},
      args[0],
    );
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).expireDeposit(
      authorized.input as unknown as Parameters<
        BillingComposition['expireDeposit']
      >[0],
    );
  }
  async dispatchOutboxBatch(
    ...args: Parameters<BillingComposition['dispatchOutboxBatch']>
  ) {
    const input = authorizeSystemDispatch(
      executionEnv(this.env),
      this.ctx.props?.caller,
      args[0],
    );
    return new BillingComposition(executionEnv(this.env)).dispatchOutboxBatch(
      input,
    );
  }
  async applyPackageConsumptionRequested(
    ...args: Parameters<BillingComposition['applyPackageConsumptionRequested']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { eventType: 'PackageConsumptionRequested' },
      args[0],
    );
    assertRpcContract('applyPackageConsumptionRequested', authorized.input);
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).applyPackageConsumptionRequested(
      authorized.input as unknown as Parameters<
        BillingComposition['applyPackageConsumptionRequested']
      >[0],
    );
  }
  async materializeCustomerPackage(
    ...args: Parameters<BillingComposition['materializeCustomerPackage']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      {},
      args[0],
    );
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).materializeCustomerPackage(
      authorized.input as unknown as Parameters<
        BillingComposition['materializeCustomerPackage']
      >[0],
    );
  }
  async checkPackageUsageEligibility(
    ...args: Parameters<BillingComposition['checkPackageUsageEligibility']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['appointment.create', 'appointment.package.assign'] },
      args[0],
    );
    assertRpcContract('checkPackageUsageEligibility', authorized.input);
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).checkPackageUsageEligibility(
      authorized.input as unknown as Parameters<
        BillingComposition['checkPackageUsageEligibility']
      >[0],
    );
  }
  async applyFinancialSettlementRequested(
    ...args: Parameters<BillingComposition['applyFinancialSettlementRequested']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { eventType: 'FinancialSettlementRequested' },
      args[0],
    );
    assertRpcContract('applyFinancialSettlementRequested', authorized.input);
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).applyFinancialSettlementRequested(
      authorized.input as unknown as Parameters<
        BillingComposition['applyFinancialSettlementRequested']
      >[0],
    );
  }
  async registerPayment(
    ...args: Parameters<BillingComposition['registerPayment']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['payment.create'] },
      args[0],
    );
    assertRpcContract('registerPayment', authorized.input);
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).registerPayment(
      authorized.input as unknown as Parameters<
        BillingComposition['registerPayment']
      >[0],
    );
  }
  async issueRefund(...args: Parameters<BillingComposition['issueRefund']>) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      {},
      args[0],
    );
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).issueRefund(
      authorized.input as unknown as Parameters<
        BillingComposition['issueRefund']
      >[0],
    );
  }
  async grantInternalCredit(
    ...args: Parameters<BillingComposition['grantInternalCredit']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      {},
      args[0],
    );
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).grantInternalCredit(
      authorized.input as unknown as Parameters<
        BillingComposition['grantInternalCredit']
      >[0],
    );
  }
  async evaluateAppointmentCancellationFinancials(
    ...args: Parameters<
      BillingComposition['evaluateAppointmentCancellationFinancials']
    >
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['appointment.cancel'] },
      args[0],
    );
    assertRpcContract(
      'evaluateAppointmentCancellationFinancials',
      authorized.input,
    );
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).evaluateAppointmentCancellationFinancials(
      authorized.input as unknown as Parameters<
        BillingComposition['evaluateAppointmentCancellationFinancials']
      >[0],
    );
  }
  async evaluateAppointmentNoShowFinancials(
    ...args: Parameters<
      BillingComposition['evaluateAppointmentNoShowFinancials']
    >
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { permissions: ['appointment.no-show'] },
      args[0],
    );
    assertRpcContract('evaluateAppointmentNoShowFinancials', authorized.input);
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).evaluateAppointmentNoShowFinancials(
      authorized.input as unknown as Parameters<
        BillingComposition['evaluateAppointmentNoShowFinancials']
      >[0],
    );
  }
  async validateFinancialDecisionSnapshot(
    ...args: Parameters<BillingComposition['validateFinancialDecisionSnapshot']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      {},
      args[0],
    );
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).validateFinancialDecisionSnapshot(
      authorized.input as unknown as Parameters<
        BillingComposition['validateFinancialDecisionSnapshot']
      >[0],
    );
  }
  async buildFinancialDecisionSnapshot(
    ...args: Parameters<BillingComposition['buildFinancialDecisionSnapshot']>
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      {},
      args[0],
    );
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).buildFinancialDecisionSnapshot(
      authorized.input as unknown as Parameters<
        BillingComposition['buildFinancialDecisionSnapshot']
      >[0],
    );
  }
  async applyAppointmentCanceledFinancialEffects(
    ...args: Parameters<
      BillingComposition['applyAppointmentCanceledFinancialEffects']
    >
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { eventType: 'AppointmentCanceled' },
      args[0],
    );
    assertRpcContract(
      'applyAppointmentCanceledFinancialEffects',
      authorized.input,
    );
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).applyAppointmentCanceledFinancialEffects(
      authorized.input as unknown as Parameters<
        BillingComposition['applyAppointmentCanceledFinancialEffects']
      >[0],
    );
  }
  async applyAppointmentNoShowFinancialEffects(
    ...args: Parameters<
      BillingComposition['applyAppointmentNoShowFinancialEffects']
    >
  ) {
    const authorized = await authorizeWorkerRpc(
      executionEnv(this.env),
      { eventType: 'AppointmentNoShowRecorded' },
      args[0],
    );
    assertRpcContract(
      'applyAppointmentNoShowFinancialEffects',
      authorized.input,
    );
    return new BillingComposition(
      bindRpcAuthority(executionEnv(this.env), authorized.authority),
    ).applyAppointmentNoShowFinancialEffects(
      authorized.input as unknown as Parameters<
        BillingComposition['applyAppointmentNoShowFinancialEffects']
      >[0],
    );
  }
}

function validPaymentBody(body: unknown): body is Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const value = body as Record<string, unknown>;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          'customerId',
          'amountCents',
          'method',
          'externalReference',
          'notes',
        ].includes(key),
    )
  )
    return false;
  if (
    !Number.isSafeInteger(value.amountCents) ||
    (value.amountCents as number) <= 0 ||
    typeof value.method !== 'string' ||
    ![
      'CASH',
      'PIX',
      'DEBIT_CARD',
      'CREDIT_CARD',
      'TRANSFER',
      'INTERNAL_CREDIT',
    ].includes(value.method)
  )
    return false;
  return ['customerId', 'externalReference', 'notes'].every(
    (key) => !(key in value) || typeof value[key] === 'string',
  );
}

scopeEntrypoint(BillingWorker);
