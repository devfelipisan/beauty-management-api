# PR-19 — Intercurrence Foundation + Clinical Restrictions Propagation

## Objective

Persist intercorrências clínicas durante sessões abertas and propagate explicit blocking restrictions to the Operations customer-admission projection.

## Rules

- Clinical owns `Intercurrence` and `ClinicalRestriction`; Operations owns only the projection used by appointment eligibility.
- Reports require an `IN_PROGRESS` session and the session professional (or explicit administrative permission).
- `reportedAt`, `reportedBy`, `resolvedAt`, and `resolvedBy` are server-side; clinical descriptions never enter logs or event payloads.
- Restriction is a separate policy outcome. Follow-up/reassessment do not automatically mean appointment blocking.
- Blocking restrictions create `ClinicalRestrictionActivated`; resolution creates `ClinicalRestrictionResolved`.
- Operations applies events idempotently by event id and only clears admission when no active blocking restriction remains.
- Current sessions remain `IN_PROGRESS`; photos, diagnosis, notifications, payments, and completion are out of scope.

## Definition of Done

Migration 0013, domain/application/adapters, bounded queries, CAS resolution, idempotency, audit, outbox delivery/retry, Operations projection, CustomerRestrictionPort integration, tests, lint, typecheck and dry-run pass.
