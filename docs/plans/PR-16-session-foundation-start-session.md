# PR-16 — Session Foundation + StartSession

## Objective

Criar a Session no Clinical Worker a partir de um Appointment elegível em `CHECKED_IN` e propagar `SessionStarted` para o Operations Worker.

## Ownership

Clinical possui Session; Operations continua possuindo Appointment. O Clinical não acessa SQL de Appointment.

## Lifecycle and eligibility

StartSession cria somente `IN_PROGRESS`. O contexto é fornecido pelo Operations e exige tenant ativo, Appointment `CHECKED_IN` e Professional ativo. Não há validação clínica duplicada nem campos técnicos neste PR.

## Historical snapshots

A Session guarda `appointmentId`, `customerId`, `serviceId` e `professionalId`, além de executor e timestamps server-side.

## Reliability

Session, audit `session.started`, Outbox `SessionStarted` e idempotência são gravados na UnitOfWork local. A chave física `UNIQUE(tenant_id, appointment_id)` impede duas Sessions.

## Cross-worker propagation

O Clinical dispatcher reutiliza a fundação do PR-14 e entrega `SessionStarted` ao RPC `applySessionStarted` do Operations. A entrega é at-least-once; falha downstream não remove a Session.

## Tests and Definition of Done

Inclui teste unitário de bloqueio pré-check-in, teste físico de criação/replay, unicidade, audit/outbox, dispatcher e transição `CHECKED_IN → IN_PROGRESS`, além das regressões anteriores e dry-runs.

## Out of scope

CompleteSession, parâmetros, equipamento, potência, ficha técnica, fotos, intercorrências, pagamentos, Queue e Cron.
