Com o **PR-13 concluído e `gate:pr13 = PASS`**, o próximo PR deve fechar o problema que o próprio PR-13 introduziu de forma deliberada e correta: a **consistência eventual entre Billing e Operations**.

Hoje o fluxo pode chegar legitimamente a:

```text
Billing
  Deposit = CONFIRMED
  Outbox DepositConfirmed = PENDING
        │
        │ tentativa RPC
        ▼
Operations indisponível
        │
        ▼
Appointment ainda = AWAITING_DEPOSIT
```

O depósito já foi confirmado e **não pode ser revertido apenas porque Operations ficou temporariamente indisponível**. Portanto, o próximo PR deve garantir entrega, retry e reconciliação.

# PR-14 — Outbox Delivery + Cross-Worker Reconciliation Foundation

O objetivo é transformar o Outbox, que até agora é apenas persistência confiável de eventos, em um mecanismo de **entrega idempotente, recuperável e observável**.

A arquitetura alvo:

```text
Local authoritative mutation
          │
          ▼
     D1 UnitOfWork
     ┌────┼────┐
     │    │    │
   Domain Audit Outbox
                 │
              PENDING
                 │
                 ▼
        Outbox Dispatcher
                 │
          claim / lease / CAS
                 │
                 ▼
       Destination Worker
                 │
                 ▼
        Idempotent Consumer
                 │
            ACK success
                 │
                 ▼
              SENT
```

E quando houver falha:

```text
PENDING
   ↓
claim
   ↓
delivery failure
   ↓
retryable?
   ├── yes → retry scheduled
   └── no  → DEAD / FAILED
```

Sem perda do evento e sem efeitos duplicados.

---

## 1. Baseline obrigatório

Antes de alterar qualquer arquivo:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:physical-safety
npm run gate:create-appointment
npm run gate:pr12
npm run gate:pr13
```

Tudo deve permanecer:

```text
PASS
```

Depois:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers
```

PR-14 não deve corrigir regressões de PR-13 “no caminho”. Se algo já verde ficar vermelho, resolver primeiro.

---

# 2. Criar o plano formal

Criar:

```text
docs/plans/PR-14-outbox-delivery-reconciliation.md
```

Documentar no mínimo:

```text
Objective
Current consistency model
Outbox lifecycle
Delivery ownership
Claim/lease strategy
Retry strategy
Idempotent consumers
Cross-worker delivery
Reconciliation
Failure classification
Observability
Cloudflare Free constraints
Tests
Definition of Done
Out of scope
```

---

# 3. Congelar a decisão arquitetural

O sistema agora precisa declarar explicitamente:

```text
No distributed transaction across Workers.
```

A unidade de consistência continua:

```text
bounded context local transaction
```

e integração:

```text
Outbox + idempotent delivery + reconciliation
```

Se o ADR ainda não foi criado no PR-13, criar:

```text
docs/adr/0011-cross-worker-eventual-consistency.md
```

Com a decisão:

```text
1. cada Worker confirma seu fato localmente;
2. o fato é persistido no Outbox na mesma UnitOfWork;
3. entrega downstream é assíncrona/repetível;
4. consumidores são idempotentes;
5. falha downstream não desfaz o fato upstream;
6. reconciliação corrige projeções atrasadas.
```

---

# 4. Não começar por Queue

O erro mais provável aqui seria:

```text
Outbox
↓
Cloudflare Queue
```

antes de construir o dispatcher corretamente.

Primeiro precisamos de uma abstração transport-neutral:

```text
OutboxDispatcher
DeliveryPort
Consumer
RetryPolicy
```

Depois Queue/Cron serão adapters.

Isso permite provar tudo com `workerd` sem prender domínio a Cloudflare.

---

# 5. Inspecionar o Outbox atual

Antes de criar entidades:

```bash
find libs/reliability -maxdepth 7 -type f | sort
grep -R "Outbox" libs/reliability apps -n
```

Revisar:

```text
OutboxEvent
OutboxWriter
D1OutboxWriter
migration 0002
```

Não criar `OutboxEventV2`.

Evoluir a fundação existente.

---

# 6. Verificar schema atual do Outbox

Abrir:

```bash
cat database/d1/migrations/0002_reliability_foundation.sql
```

Provavelmente hoje existe apenas algo semelhante a:

```text
id
tenant_id
event_type
payload
status = PENDING
created_at
```

PR-14 precisará de metadata de delivery.

---

# 7. Definir lifecycle oficial

Eu congelaria:

```text
PENDING
   ↓
PROCESSING
   ├── SENT
   ├── PENDING
   └── DEAD
```

Ou nomenclatura equivalente já existente.

Sem estados demais.

Evitar:

```text
QUEUED
DISPATCHING
SENDING
RETRYING
ERROR
BROKEN
```

se não acrescentarem semântica.

---

# 8. Semântica

### `PENDING`

Evento ainda elegível para entrega.

### `PROCESSING`

Evento reivindicado por um dispatcher.

### `SENT`

Destino confirmou processamento.

### `DEAD`

Falha não recuperável ou limite de tentativas atingido.

---

# 9. Não usar apenas boolean `processed`

Precisamos distinguir:

```text
nunca tentado
em processamento
temporariamente falhou
entregue
não recuperável
```

Logo:

```text
processed = true/false
```

não é suficiente.

---

# 10. Criar migration `0008`

Provavelmente:

```text
0008_outbox_delivery_foundation.sql
```

Somente após verificar numeração real.

Adicionar ao Outbox:

```text
status

attempt_count

available_at

claimed_at
claim_expires_at
claimed_by

sent_at

last_error_code
last_error_at
```

Talvez:

```text
destination
```

se ainda não estiver determinado pelo `event_type`.

---

# 11. Não armazenar stack trace

Outbox não deve armazenar:

```text
full stack
HTTP body
JWT
Cloudflare diagnostic blob
```

Persistir apenas erro sanitizado:

```text
code
occurredAt
attempt
```

Detalhes ficam na observabilidade.

---

# 12. `available_at`

Esse campo é importante.

Permite:

```text
PENDING
+
available_at <= now
```

ser elegível.

Retry então apenas move:

```text
available_at
```

para o futuro.

Sem criar tabela de scheduling separada.

---

# 13. Claim precisa ser atômico

Dois dispatchers não podem entregar o mesmo evento simultaneamente por acidente.

Necessitamos:

```text
claim
```

com CAS/SQL condicional.

Conceitualmente:

```sql
UPDATE outbox_events
SET
  status = 'PROCESSING',
  claimed_by = ?,
  claimed_at = ?,
  claim_expires_at = ?
WHERE id = ?
  AND status = 'PENDING'
  AND available_at <= ?
```

e:

```text
changes = 1
```

define ownership.

---

# 14. Não usar lock em memória

Proibido:

```ts
Map<string, Mutex>
```

A arquitetura já provou que garantias distribuídas devem estar na persistência.

---

# 15. Lease expira

Se dispatcher morrer após claim:

```text
PROCESSING
claimed
```

não pode ficar eternamente travado.

Após:

```text
claim_expires_at < now
```

o evento torna-se recuperável.

Pode existir uma operação:

```text
RecoverExpiredOutboxClaims
```

---

# 16. Não depender de relógio global implícito

Policies devem receber:

```text
now
```

explicitamente.

Isso mantém testes determinísticos.

---

# 17. Criar `OutboxRepository`

A fundação atual talvez tenha apenas `OutboxWriter`.

Agora precisamos leitura/claim.

Via Nest CLI não é necessário se estiver em lib, mas seguir a convenção real.

Contrato conceitual:

```text
append(...)
findDispatchable(...)
claim(...)
markSent(...)
releaseForRetry(...)
markDead(...)
recoverExpiredClaims(...)
```

Não expor SQL.

---

# 18. Separar Writer de Repository se fizer sentido

Podemos preservar:

```text
OutboxWriter
```

para Application writes.

E adicionar:

```text
OutboxDeliveryRepository
```

para dispatcher.

Isso é melhor do que permitir que qualquer use case altere status de entrega.

---

# 19. Criar D1 adapter

Algo como:

```text
D1OutboxDeliveryRepository
```

com:

```text
tenant-aware
CAS-aware
bounded queries
```

---

# 20. `findDispatchable` deve ter limite

Nunca:

```sql
SELECT * FROM outbox_events WHERE status='PENDING'
```

sem limite.

Usar:

```text
LIMIT batchSize
```

por exemplo configurável.

Não inventar lote enorme.

Para Free-first, algo pequeno como configuração:

```text
10
25
50
```

pode ser aceitável, mas o valor deve ser configuração operacional, não regra de domínio.

---

# 21. Ordenação

Usar ordem determinística:

```text
available_at
created_at
id
```

Não assumir FIFO perfeito global.

---

# 22. Não exigir ordering global

O sistema não deve depender de:

```text
evento A sempre antes de evento B
```

entre diferentes aggregates.

Consumidores devem proteger sua própria FSM/idempotência.

---

# 23. Criar `DeliveryPort`

Interface:

```text
deliver(event)
```

Resultado estruturado:

```text
SUCCESS
RETRYABLE_FAILURE
PERMANENT_FAILURE
```

Não boolean.

---

# 24. Criar `DeliveryResult`

Por exemplo:

```text
DELIVERED

RETRYABLE
  errorCode

REJECTED
  errorCode
```

Isso alimenta a RetryPolicy.

---

# 25. Criar `OutboxRetryPolicy`

Policy pura:

```text
attemptCount
errorCategory
now
↓
RETRY / DEAD
```

---

# 26. Backoff

Use backoff determinístico e bounded.

Por exemplo conceitualmente:

```text
attempt 1 → short delay
attempt 2 → larger
...
```

Mas não inventar uma política comercial.

Isso é configuração operacional.

Pode ser parametrizado via Config:

```text
OUTBOX_MAX_ATTEMPTS
OUTBOX_BASE_RETRY_SECONDS
```

com defaults somente se a documentação de infraestrutura autorizar.

---

# 27. Preferir configuração e limites conservadores

Para Free Tier, não fazer retry a cada segundo.

O dispatcher deve evitar request/write amplification.

---

# 28. Classificar falhas

No mínimo:

```text
RETRYABLE
PERMANENT
```

Retryable:

```text
destination unavailable
timeout
internal transient failure
```

Permanent:

```text
invalid contract
unsupported event type
destination says incompatible terminal state
```

Mas um `409` nem sempre é permanent: replay idempotente pode ser sucesso lógico.

A classificação pertence ao adapter/consumer contract.

---

# 29. Delivery para Operations

Primeiro evento físico a suportar:

```text
DepositConfirmed
```

Já existe RPC:

```text
Billing
→ Operations
→ ApplyDepositConfirmed
```

O dispatcher deve usar exatamente esse caminho.

Não criar outro endpoint.

---

# 30. Segundo evento

Se PR-13 implementou:

```text
DepositExpired
```

também entregar.

---

# 31. Não despachar todos os eventos neste PR

Outbox atual também pode conter:

```text
AppointmentCreated
```

e outros.

PR-14 não precisa criar consumidor para tudo.

Suporte somente eventos necessários para provar foundation:

```text
DepositConfirmed
DepositExpired
```

e talvez um evento fixture de teste.

---

# 32. Unknown event type

Não marcar automaticamente como `SENT`.

Resultado:

```text
PERMANENT_FAILURE
```

ou permanecer PENDING com alerta, conforme decisão normativa.

Eu prefiro:

```text
DEAD / UNSUPPORTED_EVENT_TYPE
```

para evitar loop infinito.

---

# 33. Criar dispatcher application service

Algo como:

```text
DispatchOutboxBatch
```

Responsabilidade:

```text
find eligible
↓
claim individually
↓
deliver
↓
markSent / retry / dead
```

---

# 34. Não envolver toda batch em uma transação

Cada evento precisa de claim/delivery/result independente.

Não faça:

```text
transaction
  claim 50
  call RPCs
  mark all
```

Transação não deve permanecer aberta durante RPC.

---

# 35. Fluxo correto por evento

```text
D1 claim commit
      ↓
RPC delivery
      ↓
D1 result commit
```

Pode ocorrer:

```text
RPC success
↓
process crashes before markSent
```

Então o evento será redelivered.

Por isso consumidor **precisa ser idempotente**.

Esse cenário deve ser testado.

---

# 36. Isso é at-least-once

Documentar explicitamente:

```text
Delivery semantics = at-least-once
```

Não vender:

```text
exactly once
```

O sistema consegue efeitos efetivamente únicos pela idempotência do consumidor.

---

# 37. Event ID é chave de idempotência

Cada OutboxEvent já possui:

```text
id
```

Use:

```text
eventId
```

como identidade da entrega downstream.

---

# 38. Operations consumer deve persistir receipt

Hoje `ApplyDepositConfirmed` pode usar IdempotencyService.

Agora formalize:

```text
operation = APPLY_DEPOSIT_CONFIRMED
idempotencyKey = eventId
```

Assim redelivery do mesmo evento:

```text
same effect
```

---

# 39. Não usar `depositId` sozinho como event identity

Um Deposit pode gerar vários fatos:

```text
DepositCreated
DepositConfirmed
```

Logo:

```text
eventId
```

é melhor.

---

# 40. Consumer receipt opcional

Se a Idempotency foundation já resolve receipt, reutilize.

Não criar:

```text
consumed_events
```

paralelo sem necessidade.

---

# 41. Cenário ACK-loss obrigatório

Testar:

```text
Billing dispatcher
  ↓
Operations successfully applies DepositConfirmed
  ↓
simulated failure before Billing markSent
```

Outbox permanece recuperável.

Na próxima execução:

```text
same event delivered
↓
Operations replay
↓
no second transition
↓
Billing markSent
```

Este é um dos testes mais importantes do PR.

---

# 42. Criar reconciler

Dispatcher resolve delivery pendente.

Mas também precisamos detectar inconsistência já materializada.

Exemplo:

```text
Deposit CONFIRMED
Appointment AWAITING_DEPOSIT
```

e talvez evento antigo esteja perdido/marcado incorretamente por bug histórico.

Criar:

```text
ReconcileDepositAppointmentState
```

ou foundation equivalente.

---

# 43. Reconciliation não deve varrer tudo

Nunca:

```text
scan all deposits
scan all appointments
```

em todo ciclo.

Começar por um bounded candidate query.

Por exemplo:

```text
confirmed deposits
not reconciled
limit N
```

Isso pode exigir um marcador local:

```text
appointment_sync_status
```

Mas pense antes de adicionar estado duplicado.

---

# 44. Melhor fonte de candidates

O próprio Outbox é o primeiro reconciler.

Se:

```text
DepositConfirmed event != SENT
```

temos trabalho.

Então PR-14 talvez não precise de uma segunda tabela de reconciliation ainda.

Defina:

```text
reconciliation foundation =
recover and redeliver pending/expired claims
```

Nesse PR.

Uma reconciliação profunda DB↔DB pode ficar posterior.

---

# 45. Criar `RecoverOutbox`

Application service:

```text
PROCESSING + expired lease
→ PENDING
```

com:

```text
attemptCount preserved
availableAt = now
```

ou retry policy.

---

# 46. Dispatcher reentrante

Executar:

```text
DispatchOutboxBatch
```

duas vezes ao mesmo tempo.

Gate:

```text
each event claimed by at most one dispatcher concurrently
```

Mesmo que posteriormente haja redelivery por ACK-loss.

---

# 47. Concorrência de dispatchers

Criar 20/50 eventos.

Rodar:

```text
Dispatcher A
Dispatcher B
Dispatcher C
```

concorrentemente.

Esperado:

```text
all eventually SENT
consumer effects once
no event concurrently claimed twice
```

---

# 48. Testar morte do dispatcher

Simular:

```text
claim event
↓
do not deliver
↓
lease expires
```

Depois:

```text
RecoverExpiredClaims
↓
event PENDING
↓
dispatcher delivers
```

---

# 49. Billing Worker ganha dispatcher?

Cuidado.

Não recomendo acoplar dispatch automático ao `fetch` comum.

Não:

```text
every Billing request
→ dispatch outbox
```

Isso cria latência e comportamento imprevisível.

---

# 50. Criar entrypoint interno executável

Pode existir RPC interno:

```text
dispatchOutboxBatch()
```

para testes/admin.

Mas produção futura usará Cron/Queue.

Neste PR o application service existe e é fisicamente testado.

---

# 51. Cron: incluir ou não?

Você pediu arquitetura Free-first.

Eu manteria Cron **fora da primeira metade do PR** e qualificaria o dispatcher.

Depois, se o plano Cloudflare Free usado pelo projeto suportar o mecanismo planejado dentro do orçamento operacional, podemos adicionar um Cron Trigger como adapter mínimo.

Mas não é obrigatório para provar a foundation.

---

# 52. Minha recomendação de escopo

PR-14:

```text
Outbox delivery engine
+
D1 claims
+
retry
+
Service Binding delivery
+
idempotent consumers
+
recovery
```

Sem scheduler real.

Depois, PR-15 pode ser:

```text
Outbox Scheduler Adapter / operational delivery
```

Porém isso cria outro PR apenas infra.

Se o Cron estiver simples e dentro do plano arquitetural aprovado, pode entrar no final do PR-14 como adapter.

---

# 53. Não usar Queue ainda por padrão

Cloudflare Queue pode ser útil, mas Outbox já é a fila durável da aplicação.

Introduzir:

```text
D1 Outbox
→ Cloudflare Queue
→ Consumer
```

cria duas filas duráveis.

Isso pode fazer sentido mais tarde para escala, mas para Free-first aumenta complexidade e consumo.

Primeiro:

```text
D1 Outbox
→ dispatcher
→ Service Binding
```

é suficiente.

---

# 54. Bounded batch

Config operacional, por exemplo:

```text
OUTBOX_BATCH_SIZE
```

O dispatcher nunca carrega tudo.

---

# 55. Não paralelizar ilimitadamente

Evitar:

```ts
Promise.all(events.map(deliver))
```

para milhares de eventos.

Use concurrency limitada.

Algo como:

```text
OUTBOX_DELIVERY_CONCURRENCY
```

configurável.

---

# 56. Observabilidade

Registrar:

```text
operation=DispatchOutbox

eventId
eventType
tenantId
attempt
destination
result
duration
correlationId
```

Sem payload integral.

---

# 57. Métricas úteis

```text
outbox.pending
outbox.processing
outbox.sent
outbox.dead

outbox.delivery.success
outbox.delivery.retry
outbox.delivery.failure

outbox.claim.recovered
```

Evitar labels de alta cardinalidade como `eventId`.

---

# 58. Não registrar payload

O payload pode possuir IDs sensíveis.

Observabilidade usa metadata allowlisted.

---

# 59. Audit do dispatcher?

Não criar Audit para cada tentativa técnica de delivery.

Audit representa fato de negócio.

Outbox delivery é observabilidade/reliability.

`DepositConfirmed` já foi auditado quando aconteceu.

---

# 60. MarkSent não gera outro Outbox

Evitar recursão:

```text
mark outbox sent
→ create outbox event
→ ...
```

Delivery metadata é infraestrutura.

---

# 61. Migration constraints

Status válido:

```text
PENDING
PROCESSING
SENT
DEAD
```

attempt count:

```text
>= 0
```

Lease fields consistentes quando PROCESSING.

---

# 62. Índice crítico

A consulta principal:

```text
status
available_at
created_at
```

precisa de índice.

Algo conceitual:

```text
(status, available_at, created_at)
```

Verifique o query plan.

---

# 63. Índice de recovery

Se necessário:

```text
(status, claim_expires_at)
```

para PROCESSING expirado.

---

# 64. Teste query plan

No D1/workerd, quando disponível:

```sql
EXPLAIN QUERY PLAN
```

para:

```text
findDispatchable
findExpiredClaims
```

Evitar table scans frequentes.

---

# 65. Multi-tenant

Dispatcher pode buscar eventos de vários tenants.

Isso é aceitável como worker interno de sistema.

Mas cada event carrega seu:

```text
tenantId
```

e consumer continua validando tenant.

Nunca confiar apenas no dispatcher.

---

# 66. Tenant no destination contract

`DepositConfirmed` request:

```text
tenantId
appointmentId
depositId
eventId
correlationId
```

Operations resolve Appointment com:

```text
tenant + appointment
```

---

# 67. Não aceitar mismatch

Se payload diz:

```text
tenant A
appointment B
```

Operations rejeita.

Dispatcher classifica corretamente.

Não ficar tentando infinitamente um erro permanente de contrato.

---

# 68. `ApplyDepositConfirmed` idempotency

Provar fisicamente:

Primeiro event:

```text
AWAITING_DEPOSIT
→ AWAITING_CONFIRMATION
```

Redelivery:

```text
AWAITING_CONFIRMATION
→ same logical result
```

Sem segunda transição.

---

# 69. `ApplyDepositExpired`

Mesma lógica:

```text
AWAITING_DEPOSIT
→ EXPIRED
```

redelivery:

```text
EXPIRED
→ replay
```

---

# 70. Confirmado vs expirado concorrente

PR-13 já protege Deposit.

Agora testar delivery concorrente de eventos incompatíveis, se historicamente possível.

Operations FSM deve impedir estado impossível.

---

# 71. Event ordering não confiável

Imagine:

```text
DepositExpired
DepositConfirmed
```

chegam fora de ordem por algum bug/corrida.

Consumer usa FSM, não ordem de entrega presumida.

Não force a projeção para o último evento recebido.

---

# 72. Permanent incompatibility

Se Appointment já está:

```text
CANCELED
```

e recebe DepositConfirmed:

```text
do not mutate
```

Classificar:

```text
handled business rejection
```

A decisão se evento deve virar SENT ou DEAD precisa ser explícita.

---

# 73. Diferenciar delivery failure de business no-op

Um consumer pode responder:

```text
APPLIED
REPLAY
IGNORED_TERMINAL
REJECTED_INVALID
```

Isso é melhor do que:

```text
200/500
```

como único significado.

---

# 74. Contract downstream

Criar contrato compartilhado:

```text
ApplyDepositTransitionResult
```

com resultados estáveis.

Por exemplo:

```text
APPLIED
REPLAYED
TERMINAL_NOOP
REJECTED
```

Somente estados realmente necessários.

---

# 75. Mapping dispatcher

```text
APPLIED
REPLAYED
TERMINAL_NOOP (quando normativo)
→ SENT

temporary error
→ RETRY

invalid contract
→ DEAD
```

---

# 76. Reconciliation de propagation failure do PR-13

Cenário obrigatório:

```text
Deposit CONFIRMED
Appointment AWAITING_DEPOSIT
Outbox DepositConfirmed PENDING
```

Rodar dispatcher.

Esperado:

```text
Appointment AWAITING_CONFIRMATION
Outbox SENT
```

Esse é o proof principal.

---

# 77. Expiration reconciliation

```text
Deposit EXPIRED
Appointment AWAITING_DEPOSIT
Outbox DepositExpired PENDING
```

Após dispatcher:

```text
Appointment EXPIRED
Outbox SENT
```

se essa transição foi implementada no PR-13.

---

# 78. Outbox retry physical test

Destination lança erro transitório.

Primeira execução:

```text
attempt=1
status=PENDING
availableAt > now
```

Depois avançar relógio/test clock.

Segunda:

```text
delivery success
status=SENT
```

---

# 79. Max attempts

Depois de N falhas:

```text
DEAD
```

Não retry infinito.

O limite é configuração operacional.

---

# 80. Dead event é preservado

Nunca DELETE.

Auditoria/reliability precisa permitir diagnóstico.

---

# 81. Re-drive

Não precisa expor interface pública, mas talvez criar Application UseCase:

```text
RequeueDeadOutboxEvent
```

somente se necessário.

Eu deixaria fora do PR-14 para manter escopo.

---

# 82. No delete automático

Não implementar cleanup histórico neste PR.

Retention será outra decisão.

---

# 83. Worker tests

Criar arquivos como:

```text
test/workers/outbox-delivery.spec.ts
test/workers/outbox-recovery.spec.ts
test/workers/outbox-concurrency.spec.ts
```

---

# 84. Unit tests

Cobrir:

```text
OutboxRetryPolicy
claim eligibility
lease expiration
delivery result mapping
attempt limits
```

sem workerd.

---

# 85. D1 tests

Cobrir:

```text
claim CAS
markSent
retry
dead
expired claim recovery
```

com D1 real.

---

# 86. RPC tests

Billing Outbox:

```text
DepositConfirmed
↓
Operations
```

usando Service Binding real.

---

# 87. ACK-loss test

Muito importante:

```text
Operations applies event
↓
Billing does not mark SENT
↓
lease recovered
↓
redelivery
↓
Operations REPLAY
↓
SENT
```

---

# 88. Dispatcher concurrency proof

Por exemplo:

```text
events = 50
dispatchers = 3
```

Resultado:

```text
sent = 50
dead = 0
duplicate business effects = 0
```

---

# 89. Retry proof

Por exemplo:

```text
event X fails first delivery
succeeds second
```

Resultado:

```text
attemptCount = 2
status = SENT
```

---

# 90. Permanent failure proof

Invalid event contract.

Resultado:

```text
status = DEAD
```

sem retry infinito.

---

# 91. Lease recovery proof

```text
status PROCESSING
claim expired
```

Recovery:

```text
eligible again
```

---

# 92. Gate PR-13 continua obrigatório

Após mudanças em reliability:

```bash
npm run gate:pr13
```

continua PASS.

Outbox delivery não pode quebrar Deposit lifecycle.

---

# 93. Novo gate

Criar:

```bash
npm run gate:pr14
```

Executando:

```text
lint
typecheck
unit
workers
gate:physical-safety
gate:pr12
gate:pr13
outbox delivery proofs
dry-runs
```

---

# 94. Dry-runs

Operations:

```text
PASS
```

Billing:

```text
PASS
```

Clinical:

```text
PASS
```

Se adicionar binding/config ao Billing, regenerar types.

---

# 95. Health continua independente

Mesmo que Billing tenha dispatcher:

```http
GET /health
```

não:

```text
dispatch outbox
query outbox
call Operations
```

Zero efeitos.

---

# 96. Cloudflare Free — decisão de execução

Neste PR documentar duas modalidades:

```text
A. manual/test invocation
B. future scheduled invocation
```

Não precisamos ainda introduzir infra paga ou de maior consumo.

---

# 97. Se adicionar Cron adapter

Se optar por incluí-lo, ele deve apenas:

```text
scheduled()
↓
DispatchOutboxBatch
```

Nada de lógica no handler.

---

# 98. Cron não deve processar ilimitadamente

Uma invocation:

```text
bounded batch
```

Se backlog existir:

```text
next invocation continues
```

---

# 99. Não processar até esvaziar

Proibido:

```text
while(events.length > 0) {
   process forever
}
```

Isso pode estourar CPU/limits.

---

# 100. Queue fica fora

Minha recomendação:

```text
PR-14 = D1 Outbox dispatcher
```

Sem Cloudflare Queues ainda.

Primeiro provar que o modelo mais barato atende o MVP.

---

# 101. Criar documentação operacional

Adicionar:

```text
docs/reliability/outbox-delivery.md
```

Com:

```text
status lifecycle
claim algorithm
lease
retry
at-least-once
consumer idempotency
ACK-loss
recovery
dead events
batch limits
```

---

# 102. Atualizar `outbox.md`

O documento do PR-07 dizia apenas:

```text
events start PENDING
no consumer
```

Agora atualizar:

```text
delivery implemented
consumer semantics
```

---

# 103. Atualizar workers topology

Mostrar:

```text
Billing
  Deposit
  Outbox Dispatcher
      ↓
Operations RPC
```

Sem Queue se não implementada.

---

# 104. Architecture tests

Proibir:

```text
Outbox domain
→ Cloudflare RPC
```

O dispatcher Application conhece:

```text
DeliveryPort
```

Adapter conhece Service Binding.

---

# 105. Operations não conhece Billing D1

Continua valendo.

---

# 106. Billing dispatcher não conhece AppointmentRepository

Continua:

```text
Billing
→ Operations contract
```

---

# 107. Definition of Done — Outbox lifecycle

```text
[ ] PENDING
[ ] PROCESSING
[ ] SENT
[ ] DEAD

[ ] transitions explicit
[ ] terminal SENT protected
[ ] DEAD preserved
```

---

# 108. Definition of Done — claim

```text
[ ] atomic CAS claim

[ ] claimedBy
[ ] claimedAt
[ ] claimExpiresAt

[ ] only eligible event can be claimed

[ ] two dispatchers cannot simultaneously own same claim
```

---

# 109. Definition of Done — lease/recovery

```text
[ ] abandoned PROCESSING claim recoverable

[ ] not recoverable before expiry

[ ] expired claim returns to delivery pipeline

[ ] attempt metadata preserved
```

---

# 110. Definition of Done — retry

```text
[ ] retryable failure recognized

[ ] availableAt moved forward

[ ] attemptCount increments

[ ] max attempts enforced

[ ] permanent failure becomes DEAD
```

---

# 111. Definition of Done — delivery

```text
[ ] DeliveryPort introduced

[ ] Billing→Operations Service Binding adapter

[ ] DepositConfirmed delivered

[ ] DepositExpired delivered when applicable

[ ] no public HTTP

[ ] no distributed transaction
```

---

# 112. Definition of Done — consumer idempotency

```text
[ ] eventId used as delivery identity

[ ] first delivery applies once

[ ] redelivery replays safely

[ ] duplicate business mutation = 0

[ ] duplicate Audit business effect = 0

[ ] incompatible tenant blocked
```

---

# 113. Definition of Done — ACK loss

```text
[ ] downstream success simulated

[ ] upstream markSent loss simulated

[ ] event redelivered

[ ] consumer replayed

[ ] event eventually SENT

[ ] one business effect
```

---

# 114. Definition of Done — eventual consistency

```text
[ ] Deposit CONFIRMED can coexist temporarily with Appointment AWAITING_DEPOSIT

[ ] pending outbox event represents convergence work

[ ] dispatcher converges Appointment

[ ] no rollback of confirmed Deposit

[ ] failure remains recoverable
```

---

# 115. Definition of Done — concurrency

```text
[ ] multiple dispatchers tested

[ ] no simultaneous claim duplication

[ ] eventual delivery for all events

[ ] business effects exactly once logically

[ ] at-least-once transport documented
```

---

# 116. Definition of Done — D1

```text
[ ] migration 0008

[ ] indexes for dispatch query

[ ] index for expired claims

[ ] D1 claim tests PASS

[ ] retry tests PASS

[ ] recovery tests PASS
```

---

# 117. Definition of Done — observability

```text
[ ] delivery success observable

[ ] retry observable

[ ] dead event observable

[ ] lease recovery observable

[ ] event type recorded

[ ] tenant recorded

[ ] correlation propagated

[ ] no full payload logging
```

---

# 118. Definition of Done — regression

```text
[ ] CreateAppointment PASS

[ ] PR-13 Deposit lifecycle PASS

[ ] ConfirmDeposit PASS

[ ] ExpireDeposit PASS

[ ] Appointment transition RPC PASS

[ ] Clinical unaffected

[ ] Scheduling unaffected
```

---

# 119. Definition of Done — quality

```text
[ ] npm run lint PASS

[ ] tsc --build --force PASS

[ ] npm run test PASS

[ ] npm run test:workers PASS

[ ] gate:physical-safety PASS

[ ] gate:pr12 PASS

[ ] gate:pr13 PASS

[ ] gate:pr14 PASS

[ ] Operations dry-run PASS

[ ] Billing dry-run PASS

[ ] Clinical dry-run PASS

[ ] git diff --check PASS
```

---

# 120. O que NÃO deve entrar no PR-14

Ainda fora:

```text
Payment
PIX
Card gateway
Refund
Credit

Session
Check-in
Presence

WhatsApp
Email

R2
KV

generic workflow engine

distributed transactions

exactly-once delivery claims

unbounded polling
```

Eu também manteria **Cloudflare Queue fora**, salvo se durante a implementação ficar comprovado que D1 + bounded dispatcher não atende tecnicamente o runtime.

---

# 121. Relatório final obrigatório

O Codex deve fechar com:

```text
PR-14 — Outbox Delivery + Cross-Worker Reconciliation Foundation

Baseline
PR13:

Outbox Model
statuses:
migration:
indexes:

Claim
CAS:
lease:
concurrency:

Dispatcher
batch:
delivery:
destination:

Retry
policy:
attempts:
backoff:
dead:

Recovery
expired claims:
result:

DepositConfirmed
delivery:
Operations result:
Appointment result:

DepositExpired
delivery:
Appointment result:

Idempotency
event identity:
replay:
duplicate effects:

ACK Loss
first delivery:
markSent failure:
redelivery:
final state:

Concurrency
events:
dispatchers:
delivered:
duplicates:
dead:

Eventual Consistency
upstream fact:
downstream projection:
recovery:

Observability
success:
retry:
dead:
PII review:

Cloudflare Free
batch size:
scheduled strategy:
Queue used: NO/YES + justification

Regression
physical safety:
PR12:
PR13:

Quality
lint:
typecheck:
unit:
workers:
dry-runs:
PR14 gate:

Remaining blockers:

Next PR:
```

---

# Próximo PR após PR-14

Depois do PR-14, eu seguiria para:

> **PR-15 — Appointment Confirmation + Presence/Check-in Foundation**

Porque teremos então:

```text
Appointment created
        ↓
Deposit lifecycle
        ↓
Cross-worker synchronization robusta
        ↓
Appointment AWAITING_CONFIRMATION
```

e o próximo gap funcional natural será:

```text
AWAITING_CONFIRMATION
        ↓
CONFIRMED
        ↓
CHECKED_IN / IN_SERVICE
```

sem ainda começar o módulo técnico completo de sessões.

O roadmap fica:

```text
PR-12
CreateAppointment
     ↓
PR-13
Deposit Lifecycle
     ↓
PR-14
Outbox Delivery
+ Retry
+ Reconciliation
     ↓
PR-15
Confirmation / Presence / Check-in
     ↓
PR-16
Session Lifecycle
     ↓
PR-17
Payment / Receivables
```

O ponto central do PR-14 é este: **agora que o PR-13 introduziu corretamente consistência eventual entre Workers, o sistema precisa garantir convergência real. O Outbox já existe desde o PR-07; o PR-14 deve finalmente transformar esse registro `PENDING` em um protocolo de entrega at-least-once, com claim por CAS, lease, retry, consumidores idempotentes e recuperação de ACK-loss — sem fingir transação distribuída e sem introduzir Queue antes de ser necessária.**
