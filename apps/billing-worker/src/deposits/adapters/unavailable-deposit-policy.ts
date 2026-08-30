import { Injectable } from '@nestjs/common';
import type { DepositPolicyPort } from '../ports/deposit-policy.port.js';
@Injectable() export class UnavailableDepositPolicy implements DepositPolicyPort { async evaluate() { return { available:false }; } }
