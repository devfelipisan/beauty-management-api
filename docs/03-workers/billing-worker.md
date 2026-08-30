# Billing Worker

Ownership: Deposit, Discount, Payment, Refund, Package e ledger financeiro. Movimentos confirmados são append-only; refund preserva o movimento original. Toda operação crítica é idempotente, auditável e transacional.

