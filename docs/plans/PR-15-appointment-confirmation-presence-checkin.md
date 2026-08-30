# PR-15 — Appointment Confirmation + Presence / Check-in Foundation

## Objective

Implementar confirmação explícita de presença e registro de chegada no Operations Worker, terminando em `CHECKED_IN`.

## Current Appointment lifecycle

`AWAITING_DEPOSIT → AWAITING_CONFIRMATION → CONFIRMED → CHECKED_IN`.

## Canonical states

O PR reutiliza os estados existentes e não cria agregado Presence nem estados de sessão.

## Confirmation authority

`ConfirmAppointment` é uma mutação local do Operations Worker. Um Appointment em `AWAITING_DEPOSIT` não pode ser confirmado.

## Presence/check-in authority

`CheckInAppointment` é uma mutação local do Operations Worker e só aceita `CONFIRMED`.

## State machine changes

Foi formalizada a transição `AWAITING_CONFIRMATION + confirm → CONFIRMED`; `CONFIRMED + check_in → CHECKED_IN` já pertence à mesma FSM.

## Commands and HTTP contracts

- `POST /tenants/:tenantId/appointments/:appointmentId/confirm`
- `POST /tenants/:tenantId/appointments/:appointmentId/check-in`
- Body vazio ou `{}`; `Idempotency-Key` obrigatório.

## Idempotency, Audit and Outbox

Cada comando usa UnitOfWork local, CAS, idempotência, audit e Outbox. Os eventos são `AppointmentConfirmed` e `AppointmentCheckedIn`, ambos `PENDING` e sem consumer neste PR.

## Concurrency and tenant isolation

Leitura e escrita são tenant-aware. A persistência usa `status` anterior na cláusula `WHERE`, impedindo duas transições concorrentes.

## Observability

Request/correlation IDs são preservados no HTTP. Não há RPC externo, Queue, Cron ou chamada ao Clinical/Billing.

## Out of scope

Session, início técnico, cancelamento, no-show, pagamento, notificações e consumers dos novos eventos.

## Definition of Done

Fluxos sem depósito, bloqueio antes de confirmação, replay seguro, timestamps server-side, auditoria/outbox únicos, regressões anteriores e `gate:pr15` passando.
