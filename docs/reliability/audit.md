# Auditoria

`AuditWriter` é append-only. Não há operações de update ou delete. O evento
transporta contexto seguro (`tenantId`, `actorId`, `requestId`, `correlationId`)
e metadata explícita; PII completa não deve ser registrada.
