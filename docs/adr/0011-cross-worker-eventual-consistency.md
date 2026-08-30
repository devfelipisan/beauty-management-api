# ADR-0011 — Cross-worker eventual consistency

## Decision

Cada Worker confirma seu fato localmente. O fato é persistido no Outbox na mesma UnitOfWork, e a entrega downstream ocorre com retry at-least-once. Consumidores usam `eventId` como chave de idempotência; falhas downstream não desfazem o fato upstream. A reconciliação inicial é a recuperação e redistribuição de eventos pendentes ou com lease expirado.

Não existe transação distribuída entre Workers.

## Consequences

- `PROCESSING` possui lease recuperável.
- `SENT` significa que o destino confirmou processamento.
- Falhas retryable mantêm o evento no Outbox com `available_at` futuro.
- Falhas permanentes vão para `DEAD` e o evento nunca é apagado.
- Queue, Cron e reconciliação profunda ficam fora deste PR.
