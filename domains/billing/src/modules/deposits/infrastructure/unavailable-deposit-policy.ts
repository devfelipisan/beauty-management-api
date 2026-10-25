import type { DepositPolicyPort } from '../ports/deposit-policy.port.js';
export class UnavailableDepositPolicy implements DepositPolicyPort { async evaluate() { return { available:false }; } }
