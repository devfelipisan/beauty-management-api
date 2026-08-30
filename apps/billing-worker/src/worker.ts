/// <reference types="@cloudflare/workers-types" />
import { WorkerEntrypoint } from 'cloudflare:workers';
import { dispatchHealth, notFound } from '../../../libs/cloudflare-runtime/src/index.js';
import { CalculateCommercialTerms } from './commercial-terms/application/calculate-commercial-terms.js';
import { ConfiguredDiscountPolicy } from './discounts/adapters/configured-discount-policy.js';
import { D1DiscountPolicyRepository } from './discounts/adapters/d1-discount-policy-repository.js';
import { ConfiguredDepositPolicy } from './deposits/adapters/configured-deposit-policy.js';
import type { CalculateCommercialTermsRequest, CommercialTermsResponse } from '../../../libs/contracts/src/index.js';
export interface BillingEnv { D1_DATABASE:D1Database; }
export default class BillingWorker extends WorkerEntrypoint<BillingEnv> { async fetch(request:Request):Promise<Response>{return dispatchHealth(request,'beauty-billing-worker')??notFound();} async calculateCommercialTerms(input:CalculateCommercialTermsRequest):Promise<CommercialTermsResponse>{if(!input.tenantId||!input.customerId||!input.serviceId||!Number.isInteger(input.basePriceCents)||input.basePriceCents<0)return {status:'BLOCKED',reason:'INVALID_COMMERCIAL_TERMS'}; return new CalculateCommercialTerms(new ConfiguredDiscountPolicy(new D1DiscountPolicyRepository(this.env.D1_DATABASE)),new ConfiguredDepositPolicy()).execute(input);} }
