# PR-24 — Receivable + Payment + Ledger Foundation

## Objective

Provide Billing's authoritative receivable balance, confirmed payments and append-only ledger while preserving tenant isolation, idempotency, atomicity and package no-double-charge semantics.

## Scope

Receivable materialization from `FinancialSettlementRequested`, confirmed deposit application, partial/final payments, overpayment blocking, PaymentReceived projection and physical D1 constraints.

## Out of Scope

Refund, chargeback, gateway webhooks, installments, taxes, cash closing, reservation and Internal Credit operation.

## Definition of Done

Migration 0019, domain/application/adapter layers, Service Binding events, payment concurrency, UnitOfWork rollback and regressions pass. `INTERNAL_CREDIT` remains unavailable until its domain exists.
