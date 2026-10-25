import type { ApplyDepositTransitionRequest, ApplyDepositTransitionResponse } from '@beauty/contracts';
export interface AppointmentDepositTransitionPort { applyDepositConfirmed(input:ApplyDepositTransitionRequest):Promise<ApplyDepositTransitionResponse>; applyDepositExpired(input:ApplyDepositTransitionRequest):Promise<ApplyDepositTransitionResponse>; }
