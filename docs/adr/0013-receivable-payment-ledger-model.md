# ADR-0013 — Receivable, Payment and Ledger

## Decision

Billing owns receivables, payments and append-only ledger movements. A standard completed session creates one appointment receivable from the frozen commercial snapshot. A package-funded session does not create a duplicate service receivable. A package acquisition may have its own `CUSTOMER_PACKAGE` receivable.

Confirmed deposits are applied to a receivable exactly once and are included in `paid_amount_cents`; they do not create a second Payment. Payments are confirmed manual financial facts, use integer cents, require idempotency and reject overpayment. `INTERNAL_CREDIT` is recognized but unavailable until the credit domain exists.

Refund, chargeback, credit, gateway integration and cash closing are out of scope.
