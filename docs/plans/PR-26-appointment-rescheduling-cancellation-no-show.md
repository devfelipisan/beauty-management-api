# PR-26 — Appointment Changes and Financial Effects

## Objective

Implement rescheduling, cancellation and no-show as authoritative Appointment operations with explicit reasons, immutable history, idempotency and tenant-scoped persistence.

## Rules

Rescheduling does not consume packages or create a second payment. Cancellation is fail-closed when financial policy is unavailable; completed and in-progress appointments cannot be canceled. No-show is time/policy dependent and never creates a completed Session or consumes a package.

## Financial boundary

Operations owns the lifecycle mutation and publishes the operational fact. Billing owns refund, credit and deposit consequences through contracts; no Billing table is updated by Operations.

## Out of scope

Hardcoded cancellation percentages, reservation, automatic receivable reopening, gateway integration and new Session cancellation states.
