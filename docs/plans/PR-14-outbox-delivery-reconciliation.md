# PR-14 — Outbox Delivery + Cross-Worker Reconciliation Foundation

## Objective

Transformar o Outbox em entrega confiável, recuperável, observável e idempotente entre Billing e Operations.

## Current consistency model

Cada Worker possui uma transação local. O Outbox é gravado junto com o fato de negócio; a propagação entre Workers é eventual.

## Outbox lifecycle

`PENDING → PROCESSING → SENT`, com retorno a `PENDING` em falha retryable e `DEAD` em falha permanente ou limite de tentativas.

## Delivery ownership

O Billing Worker despacha `DepositConfirmed` e `DepositExpired` para os RPCs existentes do Operations Worker.

## Claim/lease strategy

Claim é um `UPDATE` CAS em D1, com `claimed_by`, `claimed_at` e `claim_expires_at`. Leases expirados podem ser recuperados sem apagar o evento.

## Retry strategy

Retry determinístico e limitado, controlado por configuração operacional. O evento não é elegível antes de `available_at`.

## Idempotent consumers

Operations reutiliza a idempotência existente com `operation` específica e `eventId` como chave.

## Cross-worker delivery

O transporte é Service Binding. A semântica é at-least-once; ACK perdido pode causar redelivery, que deve ser replay lógico.

## Reconciliation

Neste PR, reconciliação significa recuperar claims expirados e redeliver Outbox pendente. Reconciliação profunda entre tabelas fica fora do escopo.

## Failure classification

Falha transitória retorna a `PENDING`; contrato inválido, evento não suportado ou rejeição permanente retorna `DEAD`.

## Observability

Tentativas registram metadados técnicos allowlisted; payload integral não é registrado e não há Audit para cada tentativa.

## Cloudflare Free constraints

Sem Queue, Cron ou paralelismo ilimitado. O dispatcher é um RPC interno executável e testável.

## Definition of Done

Migration, repository CAS/lease, retry policy, dispatcher, delivery adapter, recuperação, testes unitários/físicos, regressões PR-13 e dry-runs passando.

## Out of scope

Scheduler real, Queue, cleanup, re-drive público e reconciliação DB↔DB completa.
