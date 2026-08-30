export interface PlanLimit { capacityAvailable: boolean; }
export interface PlanLimitPort { check(input: { tenantId: string; operation: string }): Promise<PlanLimit>; }
export const PLAN_LIMIT = Symbol('PLAN_LIMIT');
