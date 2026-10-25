import { Injectable } from '@nestjs/common';
import type { CommercialTermsPort } from '../ports/commercial-terms-port.js';
@Injectable() export class UnavailableCommercialTerms implements CommercialTermsPort { async calculate() { return { status:'BLOCKED' as const, reason:'DISCOUNT_POLICY_UNAVAILABLE' as const }; } }
