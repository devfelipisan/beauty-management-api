# PR-22 — Session Completion Effects, Customer History, Relationship Profile and Return Foundation

## Objective

Materializar os efeitos pós-conclusão normativos disponíveis no MVP: histórico funcional do cliente, evolução de perfil e fundação de retorno recomendado.

## Ownership and consistency

Clinical continua autoridade da Session e dos dados clínicos. Operations é autoridade de Customer, perfil, timeline e ReturnRecommendation. `SessionCompleted` e `ReturnRecommended` são fatos entregues por Outbox com at-least-once delivery; o Operations aplica seus efeitos em transações D1 locais idempotentes por `eventId`. Não existe transação distribuída.

## Implemented effects

- `SessionCompleted`: appointment `IN_PROGRESS -> COMPLETED`, evento `SESSION_COMPLETED`, estatística de sessões concluídas e avaliação `NEW -> OLD`.
- `ReturnRecommended`: projeção `PENDING` e evento de timeline `RETURN_RECOMMENDED`.
- Timeline append-only, tenant-aware, ordenada por `occurred_at DESC, id DESC`, com cursor e filtros disponíveis.
- `recommendedFor` é imutável e não cria appointment.

## Profile policy

O enum existente é preservado. A transição obrigatória é `NEW -> OLD` na primeira sessão concluída. `ASSIDUOUS`, `INACTIVE` e `RECURRING_ABSENCES` não são inferidos sem fatos/política explícitos.

## Authorization and privacy

History exige membership e `customer.history.read`; a resposta contém referências e metadados seguros, nunca valores técnicos, descrições de intercorrência ou fotos. Retorno exige contexto profissional autorizado e Session `COMPLETED`.

## Known normative gap

`RN-CONC-002` permanece parcial: Session, appointment, history, profile, return e audit são atendidos; package consumption e financial balance ainda não existem e continuam `NOT IMPLEMENTED`. Portanto `RN-CONC-002 FULL = NOT YET`.

## Out of scope

Payment, ledger, packages, notifications, no-show, cancellation, rescheduling, cron, R2/KV/Queue novos e conversão automática de retorno em appointment.
