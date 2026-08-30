# Idempotency

Chave lógica: `tenantId + operation + idempotencyKey + requestHash`. Mesma chave e mesmo payload retornam o mesmo resultado lógico; mesma chave e payload diferente produzem `CONFLICT`.

Aplicar em criação de appointment, confirmação de sinal, início/conclusão de sessão, pagamentos, refunds e consumo de créditos.

