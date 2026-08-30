import type { ApplyDepositTransitionRequest, ApplyDepositTransitionResponse } from '../../../../../libs/contracts/src/index.js';
export interface AppointmentDepositTransitionPort { applyDepositConfirmed(input:ApplyDepositTransitionRequest):Promise<ApplyDepositTransitionResponse>; applyDepositExpired(input:ApplyDepositTransitionRequest):Promise<ApplyDepositTransitionResponse>; }
