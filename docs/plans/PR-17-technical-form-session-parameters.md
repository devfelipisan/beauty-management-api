# PR-17 — Technical Form Configuration + Session Parameters Foundation

## Objective

Materialize service-scoped technical form versions, immutable session snapshots, typed progressive values, and explicit applied-power records in the Clinical Worker.

## Ownership

Operations remains the authority for Service identity and exposes a small technical context. Clinical owns technical form definitions, snapshots, values, and power records.

## Invariants

- Every query is scoped by `tenantId`; a form is also scoped by `serviceId`.
- Published forms are immutable and only one `ACTIVE` version exists per tenant/service.
- A session snapshot copies field definitions and is never changed by later form versions.
- Values are validated against the copied field definition, not caller metadata.
- Values may be saved partially while the session is `IN_PROGRESS`.
- Power is append-only, typed as a decimal textual value plus a caller-supplied unit.
- Technical saves use one idempotency record and one summarized audit event; they do not emit outbox events.

## Technical field types

`SHORT_TEXT`, `LONG_TEXT`, `INTEGER`, `DECIMAL`, `PERCENTAGE`, `SINGLE_SELECT`, `MULTI_SELECT`, `BOOLEAN`, `DATE`, `TIME`, and `MEASUREMENT`.

Numeric values use decimal text and optional precision/range/unit constraints. Select values must belong to the versioned options.

## API and permissions

- Admin configuration: `POST /tenants/:tenantId/services/:serviceId/technical-forms`, `POST .../technical-forms/:id/publish`, and `GET .../technical-form`.
- Session values: `PUT /tenants/:tenantId/sessions/:sessionId/technical-values`.
- Power: `PUT /tenants/:tenantId/sessions/:sessionId/power`.
- Configuration uses `technical-form.create`, `technical-form.publish`, and `technical-form.read`; recording uses `session.technical.update`.

## Out of scope

Equipment, photos/R2, intercurrence, historical comparison/alerts, package consumption, payments, and `CompleteSession`.

## Definition of Done

Migration 0011, domain validation, repositories, worker routes/RPC, tenant/professional authorization, idempotency, atomic snapshot/value writes, append-only audit, unit tests, worker proofs, lint, typecheck, all previous gates, dry-run, and `git diff --check` pass.
