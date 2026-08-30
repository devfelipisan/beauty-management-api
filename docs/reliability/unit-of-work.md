# Reliability Foundation

O contrato de comando e `UnitOfWork.execute(context)`. O contexto expõe apenas
`IdempotencyStore`, `AuditWriter` e `OutboxWriter`; SQL e D1 ficam nos adapters.

O adapter D1 acumula os registros de confiabilidade e usa `D1Database.batch()`
para enviar o conjunto como uma operação atômica do D1. A mutation de domínio
deve ser integrada ao mesmo batch quando o repository receber uma sessão de
transação. Este PR não simula `BEGIN`, `SELECT FOR UPDATE` ou serialização do
PostgreSQL.

`GET /health` não utiliza essa infraestrutura.
