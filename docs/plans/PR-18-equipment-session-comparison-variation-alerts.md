# PR-18 — Equipment Usage + Previous Session Comparison + Variation Alerts

## Objective

Add Clinical equipment inventory/compatibility, historical session equipment usage, bounded previous-session context, generic technical comparison, configurable variation policies, and non-blocking alerts.

## Scope and ownership

Clinical owns Equipment, compatibility, SessionEquipmentUsage, VariationPolicy, and SessionVariationAlert. Operations remains the authority for Service identity and exposes service technical context.

## Rules

- Only `AVAILABLE` equipment compatible with the session service can be newly used.
- Usage stores equipment identity snapshots and survives later inactivation.
- Previous context is bounded by tenant, customer, service, excludes the current session, and returns only technical values, power, and equipment currently materialized.
- Comparison uses stable `fieldKey`; type/unit mismatches are explicit and never coerced.
- Policies are tenant/service scoped and store deterministic absolute or basis-point percentage thresholds.
- Alerts preserve previous/current values and policy snapshots, remain `OPEN` until justification, and never block the in-progress session in this PR.
- Administrative configuration and professional session writes have separate permissions, idempotency, and append-only audit.

## Out of scope

Photos/R2, intercurrence, maintenance workflow, calibration, automatic hard-blocks, package/payment flows, and `CompleteSession`.

## Definition of Done

Migration 0012, domain tests, bounded D1 adapters, HTTP/RPC routes, historical snapshots, comparison/alert/justification flows, tenant and professional authorization, idempotency, audit, previous gates, lint, typecheck, worker tests and dry-runs pass.
