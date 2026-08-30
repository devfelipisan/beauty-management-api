# Outbox

`OutboxWriter.append()` grava eventos com status inicial `PENDING`. Nesta etapa
não existe consumer, retry policy, Queue, cron ou integração externa. O Async
Worker será responsável pelo consumo em etapa posterior.
