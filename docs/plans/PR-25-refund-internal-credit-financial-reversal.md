# PR-25 — Refund + Internal Credit + Financial Reversal

## Objective

Adicionar reversibilidade financeira sem apagar pagamentos ou reescrever o ledger.

## Refund

Refunds referenciam um Payment existente e usam CAS em `refunded_amount_cents`; refunds parciais e integrais são permitidos até o valor recebido. Cada refund gera auditoria, outbox `RefundIssued` e movimento append-only `REFUND_ISSUED` na mesma UnitOfWork.

## Internal Credit

O saldo é tenant/customer-scoped em `customer_credit_balances` e sua origem é explícita (`REFUND`). O saldo nunca é negativo e concessões idempotentes são protegidas por `CREDIT_GRANTED` no ledger.

## Out of scope

Gateway, chargeback, estorno automático de receivable, crédito manual, cash closing e alteração do Payment original.

## Definition of Done

Migration 0020, contratos, casos de uso Billing, provas de concorrência/replay/tenant isolation e regressões passam.
