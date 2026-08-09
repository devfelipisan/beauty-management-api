import type { SessionStatus } from "@/shared/domain/lifecycle-status";
import { createStateMachine, type TransitionMap } from "@/shared/domain/state-machine/state-machine";

export type SessionAction = "complete";

const SESSION_TRANSITIONS = {
  in_progress: { complete: "completed" },
  completed: {},
} as const satisfies TransitionMap<SessionStatus, SessionAction>;

export const sessionStateMachine = createStateMachine<SessionStatus, SessionAction>({
  name: "Session",
  errorCode: "SESSION_INVALID_TRANSITION",
  transitions: SESSION_TRANSITIONS,
});
