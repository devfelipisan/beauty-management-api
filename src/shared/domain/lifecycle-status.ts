export type AppointmentStatus =
  | "awaiting_deposit"
  | "awaiting_confirmation"
  | "confirmed"
  | "checked_in"
  | "in_progress"
  | "completed"
  | "rescheduled"
  | "canceled"
  | "no_show"
  | "expired";

export type DepositStatus =
  | "not_required"
  | "awaiting_payment"
  | "proof_submitted"
  | "under_review"
  | "confirmed"
  | "rejected"
  | "expired"
  | "refunded"
  | "retained"
  | "credit";

export type SessionStatus = "in_progress" | "completed";
