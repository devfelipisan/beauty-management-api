# PR-24 — Physical Financial Qualification

## Proofs

The physical suite runs against workerd, D1 and Service Bindings. It covers receivable materialization/replay, package-funded no-double-charge, concurrent overpayment protection, payment/ledger atomicity and integer-cent balance invariants.

## Financial model

`Receivable` is the current obligation projection; `Payment` is a confirmed received fact; `LedgerMovement` is append-only history. Confirmed deposits are represented by `DEPOSIT_APPLIED` and are not duplicated as Payment. `INTERNAL_CREDIT` remains unavailable until its domain exists.

## Gates

Use `test:payment-concurrency`, `gate:financial-foundation` and `gate:pr24`. Payment, Ledger and Receivable queries remain tenant-scoped and indexed.

## Out of scope

Refund, chargeback, gateway integrations, installments, taxes, cash closing and manual balance adjustment.
