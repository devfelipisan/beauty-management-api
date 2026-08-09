import type { AppointmentStatus } from "@/shared/domain/lifecycle-status";
import { createStateMachine, type TransitionMap } from "@/shared/domain/state-machine/state-machine";

export type AppointmentAction =
  | "deposit_confirmed"
  | "confirm_presence"
  | "check_in"
  | "start_session"
  | "complete"
  | "reschedule"
  | "cancel"
  | "mark_no_show"
  | "expire_deposit";

const APPOINTMENT_TRANSITIONS = {
  awaiting_deposit: {
    deposit_confirmed: "awaiting_confirmation",
    expire_deposit: "expired",
    cancel: "canceled",
  },
  awaiting_confirmation: {
    confirm_presence: "confirmed",
    reschedule: "rescheduled",
    cancel: "canceled",
  },
  confirmed: {
    check_in: "checked_in",
    start_session: "in_progress",
    reschedule: "rescheduled",
    cancel: "canceled",
    mark_no_show: "no_show",
  },
  checked_in: {
    start_session: "in_progress",
    cancel: "canceled",
  },
  in_progress: {
    complete: "completed",
  },
  completed: {},
  rescheduled: {},
  canceled: {},
  no_show: {},
  expired: {},
} as const satisfies TransitionMap<AppointmentStatus, AppointmentAction>;

export const appointmentStateMachine = createStateMachine<AppointmentStatus, AppointmentAction>({
  name: "Appointment",
  errorCode: "APPOINTMENT_INVALID_TRANSITION",
  transitions: APPOINTMENT_TRANSITIONS,
});

export function allowedAppointmentActions(status: AppointmentStatus): readonly AppointmentAction[] {
  return appointmentStateMachine.allowedActions(status);
}

export function transitionAppointment(status: AppointmentStatus, action: AppointmentAction): AppointmentStatus {
  return appointmentStateMachine.transition(status, action);
}
