import { Module } from '@nestjs/common';
import { CalculateCommercialTerms } from '@beauty/billing/modules/commercial-terms/application/calculate-commercial-terms';
import { UnavailableDiscountPolicy } from '@beauty/billing/modules/discounts/infrastructure/unavailable-discount-policy';
import { UnavailableDepositPolicy } from '@beauty/billing/modules/deposits/infrastructure/unavailable-deposit-policy';
import { DISCOUNT_POLICY } from '@beauty/billing/modules/discounts/ports/discount-policy.port';
import { DEPOSIT_POLICY } from '@beauty/billing/modules/deposits/ports/deposit-policy.port';
@Module({ providers:[CalculateCommercialTerms,UnavailableDiscountPolicy,UnavailableDepositPolicy,{provide:DISCOUNT_POLICY,useExisting:UnavailableDiscountPolicy},{provide:DEPOSIT_POLICY,useExisting:UnavailableDepositPolicy}], exports:[CalculateCommercialTerms] })
export class CommercialTermsModule {}
