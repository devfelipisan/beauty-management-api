Com o **PR-23.1 concluído**, mas com:

```text
PackageReadyForPayment = BLOCKED
```

o próximo PR **não deve ser o PR-24 ainda**.

O próximo passo correto é fechar exatamente o que ficou pendente:

# PR-23.2 — Package Physical Safety Qualification + Replay / ACK-Loss / E2E

O objetivo é transformar as garantias de pacote que hoje existem em código e constraints em **provas físicas executáveis no runtime `workerd` + D1 + Service Bindings**.

A saída esperada do PR deve ser:

```text
PackageAssignment                PASS
PackageConsumptionConcurrency    PASS
SingleSessionConsumption         PASS
NoNegativeBalance                PASS
Replay                           PASS
ACKLoss                          PASS
OutboxReconciliation             PASS
PackageE2E                       PASS
TenantIsolation                  PASS

PackageReadyForPayment = PASS
```

Somente depois disso deve começar:

```text
PR-24 — Receivable + Payment + Ledger Foundation
```

---

# 1. Escopo exato do PR-23.2

Este PR deve ser predominantemente de **qualificação**, não de novo domínio.

Entram:

```text
D1 physical concurrency tests

Package consumption under contention

same Session / multiple requests

same Session / different eventIds

same Session / different packages

replay

idempotency conflict

UnitOfWork failure proofs

Outbox delivery

ACK-loss

Service Binding:
Clinical → Billing
Billing → Operations

full package-funded Session E2E

package expiration after assignment

package exhaustion after assignment

tenant isolation

PackageReadyForPayment gate
```

Ficam explicitamente fora:

```text
Payment
Ledger
Receivable
Partial payment
Refund
Credit
Cash/Pix/Card settlement

Package reservation

Package refund

Manual package balance adjustment
```

---

# 2. Congelar a baseline

Antes de alterar qualquer arquivo:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr22
npm run gate:pr23
npm run gate:pr23.1
```

Depois:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers
npm run workers:dry-run
git diff --check
```

Tudo deve continuar `PASS`.

Registrar no plano:

```text
BaselinePR231 = PASS
PackageReadyForPayment = BLOCKED
```

---

# 3. Criar o plano formal

Criar:

```text
docs/plans/PR-23.2-package-physical-safety-qualification.md
```

Com:

```text
Objective
Baseline
Current Blockers
Physical Environment
Package Assignment Proofs
Consumption Concurrency
Business Uniqueness
CAS Proofs
Atomicity Proofs
Replay
ACK-loss
Outbox Reconciliation
Service Binding Qualification
Failure Scenarios
Full E2E
Tenant Isolation
Free-tier Impact
PackageReadyForPayment
Definition of Done
Out of Scope
```

---

# 4. Não criar novos estados de Package

O PR-23 já definiu:

```text
ACTIVE
COMPLETED
EXPIRED
CANCELED
```

PR-23.2 não deve criar:

```text
RESERVED
PROCESSING
CONSUMING
LOCKED
```

apenas para facilitar testes.

A suíte deve provar o modelo atual.

---

# 5. Inspecionar a proteção física existente

Antes dos testes:

```bash
grep -R "package_movements" database apps -n
grep -R "remaining_quantity" database apps -n
grep -R "CONSUMPTION" apps database -n
grep -R "customer_package_id" apps database -n
```

Confirmar especificamente:

```text
CAS do saldo
constraint remaining >= 0
unicidade por Session
UnitOfWork
Outbox
Idempotency
```

Se algum desses pontos estiver apenas no Domain e não no D1, corrigir no PR-23.2.

---

# 6. Inspecionar migration `0017`

Executar:

```bash
cat database/d1/migrations/0017_packages_session_consumption.sql
```

Verificar se há constraint física equivalente a:

```text
remaining_quantity >= 0
```

e business uniqueness.

---

# 7. Verificar unicidade correta da Session

O PR-23 relatou:

```text
tenantId + sessionId + movementType
```

Isso é bom.

Fisicamente deve impedir:

```text
Session X
Package A → CONSUMPTION

Session X
Package B → CONSUMPTION
```

também.

Ou seja, a unique constraint **não deve incluir `customer_package_id`** se a regra é uma única unidade consumida por Session.

Conceitualmente:

```sql
UNIQUE (
  tenant_id,
  session_id,
  movement_type
)
```

para movements associados à Session.

---

# 8. Se a constraint física estiver incorreta

Criar migration:

```text
0019_package_consumption_physical_safety.sql
```

somente se necessário.

Não criar migration por obrigação de numeração.

---

# 9. Criar suíte dedicada

Criar:

```text
test/workers/package-consumption-concurrency.spec.ts
```

Esse arquivo deve rodar contra:

```text
workerd
+
D1 real de teste
```

Não repository fake.

---

# 10. Criar comando específico

No `package.json`:

```text
test:package-concurrency
```

Executando apenas essa suíte.

Exemplo conceitual:

```bash
npm run test:package-concurrency
```

Isso permite depuração rápida do gate físico.

---

# 11. Prova 1 — saldo inicial 1

Para cada iteração:

```text
CustomerPackage:
status = ACTIVE
remainingQuantity = 1
validUntil > now
```

Criar duas Sessions distintas:

```text
Session A
Session B
```

Disparar consumo simultâneo.

---

# 12. Resultado obrigatório da prova 1

```text
successful = 1
blocked = 1

remainingQuantity = 0
status = COMPLETED

movements = 1

negativeBalance = 0
```

Não é suficiente apenas receber um erro.

Validar estado final diretamente no D1.

---

# 13. Repetir a corrida

Não testar uma única vez.

Sugestão:

```text
iterations = 50
attempts per iteration = 2
```

Resumo esperado:

```text
packages = 50

attempts = 100
successful = 50
blocked = 50

movements = 50
double consumptions = 0
negative balances = 0
```

---

# 14. Prova 2 — saldo N contra N requests

Fixture:

```text
remainingQuantity = 10
```

Disparar:

```text
10 distinct Session consumptions
```

concorrentemente.

Resultado:

```text
success = 10
blocked = 0

remainingQuantity = 0
movements = 10
status = COMPLETED
```

---

# 15. Prova 3 — saldo N contra N+1

```text
remainingQuantity = 10
requests = 11
```

Resultado obrigatório:

```text
successful = 10
blocked = 1

remaining = 0
movements = 10
negative = 0
```

---

# 16. Prova 4 — alta contenção

Criar cenário maior, mas ainda adequado ao Free/local runtime:

```text
initial balance = 25
concurrent Sessions = 100
```

Resultado:

```text
success = 25
blocked = 75

remaining = 0
movements = 25

negative = 0
```

Esse deve ser o principal proof de saldo.

---

# 17. Não serializar artificialmente o teste

Evitar:

```ts
for (...) {
  await consume();
}
```

Isso não testa concorrência.

As requests precisam realmente competir.

---

# 18. Também não usar lock no teste para “ajudar”

Nada de mutex controlando a aplicação.

A concorrência precisa atingir:

```text
Billing
→ UseCase
→ Repository
→ D1 CAS
```

---

# 19. Prova 5 — mesma Session, mesma key

Criar:

```text
remainingQuantity = 10
Session X
```

Enviar 100 requests concorrentes com:

```text
same Idempotency-Key
same eventId
```

Resultado:

```text
remaining = 9
movements = 1
business effects = 1
```

---

# 20. Prova 6 — mesma Session, keys diferentes

Agora:

```text
same Session X
different Idempotency-Key
```

Por exemplo:

```text
K1
K2
K3
...
```

Resultado continua:

```text
remaining decrement = 1
PackageMovement = 1
```

Isso prova que business uniqueness não depende apenas da Idempotency foundation.

---

# 21. Prova 7 — mesma Session, eventIds diferentes

Simular bug/redelivery sem identidade de transporte consistente:

```text
Session X

eventId A
eventId B
```

Resultado:

```text
one consumption
```

A unique business constraint deve impedir a segunda unidade.

---

# 22. Prova 8 — mesma Session contra dois CustomerPackages

Criar:

```text
Package A
remaining=5

Package B
remaining=5

Session X
```

Tentar simultaneamente:

```text
consume Session X from Package A
consume Session X from Package B
```

Resultado obrigatório:

```text
total consumption movements for Session X = 1
```

O outro Package não deve perder unidade.

---

# 23. Esse teste é essencial

Sem ele, seria possível:

```text
Session X
→ consume Package A
→ consume Package B
```

com duas `customer_package_id` diferentes.

O MVP não prevê split settlement de uma Session entre pacotes.

---

# 24. Prova 9 — tenants independentes

Tenant A:

```text
sessionId = X
key = K
```

Tenant B:

```text
sessionId = X
key = K
```

Ambos devem consumir normalmente seus respectivos pacotes.

Resultado:

```text
tenant isolation = PASS
```

---

# 25. Prova da UnitOfWork

O PR precisa provar que consumo não pode produzir:

```text
balance decrement
without PackageMovement
```

ou:

```text
PackageMovement
without balance decrement
```

---

# 26. Criar failure injection para movement

Simular falha do statement que grava:

```text
PackageMovement
```

Resultado:

```text
remainingQuantity unchanged
movement count = 0
Audit = 0
Outbox = 0
```

conforme semântica atual da UnitOfWork.

---

# 27. Failure injection de Audit

Se Audit faz parte da mutation crítica:

```text
AuditWriter fails
```

Resultado:

```text
CustomerPackage not decremented
PackageMovement absent
```

---

# 28. Failure injection de Outbox

`PackageUnitConsumed` é necessário para Operations timeline.

Então, se Outbox falhar na UnitOfWork:

```text
package consumption must not partially commit
```

---

# 29. Idempotency failure

Também provar que:

```text
domain mutation committed
idempotency missing
```

não acontece.

A mesma foundation do PR-07 deve permanecer válida.

---

# 30. Criar suíte Reliability específica

Pode ser:

```text
test/workers/package-reliability.spec.ts
```

ou integrar à suíte de concorrência se continuar legível.

---

# 31. Provar materialização idempotente

O relatório menciona:

```text
materialização autorizada de CustomerPackage
```

Testar:

```text
same acquisition/source operation
```

duas vezes.

Esperado:

```text
CustomerPackages = 1
```

---

# 32. Não testar Payment

O source pode ser fixture autorizada:

```text
AUTHORIZED_PACKAGE_MATERIALIZATION
```

ou o contrato existente.

Não simular:

```text
payment = PAID
```

sem PR-24.

---

# 33. Provar snapshots comerciais

CustomerPackage:

```text
basePriceCents
discountCents
finalPriceCents
totalQuantity
validUntil
```

Depois alterar PackageDefinition.

Esperado:

```text
CustomerPackage unchanged
```

---

# 34. Provar ausência de double-discount

Durante:

```text
PackageConsumptionRequested
```

instrumentar/fake spy na policy comercial quando possível.

Resultado:

```text
DiscountPolicy invocation = 0
DepositPolicy invocation = 0
```

O consumo só reduz saldo.

---

# 35. Agora qualificar Assignment E2E

Criar:

```text
test/workers/package-assignment.spec.ts
```

ou consolidar caso já exista teste parcial.

Fluxo:

```text
Appointment
+
CustomerPackage
↓
POST /appointments/:id/package
```

---

# 36. Happy path do assignment

Package:

```text
same tenant
same customer
same service
ACTIVE
remaining > 0
not expired
```

Esperado:

```text
HTTP success

appointment.customer_package_id = packageId
appointment.settlement_source = PACKAGE

Audit AppointmentPackageAssigned
```

---

# 37. Assignment replay

Same:

```text
Idempotency-Key
same body
```

Resultado:

```text
same assignment
no duplicate Audit
```

---

# 38. Assignment conflict

Same key:

```text
Package A
```

depois:

```text
Package B
```

Resultado:

```text
IDEMPOTENCY_KEY_CONFLICT
```

---

# 39. Silent replacement protection

Assign A.

Depois nova intenção com B.

Mesmo com nova Idempotency-Key:

```text
APPOINTMENT_PACKAGE_ALREADY_ASSIGNED
```

ou código equivalente.

Appointment continua A.

---

# 40. Package errado — tenant

```text
Tenant A Appointment
Tenant B Package
```

Bloqueado.

---

# 41. Package errado — Customer

Bloqueado com código estável.

---

# 42. Package errado — Service

Bloqueado.

---

# 43. Package expirado

Bloqueado.

---

# 44. Package saldo zero

Bloqueado.

---

# 45. Status inválidos

Testar:

```text
COMPLETED
EXPIRED
CANCELED
```

Todos bloqueados para novo assignment.

---

# 46. Assignment tardio

Appointment:

```text
IN_PROGRESS
```

ou:

```text
COMPLETED
```

Não pode receber Package.

---

# 47. Verificar `CHECKED_IN`

Se a regra do PR-23.1 permite ou bloqueia, testar exatamente o contrato implementado.

Não alterar agora arbitrariamente.

---

# 48. Qualificar Service Binding Operations → Billing

O teste principal de assignment precisa atravessar:

```text
Operations
→ BILLING_SERVICE
→ checkPackageUsageEligibility
```

Não chamar o adapter fake.

---

# 49. Provar `correlationId`

Headers/context:

```text
Operations request
↓
Billing RPC
```

precisam manter correlation.

Não precisa virar teste de valor sensível; basta igualdade esperada.

---

# 50. Agora provar Session snapshot

Fluxo:

```text
Assign Package A
↓
StartSession
↓
Session persisted
```

Verificar:

```text
Session.customerPackageId = A
```

---

# 51. Não usar Appointment no CompleteSession para descobrir pacote

O E2E deve conseguir demonstrar que `PackageConsumptionRequested` usa a referência da Session.

Uma forma:

```text
start Session with Package A
```

e tentar modificar Appointment depois.

A alteração deve falhar.

---

# 52. Prova de imutabilidade

Depois de:

```text
Session IN_PROGRESS
customerPackageId = A
```

tentar alterar Package association.

Resultado:

```text
BLOCKED
```

Session permanece A.

---

# 53. E2E principal — package-funded Session

Criar um teste dedicado:

```text
test/workers/package-session-e2e.spec.ts
```

Caminho:

```text
CustomerPackage ACTIVE
remaining = 3
        ↓
Create Appointment
        ↓
Assign Package
        ↓
Confirm Appointment
        ↓
CheckIn
        ↓
StartSession
        ↓
technical requirements satisfied
        ↓
CompleteSession
        ↓
Session COMPLETED
        ↓
PackageConsumptionRequested
        ↓
Billing
        ↓
remaining = 2
        ↓
PackageMovement CONSUMPTION
        ↓
PackageUnitConsumed
        ↓
Operations
        ↓
Timeline PACKAGE_CONSUMED
```

---

# 54. Resultado E2E obrigatório

```text
Appointment = COMPLETED

Session = COMPLETED

CustomerPackage:
  remainingQuantity = 2
  status = ACTIVE

PackageMovements:
  CONSUMPTION = 1

Customer Timeline:
  SESSION_COMPLETED = 1
  PACKAGE_CONSUMED = 1
```

---

# 55. E2E sem pacote

Caminho igual, mas sem assignment.

Resultado:

```text
Session COMPLETED
Appointment COMPLETED

PackageConsumptionRequested = 0
PackageMovement = 0
PACKAGE_CONSUMED timeline = 0
```

Esse teste evita consumo acidental.

---

# 56. Provar Clinical → Billing Service Binding

O E2E precisa passar pelo binding real:

```text
Clinical
→ BILLING_SERVICE
```

usado pelo dispatcher/consumer.

Não diretamente por `ConsumePackageUnit`.

---

# 57. Provar Billing → Operations

Da mesma forma:

```text
PackageUnitConsumed
→ Operations
→ Timeline
```

com Service Binding real.

---

# 58. Teste de Outbox `PackageConsumptionRequested`

Após SessionComplete com pacote:

```text
Outbox event exists
```

e passa pelo lifecycle:

```text
PENDING
→ PROCESSING
→ SENT
```

---

# 59. Replay de `PackageConsumptionRequested`

Entregar duas ou mais vezes.

Resultado:

```text
one decrement
one movement
```

---

# 60. ACK-loss Clinical → Billing

Simular:

```text
Billing consumes package successfully
↓
Clinical does not mark PackageConsumptionRequested SENT
```

Depois:

```text
redelivery
```

Billing:

```text
REPLAY
```

Saldo permanece correto.

---

# 61. ACK-loss Billing → Operations

Simular:

```text
Operations creates PACKAGE_CONSUMED timeline
↓
Billing fails before markSent
```

Redelivery:

```text
Operations REPLAY
timeline rows remain 1
```

---

# 62. Dois níveis de ACK-loss

Este PR deve provar ambos:

```text
Clinical → Billing
Billing → Operations
```

porque Package flow tem duas fronteiras cross-worker.

---

# 63. Prova de recovery de lease

Se o Outbox PR-14 suporta claim lease:

```text
PackageUnitConsumed PROCESSING
claim expires
```

Depois:

```text
recover
→ redeliver
→ SENT
```

Não precisa recriar framework; reutilizar a proof pattern existente.

---

# 64. Pacote expira depois do assignment

Cenário deliberadamente pendente.

Fluxo:

```text
assign when valid
↓
Session starts
↓
advance time
↓
validUntil passes
↓
CompleteSession
```

Billing deve:

```text
not consume
```

Resultado esperado:

```text
Session COMPLETED
Appointment COMPLETED

Package remaining unchanged

PackageConsumptionRequested
→ permanent/reconciliation-required outcome
```

---

# 65. Não resolver automaticamente como Standard Payment

Ainda não temos PR-24.

Não faça:

```text
package failed
→ create receivable automatically
```

neste PR.

---

# 66. Criar um resultado operacional explícito

Algo equivalente a:

```text
PACKAGE_CONSUMPTION_RECONCILIATION_REQUIRED
```

para esse cenário, se ainda não existe.

Ou registrar um dead/rejected Outbox com error code apropriado.

A semântica precisa ser observável.

---

# 67. Pacote esgotado depois do assignment

Mesmo cenário:

```text
Appointment A assigned package balance=1
Appointment B assigned same package
```

B conclui primeiro.

A conclui depois.

A segunda consumption:

```text
PACKAGE_BALANCE_EXHAUSTED
```

Session não é revertida.

---

# 68. Documentar explicitamente a limitação

No ADR/plan:

```text
Package assignment does not reserve a unit.

Package availability is revalidated authoritatively at consumption.

Therefore assignment does not guarantee future consumption.

Failure after Session completion requires reconciliation.

Reservation is intentionally outside PR-23.2.
```

Essa honestidade arquitetural é importante.

---

# 69. Não marcar esses cenários como falha do gate

Eles são comportamento esperado **se forem tratados deterministicamente e sem corrupção**.

Gate PASS significa:

```text
no negative balance
no double consumption
failure explicitly represented
state recoverable/observable
```

Não significa que assignment reserva saldo.

---

# 70. Provar `PackageUnitConsumed` timeline

Operations deve usar:

```text
sourceEventId
```

para deduplicação.

Testar:

```text
same PackageUnitConsumed event delivered 20x
```

Timeline:

```text
PACKAGE_CONSUMED rows = 1
```

---

# 71. Provar historical balance

Movement precisa manter:

```text
balanceBefore
balanceAfter
sessionId
customerPackageId
sourceEventId
```

Verificar fisicamente.

---

# 72. Provar package COMPLETED final

Quando última unidade é consumida:

```text
remaining = 0
status = COMPLETED
```

de forma atômica.

Não deve existir janela persistente:

```text
remaining=0
status=ACTIVE
```

após commit.

---

# 73. Prova de expiration lazy

Package:

```text
status=ACTIVE
validUntil < now
```

Eligibility deve bloquear mesmo antes de status materializado como EXPIRED.

Isso prova que status stale não viola regra temporal.

---

# 74. Não criar Cron de expiration

Continua fora.

---

# 75. Testar package list bounded

Se PR-23.1 expôs ou criou query de packages elegíveis:

```text
limit
cursor
service
status
```

verificar D1 query plan.

---

# 76. `EXPLAIN QUERY PLAN`

Rodar para pelo menos:

```text
find package by id/tenant
find customer packages by customer/service
find movement by session
list package movements
```

Registrar resultado no relatório.

---

# 77. Índices apenas se prova mostrar necessidade

Se query plan indicar table scan em query frequente, ajustar migration.

Não adicionar índices por especulação.

---

# 78. Criar gate físico

Adicionar:

```bash
npm run gate:package-physical-safety
```

Esse comando deve rodar:

```text
package concurrency
business uniqueness
atomicity
tenant isolation
```

---

# 79. Criar gate do PR

Adicionar:

```bash
npm run gate:pr23.2
```

Idealmente:

```text
gate:pr23.1
+
gate:package-physical-safety
+
package assignment physical tests
+
package E2E
+
ACK-loss tests
+
dry-runs
```

---

# 80. Não usar `gate:pr23.2` apenas como alias do lint

Ele deve ser a **prova de readiness de Payment**.

---

# 81. Readiness document

Criar ou atualizar:

```text
docs/plans/package-ready-for-payment.md
```

Resultado estruturado:

```text
PackageReadyForPayment
```

---

# 82. Critérios do readiness

```text
PackageAssignmentHTTP             PASS
BillingEligibilityRPC             PASS
AppointmentPackagePersistence     PASS
SessionPackageSnapshot            PASS

PackageCAS                        PASS
NoNegativeBalance                 PASS
SingleConsumptionPerSession       PASS
PackageCompletionTransition       PASS

ConsumptionUnitOfWork             PASS
AuditAtomicity                    PASS
OutboxAtomicity                   PASS

ClinicalToBilling                 PASS
BillingToOperations               PASS

Replay                            PASS
ACKLossClinicalBilling            PASS
ACKLossBillingOperations          PASS
LeaseRecovery                     PASS

PackageE2E                        PASS
NonPackageE2E                     PASS
TenantIsolation                   PASS

FailureAfterAssignment            QUALIFIED
Reservation                       NOT_IMPLEMENTED / ACCEPTED_LIMITATION
```

---

# 83. Somente então

```text
PackageReadyForPayment = PASS
```

Se qualquer invariante crítica falhar:

```text
BLOCKED
```

---

# 84. Definition of Done — Assignment

```text
[ ] endpoint fisicamente testado
[ ] auth
[ ] tenant
[ ] permission
[ ] Billing binding real
[ ] customer match
[ ] service match
[ ] status
[ ] expiry
[ ] balance
[ ] idempotency
[ ] silent replacement blocked
[ ] late assignment blocked
```

---

# 85. Definition of Done — Session snapshot

```text
[ ] Appointment has package reference

[ ] SessionStartContext propagates it

[ ] Session persists it

[ ] CompleteSession uses Session snapshot

[ ] package cannot be changed after Session starts
```

---

# 86. Definition of Done — Concurrency

```text
[ ] remaining=1 / 2 Sessions

[ ] remaining=N / N Sessions

[ ] remaining=N / N+1 Sessions

[ ] high contention

[ ] remaining never < 0

[ ] success count never > initial balance
```

---

# 87. Definition of Done — Business uniqueness

```text
[ ] same Session / same event

[ ] same Session / different event

[ ] same Session / different Idempotency-Key

[ ] same Session / different package

[ ] one consumption movement total
```

---

# 88. Definition of Done — Atomicity

```text
[ ] balance decrement and movement are atomic

[ ] Audit failure rolls back consumption

[ ] Outbox failure rolls back consumption

[ ] Idempotency failure cannot leave partial state

[ ] no partial package completion state
```

---

# 89. Definition of Done — Cross-worker

```text
[ ] PackageConsumptionRequested delivered physically

[ ] Billing consumes

[ ] PackageUnitConsumed delivered physically

[ ] Operations timeline updated

[ ] all bindings real in workerd

[ ] no HTTP public fallback
```

---

# 90. Definition of Done — Replay / ACK loss

```text
[ ] PackageConsumptionRequested replay safe

[ ] PackageUnitConsumed replay safe

[ ] Clinical→Billing ACK-loss safe

[ ] Billing→Operations ACK-loss safe

[ ] Outbox lease recovery safe
```

---

# 91. Definition of Done — failure after assignment

```text
[ ] package expiry after assignment tested

[ ] package exhaustion after assignment tested

[ ] Session remains authoritative COMPLETED

[ ] package balance not corrupted

[ ] failure represented explicitly

[ ] reconciliation-required state observable

[ ] no automatic financial fallback invented
```

---

# 92. Definition of Done — historical safety

```text
[ ] PackageMovement contains Session reference

[ ] balanceBefore/After preserved

[ ] package commercial snapshot unchanged

[ ] package Definition changes do not rewrite CustomerPackage

[ ] DiscountPolicy not re-applied on consumption
```

---

# 93. Definition of Done — tenant isolation

```text
[ ] assignment cross-tenant blocked

[ ] eligibility cross-tenant blocked

[ ] consumption cross-tenant blocked

[ ] movement lookup cross-tenant blocked

[ ] timeline cross-tenant blocked
```

---

# 94. Definition of Done — Free-first

```text
[ ] no Queue

[ ] no KV

[ ] no R2

[ ] no Cron

[ ] no polling

[ ] bounded D1 queries

[ ] no in-memory distributed locks

[ ] Service Bindings only for required cross-worker calls
```

---

# 95. Definition of Done — regression

```text
[ ] PR-21 PASS

[ ] PR-22 PASS

[ ] PR-23 PASS

[ ] PR-23.1 PASS

[ ] normal Appointment still works without package

[ ] Session start unaffected

[ ] Session completion unaffected

[ ] customer history unaffected
```

---

# 96. Qualidade final

Executar:

```bash
npm run lint
npx tsc --build --force

npm run test
npm run test:workers
npm run test:package-concurrency

npm run gate:pr23
npm run gate:pr23.1
npm run gate:package-physical-safety
npm run gate:pr23.2

npm run workers:dry-run
git diff --check
```

Tudo deve resultar:

```text
PASS
```

---

# 97. Resultado normativo do PR

Ao terminar:

```text
RN-PAC-001  PASS
RN-PAC-002  PASS
RN-PAC-003  PASS
RN-PAC-004  PASS + PHYSICAL PROOF
RN-PAC-005  PASS + PHYSICAL PROOF
RN-PAC-006  PASS
RN-PAC-007  PASS + PHYSICAL PROOF
RN-PAC-008  PASS + PHYSICAL PROOF
```

E finalmente:

```text
PackageReadyForPayment = PASS
```

---

# 98. `RN-CONC-002` depois do PR-23.2

O status deve permanecer:

```text
Session                 PASS
Appointment             PASS
History                 PASS
Customer profile        PASS
Package consumption     PASS
Return recommendation   PASS
Audit                   PASS

Financial balance       PENDING

RN-CONC-002 FULL        NOT YET
```

Ou seja: **o PR-23.2 libera o financeiro, mas ainda não fecha `RN-CONC-002`**.

---

# 99. Relatório pós-implementação obrigatório

O Codex deveria entregar algo próximo de:

```text
PR-23.2 — Package Physical Safety Qualification

Baseline
PR23:
PR23.1:

Assignment Physical Proof
HTTP:
Billing RPC:
customer:
service:
status:
expiry:
balance:
tenant:
idempotency:
late mutation:

Session Snapshot
Appointment package:
SessionStartContext:
Session package:
immutability:

Physical Concurrency
iterations:
initial balance:
attempts:
success:
blocked:
remaining:
negative balances:

High Contention
initial:
attempts:
successful:
blocked:
movements:

Single Session Safety
same event:
different event:
different key:
different packages:
movement count:

Atomicity
balance+movement:
Audit failure:
Outbox failure:
Idempotency:
partial states:

Package Completion
last unit:
remaining:
status:

Clinical → Billing
PackageConsumptionRequested:
replay:
ACK-loss:

Billing → Operations
PackageUnitConsumed:
timeline:
replay:
ACK-loss:

E2E Package
Appointment:
Session:
package before:
package after:
movement:
timeline:

E2E Non-Package
package events:
movements:

Failure After Assignment
expired package:
exhausted package:
Session state:
package state:
reconciliation:
reservation:

Tenant Isolation
assignment:
consumption:
movement:
timeline:

Query Safety
eligibility query:
movement query:
query plan:

Free Tier
D1:
KV:
R2:
Queue:
Cron:
polling:

RN-PAC
001:
002:
003:
004:
005:
006:
007:
008:

PackageReadyForPayment:

RN-CONC-002
session:
appointment:
history:
profile:
package:
return:
audit:
financial:
full:

Regression
PR21:
PR22:
PR23:
PR23.1:

Quality
unit:
workers:
package concurrency:
lint:
typecheck:
dry-runs:
PR23.2 gate:

Remaining blockers:

Next PR:
```

---

# 100. Próximo PR depois do `PackageReadyForPayment = PASS`

Aí sim deve começar:

# PR-24 — Receivable + Payment + Ledger Foundation

A ordem recomendada dentro dele será:

```text
Financial Obligation / Receivable
        ↓
gross amount
        ↓
confirmed deposit
        ↓
package settlement when applicable
        ↓
remaining balance
        ↓
Payments
 ├── CASH
 ├── PIX
 ├── DEBIT_CARD
 ├── CREDIT_CARD
 ├── TRANSFER
 └── INTERNAL_CREDIT
        ↓
partial payment support
        ↓
PAID / PARTIAL / OPEN
        ↓
append-only LedgerMovement
```

Depois:

```text
Refund
Credit
```

podem ser implementados de forma consistente sobre o ledger.

A prioridade agora, portanto, é **PR-23.2 — Package Physical Safety Qualification**. O PR-23.1 resolveu a integração funcional de Package com Appointment e Session; o que ainda impede o financeiro é não termos uma prova física de que, sob concorrência real, **o saldo nunca fica negativo, uma Session nunca consome duas unidades, UnitOfWork não deixa estados parciais e os dois saltos de Outbox permanecem idempotentes sob replay/ACK-loss**. Só após esses invariantes retornarem `PASS` o `PackageReadyForPayment` deve ser liberado.
