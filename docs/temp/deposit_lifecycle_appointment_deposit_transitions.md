Com o **PR-12 concluído e `gate:pr12 = PASS`**, o próximo PR deve realmente ser:

# PR-13 — Deposit Lifecycle + Appointment Deposit Transitions

O objetivo agora é materializar o depósito como domínio financeiro próprio e permitir que um Appointment criado em:

```text
AWAITING_DEPOSIT
```

avance de forma segura para:

```text
AWAITING_CONFIRMATION
```

quando o depósito for confirmado, ou siga para estados coerentes em caso de expiração/cancelamento.

O PR-13 **não deve implementar Payment completo**. Ele deve implementar o ciclo de vida do depósito e a coordenação com Appointment.

---

## 1. Objetivo do PR

Sair de:

```text
CreateAppointment
      ↓
CommercialTerms
      ↓
depositRequired = true
      ↓
Appointment
AWAITING_DEPOSIT
      ↓
      X
sem lifecycle financeiro
```

para:

```text
CreateAppointment
      ↓
Appointment
AWAITING_DEPOSIT
      ↓
Deposit
PENDING
      │
      ├── confirm
      │      ↓
      │   CONFIRMED
      │      ↓
      │ Appointment
      │ AWAITING_CONFIRMATION
      │
      ├── expire
      │      ↓
      │   EXPIRED
      │      ↓
      │ Appointment
      │   EXPIRED
      │
      └── cancel
             ↓
          CANCELED
```

Mas as transições exatas devem respeitar os estados canônicos já documentados no projeto.

---

# 2. Baseline obrigatório

Antes de alterar código:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:physical-safety
npm run gate:create-appointment
npm run gate:pr12
```

Todos devem retornar:

```text
PASS
```

Também:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers
```

O PR-13 não pode começar quebrando a fundação já qualificada.

---

# 3. Criar plano formal

Criar:

```text
docs/plans/PR-13-deposit-lifecycle.md
```

Com:

```text
Objective
Current state
Deposit ownership
Deposit statuses
Appointment coordination
Commands
Idempotency
Atomicity
Audit
Outbox
Expiration
Cloudflare execution model
Tests
Definition of Done
Out of scope
```

---

# 4. Confirmar ownership

O depósito pertence ao:

```text
billing-worker
```

e não ao `operations-worker`.

A fronteira deve permanecer:

```text
Operations
  owns Appointment

Billing
  owns Deposit
```

Operations apenas reage a fatos financeiros autorizados.

Não criar `Deposit` dentro de:

```text
apps/operations-worker
```

---

# 5. Não confundir Deposit com Payment

Preservar:

```text
Deposit
≠
Payment
```

Deposit representa a obrigação/condição de sinal.

Payment futuramente representa liquidação financeira.

Neste PR entram:

```text
Deposit lifecycle
Deposit amount
Deposit status
expiration
confirmation contract
```

Não entram:

```text
PIX transaction
card transaction
cash ledger
gateway
refund
settlement
```

---

# 6. Inspecionar o domínio já criado no PR-10

Antes de criar qualquer classe:

```bash
find apps/billing-worker/src/deposits \
  -maxdepth 6 \
  -type f | sort
```

Revisar:

```text
deposit.ts
deposit-policy.ts
deposit-state-machine.ts
```

se existirem.

PR-13 deve **evoluir** o que já existe, não recriar Deposit.

---

# 7. Congelar estados canônicos

Usar somente os estados previstos pela documentação vigente.

Provável conjunto:

```text
PENDING
CONFIRMED
EXPIRED
CANCELED
```

Se o domínio atual usar nomenclatura diferente, preservar a nomenclatura congelada.

Não adicionar agora:

```text
PAID
PROCESSING
REFUNDED
FAILED
CHARGEBACK
```

Esses pertencem ao futuro Payment.

---

# 8. Criar/qualificar `DepositStateMachine`

A FSM deve continuar pura:

```text
no NestJS
no D1
no RPC
no Cloudflare
```

Transições mínimas:

```text
PENDING
   ├── confirm → CONFIRMED
   ├── expire  → EXPIRED
   └── cancel  → CANCELED
```

Estados terminais não podem aceitar transições arbitrárias.

---

# 9. Testes da FSM

Obrigatórios:

```text
PENDING → CONFIRMED
PASS

PENDING → EXPIRED
PASS

PENDING → CANCELED
PASS
```

E:

```text
CONFIRMED → EXPIRED
REJECT

EXPIRED → CONFIRMED
REJECT

CANCELED → CONFIRMED
REJECT
```

salvo alguma regra canônica específica em sentido contrário.

---

# 10. Criar persistência real de Deposit

Agora há estado normativo, então PR-13 deve provavelmente criar migration.

Algo como:

```text
0007_deposit_lifecycle.sql
```

Ajustar número somente após inspecionar migrations reais.

---

# 11. Schema conceitual

Tabela:

```text
deposits
```

Com pelo menos:

```text
id
tenant_id
appointment_id

amount_cents
status

expires_at
confirmed_at
canceled_at

created_at
updated_at
```

Se existir snapshot/configuração comercial necessária:

```text
mode
configured_value
```

pode ser preservada, desde que não duplique desnecessariamente o snapshot já congelado no Appointment.

---

# 12. Appointment ID precisa ser tenant-safe

Deposit deve obedecer:

```text
tenant A
deposit A
appointment A
```

Nunca:

```text
Deposit tenant A
→ Appointment tenant B
```

Como os Workers possuem bounded contexts separados, essa garantia não deve depender apenas de FK física inexistente entre bancos/contextos.

Application deve validar ownership.

---

# 13. Um Deposit por Appointment

Se a regra atual é um único sinal por Appointment, criar proteção lógica/física:

```text
tenant_id + appointment_id
```

único.

Não permitir:

```text
Appointment X
→ Deposit A
→ Deposit B
```

para o mesmo sinal.

Se o produto futuro puder parcelar sinal, isso será outra modelagem.

---

# 14. Criar `DepositRepository`

Via Nest CLI:

```bash
nest g interface \
  deposits/ports/deposit-repository \
  --project billing-worker
```

Contrato orientado ao domínio:

```text
findById(...)
findByAppointment(...)
save(...)
```

Evitar CRUD genérico.

---

# 15. Criar adapter D1

```bash
nest g provider \
  deposits/adapters/d1-deposit-repository \
  --project billing-worker
```

O adapter é tenant-aware.

Domain/Application não conhecem `D1Database`.

---

# 16. Quando criar o Deposit?

O PR-12 cria Appointment com:

```text
AWAITING_DEPOSIT
```

mas ainda não materializa Deposit real.

O PR-13 precisa decidir uma única autoridade.

Recomendação:

```text
CreateAppointment succeeds
        ↓
Outbox AppointmentCreated
        ↓
future process?
```

Mas como ainda não temos consumer, não queremos depender de processamento assíncrono inexistente.

Portanto, neste PR, a coordenação pode ser explícita:

```text
CreateDepositForAppointment
```

chamada quando necessário pelo fluxo financeiro.

Não reabrir PR-12 para fazer duas transações distribuídas pseudo-atômicas entre Operations e Billing.

---

# 17. Não tentar transação distribuída

Proibido criar algo como:

```text
Operations D1 transaction
    ↓
Billing RPC
    ↓
Billing D1 transaction
```

e chamar isso de atômico.

D1 de Workers distintos não oferece transação distribuída.

---

# 18. Trabalhar com idempotência + state machine

A consistência entre:

```text
Appointment
```

e:

```text
Deposit
```

deve ser coordenada por:

```text
idempotent commands
immutable facts
state transitions
```

não por transação distribuída.

---

# 19. Criar `CreateDepositForAppointment`

Via CLI:

```bash
nest g service \
  deposits/application/create-deposit-for-appointment \
  --project billing-worker
```

Input conceitual:

```text
tenantId
appointmentId
amountCents
commercial snapshot/reference
expiresAt?
correlationId
```

Mas os valores devem vir do snapshot autoritativo já produzido por CommercialTerms/Appointment.

---

# 20. Billing não recalcula o sinal

Muito importante.

PR-13 não deve:

```text
buscar Service atual
recalcular discount
recalcular final price
recalcular deposit
```

O Appointment já congelou:

```text
depositRequired
depositCents
```

no PR-12.

Deposit deve nascer a partir desse snapshot.

---

# 21. Portanto Operations precisa fornecer snapshot

Ao solicitar criação do Deposit:

```text
appointmentId
depositCents
```

mais metadados mínimos.

Billing deve validar:

```text
amount >= 0
```

e criar Deposit.

Não recalcular policy.

---

# 22. Idempotência da criação

`CreateDepositForAppointment` deve ser idempotente.

Se:

```text
same tenant
same appointment
```

já possui Deposit:

```text
return existing Deposit
```

quando semanticamente equivalente.

Não criar duplicado.

---

# 23. Criar RPC interno no Billing

Adicionar ao `Billing WorkerEntrypoint`:

```text
createDepositForAppointment(...)
```

ou nomenclatura equivalente.

Não precisa ser endpoint HTTP público.

---

# 24. Criar contrato compartilhado

Em `libs/contracts`:

```text
deposit/
```

Contratos:

```text
CreateDepositRequest
CreateDepositResponse

ConfirmDepositRequest
ConfirmDepositResponse

ExpireDepositRequest
ExpireDepositResponse
```

Não compartilhar entidade `Deposit`.

---

# 25. Criar `ConfirmDeposit`

Via CLI:

```bash
nest g service \
  deposits/application/confirm-deposit \
  --project billing-worker
```

Responsabilidade:

```text
load Deposit
↓
validate tenant
↓
FSM confirm
↓
persist
↓
Audit
↓
Outbox
```

---

# 26. ConfirmDeposit não é Payment

O comando significa:

```text
depósito confirmado por uma autoridade
```

Mas neste PR ainda é necessário definir **quem pode chamar isso**.

Pode ser:

```text
manual/internal confirmation
```

para preparar o lifecycle.

Não implementar ainda:

```text
PIX webhook
card gateway
```

---

# 27. ConfirmDeposit precisa ser idempotente

Primeira chamada:

```text
PENDING → CONFIRMED
```

Segunda chamada equivalente:

```text
CONFIRMED
→ same logical result
```

Não produzir:

```text
duplicate audit
duplicate outbox
duplicate Appointment transition
```

---

# 28. Criar `ExpireDeposit`

Via CLI:

```bash
nest g service \
  deposits/application/expire-deposit \
  --project billing-worker
```

Mas atenção:

```text
ExpireDeposit
```

não significa criar Cron agora.

O Application UseCase pode existir.

O scheduler/cron fica para PR posterior.

---

# 29. Sem Cron neste PR

A expiração será testável por chamada explícita.

Depois:

```text
Cron/Queue
→ ExpireDeposit
```

pode ser plugado.

Não misturar lifecycle e scheduler.

---

# 30. Criar `CancelDeposit`

Se existir transição normativa:

```bash
nest g service \
  deposits/application/cancel-deposit \
  --project billing-worker
```

Usado, por exemplo, quando o Appointment é cancelado antes do pagamento.

Mas apenas se essa regra estiver definida no contrato atual.

---

# 31. Reliability no Billing

Agora Billing finalmente terá mutações persistentes.

Logo deve reutilizar PR-07:

```text
UnitOfWork
Idempotency
Audit
Outbox
```

Não criar versões próprias.

---

# 32. Migration Reliability já é compartilhada?

Inspecionar se Billing usa o mesmo D1 logical database ou binding próprio.

Se for banco separado por Worker, será necessário aplicar as tabelas reliability no database do Billing.

Não assumir que porque migration existe no repositório ela está disponível no D1 do Billing.

---

# 33. Preferência Free-first

Se os Workers compartilham o mesmo D1 no MVP:

```text
logical ownership
≠
physical database necessarily separate
```

isso é aceitável para Free-first, desde que:

```text
Billing repositories
```

não acessem tabelas Operations indiscriminadamente.

---

# 34. Audit events

No Billing:

```text
deposit.created
deposit.confirmed
deposit.expired
deposit.canceled
```

ou convenção oficial equivalente.

Payload seguro:

```text
tenantId
depositId
appointmentId
amountCents
status
actorId?
correlationId
```

---

# 35. Não colocar dados de Customer

Não precisa:

```text
customer name
email
phone
document
```

no evento.

Appointment ID é suficiente para correlação.

---

# 36. Outbox events

Criar fatos:

```text
DepositCreated
DepositConfirmed
DepositExpired
DepositCanceled
```

conforme transições implementadas.

Status:

```text
PENDING
```

Sem consumer.

---

# 37. Coordination com Operations

Aqui está o núcleo do PR.

Quando:

```text
DepositConfirmed
```

Operations precisa transicionar Appointment:

```text
AWAITING_DEPOSIT
        ↓
AWAITING_CONFIRMATION
```

A pergunta é como fazer isso sem Queue/consumer.

---

# 38. Não usar D1 cross-worker diretamente

Billing não deve fazer:

```sql
UPDATE appointments ...
```

mesmo que fisicamente tenha acesso ao mesmo D1.

Isso violaria ownership.

---

# 39. Criar Application Port no Billing ou coordenador externo

A direção recomendada:

```text
Billing
   ↓
AppointmentDepositTransitionPort
   ↓
Operations Service Binding
```

ou, preferencialmente, o caller/orquestrador executa os dois comandos.

Mas existe risco de inconsistência entre dois Workers.

---

# 40. Melhor arquitetura para este PR

Use **evento/outbox como modelo autoritativo**, mas faça uma integração síncrona temporária e idempotente para fechar o fluxo.

Fluxo:

```text
ConfirmDeposit
   ↓
Billing commits DepositConfirmed + Outbox
   ↓
RPC Operations:
applyDepositConfirmed
   ↓
Appointment FSM
   ↓
AWAITING_CONFIRMATION
```

Se RPC Operations falhar:

```text
Deposit remains CONFIRMED
Outbox remains PENDING
```

O estado não é perdido.

Um consumer futuro poderá reconciliar.

Isso é muito melhor que tentar rollback distribuído.

---

# 41. Isso introduz eventual consistency explícita

O contrato passa a ser:

```text
Billing financial fact
        ↓
authoritative

Operations projection/state
        ↓
eventually synchronized
```

Documentar em ADR ou no plano do PR.

---

# 42. Criar RPC interno Operations

Operations deve expor algo equivalente:

```text
applyDepositConfirmed(...)
```

via `WorkerEntrypoint` ou entrypoint RPC compatível.

Ele recebe:

```text
tenantId
appointmentId
depositId
correlationId
eventId/idempotencyKey
```

---

# 43. Não passar `amountCents` como autoridade para transição

Operations já possui snapshot de depósito no Appointment.

O evento pode conter amount para consistência/verificação, mas Appointment não deve recalcular seu snapshot.

---

# 44. Criar `ApplyDepositConfirmed`

No Operations:

```bash
nest g service \
  appointments/application/apply-deposit-confirmed \
  --project operations-worker
```

Responsabilidade:

```text
load Appointment tenant-aware
↓
validate current status
↓
AppointmentStateMachine
↓
AWAITING_CONFIRMATION
↓
persist
↓
Audit
↓
Outbox
↓
idempotency
```

---

# 45. Idempotência do evento

A mesma confirmação pode chegar:

```text
1 vez
2 vezes
10 vezes
```

Resultado:

```text
Appointment transition once
```

Isso é obrigatório para eventual consistency.

---

# 46. DepositConfirmed em Appointment já confirmado

Se Appointment já está:

```text
AWAITING_CONFIRMATION
```

por processamento anterior, replay deve ser idempotente.

Não retornar erro fatal desnecessário.

---

# 47. Appointment em estado incompatível

Por exemplo:

```text
CANCELED
```

recebe `DepositConfirmed`.

Não transicionar automaticamente.

Resultado deve ser:

```text
BLOCKED / reconciliation required
```

conforme política.

Isso vira observabilidade/outbox pendente para investigação/reconciliação futura.

---

# 48. Expiração também precisa coordenar Appointment

Quando Deposit passa:

```text
PENDING → EXPIRED
```

o Appointment em:

```text
AWAITING_DEPOSIT
```

provavelmente deve ir:

```text
EXPIRED
```

conforme FSM já existente.

Se esse comportamento já está canônico, implementar:

```text
applyDepositExpired
```

no Operations.

---

# 49. Não expirar Appointment confirmado

Se Deposit expirado chega para Appointment que já avançou:

```text
AWAITING_CONFIRMATION
```

não retroceder silenciosamente.

Idempotência + FSM devem rejeitar evento incompatível.

---

# 50. CancelDeposit

Se implementado, decidir se:

```text
DepositCanceled
```

cancela Appointment ou apenas sinal.

Não inferir.

Se o contrato não definir:

```text
não coordenar Appointment neste PR
```

---

# 51. Criar adapter Billing → Operations

No Billing:

```text
AppointmentDepositTransitionPort
```

com adapter:

```text
OperationsServiceBindingAppointmentTransitionAdapter
```

---

# 52. Configuração Service Binding inversa

Hoje Operations já possui:

```text
BILLING_SERVICE
CLINICAL_SERVICE
```

Agora Billing precisará, se usarmos coordenação síncrona:

```text
OPERATIONS_SERVICE
```

Binding:

```text
billing-worker
→ operations-worker
```

---

# 53. Cuidado com ciclo de Service Bindings

Teremos:

```text
Operations → Billing
Billing → Operations
```

Isso é tecnicamente possível, mas aumenta acoplamento.

Documentar que a direção Billing→Operations é apenas para **propagação imediata de fato**, enquanto Outbox permanece fonte de reconciliação.

---

# 54. Evitar recursão

Operations, ao processar:

```text
applyDepositConfirmed
```

não deve chamar Billing novamente.

Fluxo termina ali.

---

# 55. Alternative mais limpa

Se quiser evitar binding circular no MVP, o próprio BFF/caller poderia orquestrar:

```text
ConfirmDeposit Billing
↓
ApplyDepositConfirmed Operations
```

Mas isso colocaria regra de negócio no BFF.

Não recomendo.

Melhor manter coordenação backend.

---

# 56. Endpoint público de ConfirmDeposit?

Não necessariamente.

PR-13 pode primeiro expor via RPC/integration harness.

Mas para tornar o fluxo utilizável pela Recepção, pode existir:

```http
POST /tenants/:tenantId/deposits/:depositId/confirm
```

no Billing Worker ou via BFF futuro.

---

# 57. Minha recomendação

Neste PR, exponha **apenas se houver autoridade/permissão claramente definida**.

Caso contrário:

```text
UseCase + RPC + Worker tests
```

são suficientes.

O endpoint público pode vir quando Payment/manual financial operations forem implementados.

---

# 58. Se expor endpoint

Deve seguir o mesmo pipeline:

```text
Authentication
Tenant
Permission
Validation
Idempotency-Key
ConfirmDeposit
```

Permissão específica, por exemplo:

```text
deposit.confirm
```

somente se ela já estiver normatizada.

Não inventar role bypass.

---

# 59. Expiração não deve ser pública

`ExpireDeposit` é comando interno/scheduler-oriented.

Não criar:

```http
POST /deposits/:id/expire
```

para usuários normais.

Pode ser test harness/RPC interno.

---

# 60. Criar Deposit quando Appointment nasce?

Há uma decisão importante.

Hoje PR-12 cria:

```text
AWAITING_DEPOSIT
```

sem Deposit row.

Depois do PR-13, precisamos garantir que todo Appointment que requer depósito possua exatamente um Deposit.

---

# 61. Não alterar atomicidade do PR-12 entre Workers

Não coloque:

```text
Billing.createDeposit()
```

dentro do UnitOfWork Operations.

Não seria atômico.

---

# 62. Solução recomendada

Após o `CreateAppointment` commit:

```text
AppointmentCreated Outbox
```

já existe.

No futuro, consumer criará Deposit.

Mas consumer está fora do PR.

Para o MVP, podemos executar uma **post-commit best-effort RPC idempotente**:

```text
Appointment committed
        ↓
if deposit required
        ↓
Billing.createDepositForAppointment()
```

Se falhar:

```text
Appointment continua AWAITING_DEPOSIT
Outbox AppointmentCreated continua disponível
```

e reconciliação posterior poderá criar Deposit.

---

# 63. Porém isso exige cuidado na API

Não devolver:

```text
201
Deposit created
```

como garantia se a criação de Deposit falhou pós-commit.

PR-13 pode manter Deposit creation como processo separado até implementar reconciliation.

---

# 64. Melhor fatiamento

Para manter PR pequeno:

### PR-13 implementa

```text
Deposit domain/persistence/lifecycle
CreateDepositForAppointment
ConfirmDeposit
ExpireDeposit

Deposit → Appointment transition RPC
```

### PR-14 implementa

```text
Outbox Consumer + reconciliation
AppointmentCreated → create Deposit
DepositConfirmed → apply Appointment transition
DepositExpired → apply Appointment transition
```

Essa separação é mais segura.

---

# 65. Então não alterar CreateAppointment neste PR

Preservar PR-12.

Os testes do PR-13 criam Appointment fixture em:

```text
AWAITING_DEPOSIT
```

e então executam:

```text
CreateDepositForAppointment
```

separadamente.

---

# 66. Teste `CreateDepositForAppointment`

Fixture:

```text
Appointment
tenant A
status AWAITING_DEPOSIT
depositRequired=true
depositCents=3600
```

Billing recebe snapshot.

Resultado:

```text
Deposit
amount=3600
status=PENDING
```

---

# 67. Teste Appointment sem depósito

Se:

```text
depositRequired=false
```

não deve criar Deposit.

Se comando for chamado indevidamente:

```text
BLOCKED
```

ou no-op conforme contrato.

---

# 68. Teste duplicate create

Duas chamadas concorrentes para mesmo Appointment.

Esperado:

```text
deposit rows = 1
same logical Deposit
```

Unique constraint + idempotência.

---

# 69. Teste tenant isolation

Tenant A não cria/confirma Deposit de Appointment B.

---

# 70. Teste ConfirmDeposit físico

Fluxo:

```text
Deposit PENDING
↓
ConfirmDeposit
↓
CONFIRMED
```

D1:

```text
deposit.status=CONFIRMED
confirmed_at != null
```

---

# 71. Teste Appointment transition físico

Depois:

```text
Billing
→ OPERATIONS_SERVICE
→ applyDepositConfirmed
```

Appointment:

```text
AWAITING_DEPOSIT
→ AWAITING_CONFIRMATION
```

---

# 72. Teste replay

Executar `ConfirmDeposit` novamente.

Resultado:

```text
Deposit remains CONFIRMED
Appointment remains AWAITING_CONFIRMATION
```

Sem duplicação de:

```text
Audit
Outbox
```

para o mesmo evento lógico.

---

# 73. Teste ExpireDeposit

Fixture:

```text
PENDING
expiresAt < now
```

Executar:

```text
ExpireDeposit
```

Resultado:

```text
EXPIRED
```

---

# 74. Não expirar antes da hora

```text
expiresAt > now
```

`ExpireDeposit` deve rejeitar/no-op conforme contrato.

Não confiar apenas no caller.

---

# 75. Deposit confirmed não expira

```text
CONFIRMED
→ ExpireDeposit
```

rejeitado.

---

# 76. Appointment expiration

Se policy existente define:

```text
Deposit EXPIRED
→ Appointment EXPIRED
```

provar:

```text
Billing
→ Operations
→ Appointment FSM
```

---

# 77. Concorrência Confirm vs Expire

Esse é um teste importante.

Duas ações concorrentes:

```text
ConfirmDeposit
ExpireDeposit
```

sobre Deposit `PENDING`.

Resultado obrigatório:

```text
exactly one terminal transition wins
```

Nunca:

```text
CONFIRMED e EXPIRED
```

em histórico incompatível.

---

# 78. Garantia via D1

Não use mutex em memória.

Criar update condicional:

```text
WHERE status='PENDING'
```

e verificar:

```text
changes=1
```

assim como Scheduling fez no PR-12.

---

# 79. CAS de Deposit

Por exemplo conceitual:

```sql
UPDATE deposits
SET status = 'CONFIRMED'
WHERE tenant_id = ?
  AND id = ?
  AND status = 'PENDING'
```

Depois:

```text
changes=1
```

representa sucesso.

Se `0`, reler e decidir replay/conflict.

---

# 80. Isso deve virar primitive do repository

Não colocar SQL CAS no use case.

Algo como:

```text
DepositRepository.transition(...)
```

ou port específico.

---

# 81. Reliability local Billing

`ConfirmDeposit` deve agrupar:

```text
Deposit transition
Audit
Outbox
Idempotency
```

no UnitOfWork Billing.

O RPC Operations ocorre **depois do commit**.

Não dentro da transação.

---

# 82. Por quê?

Porque:

```text
Operations RPC
```

é outra unidade de consistência.

Se ele falhar, Billing deve manter:

```text
DepositConfirmed fact
```

e Outbox.

Isso permite reconciliação.

---

# 83. Mesmo raciocínio para Expire

```text
Deposit EXPIRED + Outbox commit
↓
Operations RPC best effort
```

---

# 84. Criar explicitamente resultado de propagation

UseCase pode retornar:

```text
deposit = CONFIRMED
appointmentPropagation = APPLIED / PENDING
```

internamente.

Mas API pública não precisa expor detalhes de infraestrutura.

---

# 85. Observabilidade

Precisamos diferenciar:

```text
deposit.confirm.success
deposit.confirm.replay
deposit.confirm.conflict

deposit.propagation.success
deposit.propagation.failed
```

Isso ajudará o futuro reconciler.

---

# 86. Não tratar propagation failure como rollback financeiro

Se Deposit foi confirmado com sucesso:

```text
Operations temporarily unavailable
```

não transforme o Deposit novamente em `PENDING`.

O fato financeiro já ocorreu.

---

# 87. Isso é uma mudança conceitual importante

A partir do PR-13 o sistema passa a ter explicitamente:

```text
local atomic consistency
+
cross-worker eventual consistency
```

Documentar.

---

# 88. Criar ADR se necessário

Sugestão:

```text
ADR-0011-cross-worker-financial-eventual-consistency.md
```

Com decisão:

```text
No distributed transaction across Workers.

Each bounded context commits locally.

Outbox is authoritative for downstream propagation.

Synchronous Service Binding propagation is best-effort optimization.

Replay/reconciliation must be idempotent.
```

---

# 89. Teste de falha Operations

Confirmar Deposit com Operations indisponível.

Esperado:

```text
Deposit = CONFIRMED
Outbox DepositConfirmed = PENDING
Appointment = AWAITING_DEPOSIT
```

Isso parece temporariamente inconsistente, mas é recuperável.

Esse é o comportamento correto de eventual consistency.

---

# 90. Não considerar esse teste FAIL

Se o contrato documentado é eventual consistency:

```text
financial commit succeeded
propagation pending
```

é estado válido temporário.

---

# 91. Reconciliation fica fora

PR-14 resolverá:

```text
outbox consumer
retry
reconciliation
```

Não adicionar Queue neste PR.

---

# 92. Worker tests

Criar arquivos, por exemplo:

```text
test/workers/deposit-lifecycle.spec.ts
test/workers/deposit-appointment-transition.spec.ts
```

---

# 93. Teste unitário Domain

Cobrir:

```text
FSM
amount invariants
expiry
CAS result mapping
```

---

# 94. Teste Workers D1

Cobrir:

```text
creation
confirmation
expiration
idempotency
concurrency
tenant isolation
```

---

# 95. Teste RPC

Cobrir:

```text
Billing → Operations
DepositConfirmed
DepositExpired
```

por binding real workerd.

---

# 96. Regredir PR-12

Após alterações:

```bash
npm run gate:pr12
```

tem que continuar PASS.

Deposit lifecycle não pode quebrar CreateAppointment.

---

# 97. Novo gate

Criar:

```bash
npm run gate:pr13
```

Com:

```text
lint
typecheck
unit
workers
physical safety
pr12
deposit tests
dry-runs
```

---

# 98. Migration testing

Se criar `0007`:

```text
DB vazio
0001 → 0007
PASS
```

e:

```text
reapply
→ no migrations to apply
```

---

# 99. Billing D1 binding

PR-10 praticamente não precisava de persistence.

Agora Billing precisará D1 real.

Atualizar:

```text
apps/billing-worker/wrangler.jsonc
```

com `DB` somente se ainda não tiver binding.

---

# 100. Não misturar tabelas sem ownership

Mesmo D1:

```text
Billing
→ deposits
→ discount_policies
→ reliability
```

Operations:

```text
appointments
```

Billing não atualiza Appointment SQL diretamente.

---

# 101. Health Billing

Mesmo após adicionar D1:

```text
GET /health
```

continua:

```text
0 D1 reads
0 D1 writes
0 Operations RPC
```

---

# 102. Free Tier

Deposit transitions são writes, mas frequência é muito menor que reads de agenda.

Evitar:

```text
polling de deposits
```

sem necessidade.

Cron/reconciliation futuro deve ser bounded.

---

# 103. Não criar timer por Deposit

Proibido:

```text
setTimeout()
```

dentro de Worker para expiração.

Workers não devem manter timers duráveis de negócio.

Expiração futura será Cron/Queue/reconciliation.

---

# 104. `expiresAt` é dado, não scheduler

Deposit pode registrar:

```text
expiresAt
```

mas ninguém assume que o Worker ficará vivo até essa hora.

---

# 105. Definition of Done — Domain

```text
[ ] Deposit domain consolidado

[ ] status somente canônicos

[ ] PENDING → CONFIRMED

[ ] PENDING → EXPIRED

[ ] cancel transition somente se normativa

[ ] terminal states protegidos

[ ] amount em cents

[ ] amount >= 0

[ ] tenant ownership
```

---

# 106. Definition of Done — Persistence

```text
[ ] DepositRepository

[ ] D1 adapter

[ ] migration criada

[ ] tenant-aware queries

[ ] unique deposit per appointment

[ ] CAS transition

[ ] concurrent Confirm/Expire safely resolved
```

---

# 107. Definition of Done — Create Deposit

```text
[ ] CreateDepositForAppointment

[ ] usa snapshot do Appointment

[ ] não recalcula CommercialTerms

[ ] idempotente

[ ] duplicate concurrent creation → one Deposit

[ ] appointment without required deposit não gera Deposit
```

---

# 108. Definition of Done — Confirm

```text
[ ] ConfirmDeposit

[ ] PENDING → CONFIRMED

[ ] confirmedAt registrado

[ ] Audit

[ ] Outbox

[ ] Idempotency

[ ] replay seguro

[ ] CAS real

[ ] Billing local transaction PASS
```

---

# 109. Definition of Done — Expiration

```text
[ ] ExpireDeposit

[ ] respeita expiresAt

[ ] PENDING → EXPIRED

[ ] CONFIRMED não expira

[ ] Audit

[ ] Outbox

[ ] idempotent semantics

[ ] nenhum Cron implementado
```

---

# 110. Definition of Done — Appointment coordination

```text
[ ] Operations RPC para deposit confirmed

[ ] ApplyDepositConfirmed use case

[ ] AWAITING_DEPOSIT → AWAITING_CONFIRMATION

[ ] event replay idempotente

[ ] incompatible Appointment state protegido
```

Se `DepositExpired` coordena Appointment:

```text
[ ] ApplyDepositExpired

[ ] AWAITING_DEPOSIT → EXPIRED
```

somente se normativo.

---

# 111. Definition of Done — eventual consistency

```text
[ ] Billing commits locally before propagation

[ ] Operations RPC outside Billing transaction

[ ] propagation failure does not rollback Deposit

[ ] Outbox preserves event

[ ] retry/reconciliation possible

[ ] no distributed transaction attempted
```

---

# 112. Definition of Done — reliability

```text
[ ] Deposit mutation + Audit + Outbox + Idempotency atomic locally

[ ] failure proof PASS

[ ] replay PASS

[ ] hash conflict PASS

[ ] cross-tenant idempotency PASS
```

---

# 113. Definition of Done — RPC

```text
[ ] Billing → Operations Service Binding configured

[ ] DepositConfirmed RPC physical PASS

[ ] correlationId propagated

[ ] tenantId propagated

[ ] no JWT propagated unnecessarily

[ ] no public HTTP Worker-to-Worker
```

---

# 114. Definition of Done — concurrency

```text
[ ] concurrent CreateDeposit → one row

[ ] concurrent ConfirmDeposit → one transition

[ ] Confirm vs Expire → only one terminal result

[ ] no in-memory mutex
```

---

# 115. Definition of Done — security

```text
[ ] cross-tenant Deposit read blocked

[ ] cross-tenant confirmation blocked

[ ] cross-tenant Appointment propagation blocked

[ ] no customer PII in Audit/Outbox/logs
```

---

# 116. Definition of Done — regressions

```text
[ ] gate:physical-safety PASS

[ ] gate:create-appointment PASS

[ ] gate:pr12 PASS

[ ] CreateAppointment still creates AWAITING_DEPOSIT correctly

[ ] CreateAppointment without deposit remains AWAITING_CONFIRMATION
```

---

# 117. Definition of Done — quality

```text
[ ] npm run lint PASS

[ ] tsc --build --force PASS

[ ] npm run test PASS

[ ] npm run test:workers PASS

[ ] npm run gate:pr12 PASS

[ ] npm run gate:pr13 PASS

[ ] Operations dry-run PASS

[ ] Clinical dry-run PASS

[ ] Billing dry-run PASS

[ ] migrations PASS

[ ] git diff --check PASS
```

---

# 118. Fora do PR-13

Continuam explicitamente fora:

```text
Payment

PIX
Card gateway
Cash ledger

Refund
Credit

Cron
Queue
Outbox consumer

Deposit reconciliation worker

ConfirmPresence

CheckIn

Session

R2
KV

Notifications
WhatsApp
```

---

# 119. Relatório pós-PR

O Codex deve responder:

```text
PR-13 — Deposit Lifecycle + Appointment Deposit Transitions

Baseline
PR12 gate:

Deposit Domain
statuses:
FSM:
invariants:

Persistence
migration:
repository:
tenant isolation:
unique appointment deposit:

CreateDeposit
success:
duplicate:
concurrent:

ConfirmDeposit
success:
replay:
conflict:
CAS:

ExpireDeposit
success:
not-due:
confirmed:
CAS:

Concurrent transitions
confirm-vs-confirm:
confirm-vs-expire:

Reliability
UnitOfWork:
audit:
outbox:
idempotency:
failure:

Operations Coordination
binding:
DepositConfirmed:
DepositExpired:
replay:
incompatible state:

Eventual Consistency
local commit:
propagation:
failure:
outbox pending:

Physical Tests
unit:
workers:
D1:
RPC:
concurrency:

Regression
physical safety:
create appointment:
PR12:

Quality
lint:
typecheck:
dry-runs:
git diff:

Remaining blockers:

Next PR:
```

---

# 120. Próximo PR depois do PR-13

Se o PR-13 fechar corretamente, o próximo que eu recomendo é:

# PR-14 — Outbox Delivery + Cross-Worker Reconciliation Foundation

Porque PR-13 introduzirá deliberadamente:

```text
Billing commit
      ↓
DepositConfirmed
      ↓
best-effort Operations RPC
```

e precisamos garantir recuperação quando:

```text
Operations indisponível
```

O PR-14 então implementará:

```text
Outbox dispatcher
retry
delivery attempts
idempotent consumer
reconciliation
dead-letter/failure policy
```

provavelmente usando Cloudflare Queue/Cron **somente depois de avaliar o orçamento Free**, em vez de acoplar isso agora ao lifecycle do Deposit.

A sequência fica:

```text
PR-12
CreateAppointment
      ↓
PR-13
Deposit lifecycle
+ Appointment transition
      ↓
PR-14
Outbox delivery
+ reconciliation
      ↓
PR-15
Presence / Check-in
      ↓
PR-16
Session lifecycle
```

O ponto arquitetural central do PR-13 é não transformar a transição `Deposit → Appointment` em uma falsa transação distribuída. **Billing deve confirmar o fato financeiro localmente, registrar Audit + Outbox de forma atômica e propagar o fato de maneira idempotente ao Operations. Se a propagação falhar, o fato financeiro permanece verdadeiro e o sistema precisa ser reconciliável — exatamente o problema que o PR-14 resolverá.**
