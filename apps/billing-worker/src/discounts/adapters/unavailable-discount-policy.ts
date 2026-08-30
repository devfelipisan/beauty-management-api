import { Injectable } from '@nestjs/common';
import type { DiscountPolicyPort } from '../ports/discount-policy.port.js';
@Injectable() export class UnavailableDiscountPolicy implements DiscountPolicyPort { async evaluate() { return { available:false }; } }
