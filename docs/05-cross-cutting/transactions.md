# Transactions

Fluxo oficial: validar contexto → reservar idempotência → carregar agregados → validar políticas → aplicar FSM → persistir mutation → append audit → append outbox → completar idempotência → commit. Erro produz rollback.

