import type { DepositStatus } from "@/shared/domain/lifecycle-status";
import { createStateMachine, type TransitionMap } from "@/shared/domain/state-machine/state-machine";

/** Actions currently implemented by the deposit bounded context. */
export type DepositAction = "confirm";

const DEPOSIT_TRANSITIONS = {
  not_required: {},
  awaiting_payment: { confirm: "confirmed" },
  proof_submitted: { confirm: "confirmed" },
  under_review: { confirm: "confirmed" },
  confirmed: {},
  rejected: {},
  expired: {},
  refunded: {},
  retained: {},
  credit: {},
} as const satisfies TransitionMap<DepositStatus, DepositAction>;

export const depositStateMachine = createStateMachine<DepositStatus, DepositAction>({
  name: "Deposit",
  errorCode: "DEPOSIT_INVALID_TRANSITION",
  transitions: DEPOSIT_TRANSITIONS,
});
