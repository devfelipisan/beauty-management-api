import { Module } from '@nestjs/common';
import { CalculateCommercialTerms } from './application/calculate-commercial-terms.js';
import { UnavailableDiscountPolicy } from '../discounts/adapters/unavailable-discount-policy.js';
import { UnavailableDepositPolicy } from '../deposits/adapters/unavailable-deposit-policy.js';
import { DISCOUNT_POLICY } from '../discounts/ports/discount-policy.port.js';
import { DEPOSIT_POLICY } from '../deposits/ports/deposit-policy.port.js';
@Module({ providers:[CalculateCommercialTerms,UnavailableDiscountPolicy,UnavailableDepositPolicy,{provide:DISCOUNT_POLICY,useExisting:UnavailableDiscountPolicy},{provide:DEPOSIT_POLICY,useExisting:UnavailableDepositPolicy}], exports:[CalculateCommercialTerms] })
export class CommercialTermsModule {}
