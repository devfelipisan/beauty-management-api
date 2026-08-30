# PR-13 — Deposit Lifecycle + Appointment Deposit Transitions

## Objetivo

Implementar o ciclo local do depósito no Billing Worker e a propagação explícita das transições do Appointment no Operations Worker.

## Fluxo

```text
CreateDepositForAppointment
→ Billing D1: depósito PENDING + audit + outbox + idempotência

ConfirmDeposit / ExpireDeposit
→ Billing CAS + audit + outbox + idempotência
→ RPC síncrono best-effort para Operations
→ Appointment AWAITING_DEPOSIT → AWAITING_CONFIRMATION/EXPIRED
```

Falha na propagação não desfaz a transação local do Billing; o outbox permanece pendente para evolução posterior.

## Escopo

- Migration `0007_deposit_lifecycle.sql`.
- Contratos de criação, confirmação, expiração e transição interna.
- Estado canônico `PENDING`, `CONFIRMED`, `EXPIRED`, `CANCELED`.
- Repositório D1 tenant-aware e CAS para transições.
- RPCs internas nos Workers.
- Testes unitários da FSM e testes físicos do fluxo, idempotência, isolamento e regressão.

Não entram pagamentos, Queue, Cron, consumer, reconciliação ou endpoint público de confirmação.

## Gate

`npm run gate:pr13`
