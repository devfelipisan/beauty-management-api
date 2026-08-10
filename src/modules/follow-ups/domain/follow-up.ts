import { DomainError, createEntityId, nowIso, type EntityId, type IsoDateTime } from "@/shared/domain/core";
import { createStateMachine } from "@/shared/domain/state-machine/state-machine";

export type FollowUpStatus = "pending" | "scheduled" | "completed" | "canceled";
export type FollowUpAction = "schedule" | "complete" | "cancel" | "reopen";

const machine = createStateMachine<FollowUpStatus, FollowUpAction>({
  name: "follow-up",
  errorCode: "FOLLOW_UP_TRANSITION_INVALID",
  transitions: {
    pending: { schedule: "scheduled", cancel: "canceled" },
    scheduled: { complete: "completed", cancel: "canceled" },
    completed: {},
    canceled: { reopen: "pending" },
  },
});

export interface FollowUp {
  id: EntityId;
  tenantId: EntityId;
  customerId: EntityId;
  sessionId?: EntityId;
  suggestedAt: IsoDateTime;
  reason?: string;
  appointmentId?: EntityId;
  status: FollowUpStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CreateFollowUpProps {
  tenantId: EntityId;
  customerId: EntityId;
  sessionId?: EntityId;
  suggestedAt: IsoDateTime;
  reason?: string;
  appointmentId?: EntityId;
}

export function createFollowUp(props: CreateFollowUpProps): FollowUp {
  if (!props.tenantId.trim() || !props.customerId.trim()) {
    throw new DomainError("FOLLOW_UP_REFERENCE_REQUIRED", "Tenant and customer are required.");
  }
  if (Number.isNaN(Date.parse(props.suggestedAt))) {
    throw new DomainError("FOLLOW_UP_DATE_INVALID", "Suggested follow-up date must be an ISO date-time.");
  }
  const timestamp = nowIso();
  return {
    id: createEntityId(),
    tenantId: props.tenantId.trim(),
    customerId: props.customerId.trim(),
    sessionId: props.sessionId?.trim() || undefined,
    suggestedAt: props.suggestedAt,
    reason: props.reason?.trim() || undefined,
    appointmentId: props.appointmentId?.trim() || undefined,
    status: props.appointmentId ? "scheduled" : "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function transitionFollowUp(entity: FollowUp, action: FollowUpAction, appointmentId?: string): FollowUp {
  const status = machine.transition(entity.status, action);
  if (action === "schedule" && !appointmentId?.trim()) {
    throw new DomainError("FOLLOW_UP_APPOINTMENT_REQUIRED", "Appointment is required to schedule a follow-up.");
  }
  return {
    ...entity,
    status,
    appointmentId: action === "schedule" ? appointmentId!.trim() : action === "reopen" ? undefined : entity.appointmentId,
    updatedAt: nowIso(),
  };
}

export const allowedFollowUpActions = (status: FollowUpStatus) => machine.allowedActions(status);
