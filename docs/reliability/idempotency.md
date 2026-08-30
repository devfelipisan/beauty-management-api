# Idempotência

A chave é composta por `tenantId + operation + idempotencyKey`. A mesma chave
com o mesmo hash de request permite replay; a mesma chave com hash diferente
produz `IDEMPOTENCY_KEY_CONFLICT`. Registros novos iniciam em `PROCESSING`.

O payload de resposta deve permanecer pequeno e não deve ser usado como blob.
