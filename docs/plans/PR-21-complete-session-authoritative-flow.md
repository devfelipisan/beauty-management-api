# PR-21 — CompleteSession authoritative flow

## Objective

Concluir uma `Session` somente após reavaliar, no Clinical Worker, os requisitos técnicos, de equipamento e de foto materializados para a sessão.

## Scope

Inclui a policy consultiva, `CompleteSession`, CAS D1, auditoria, idempotência, outbox `SessionCompleted`, propagação idempotente para Operations e proteção contra novas mutações de execução após `COMPLETED`.

Intercorrências abertas e alertas de variação são reportados, mas não bloqueiam sem regra normativa adicional. A resolução de intercorrência continua sendo workflow separado.

## Invariants

- A FSM permite somente `IN_PROGRESS -> COMPLETED`.
- `completedAt` e `completedBy` vêm do servidor/contexto.
- `SessionCompleted` contém apenas referências mínimas.
- O POST sempre reavalia a elegibilidade; o GET é somente consultivo.
- R2 não é consultado durante conclusão.

## Out of scope

Pagamentos, pacotes, notificações, retorno, reabertura, edição pós-conclusão e efeitos de histórico do cliente.
