Com o estado atual, o próximo PR ainda **não deve ser o PR-24**.

O PR-23.2 avançou bastante, mas o próprio relatório deixa três bloqueios formais para liberar:

```text
PackageReadyForPayment = PASS
```

Eles são:

```text
1. isolamento entre tenants;
2. falhas injetadas de UnitOfWork;
3. E2E completo Clinical → Billing → Operations.
```

Então o próximo PR deve ser:

# PR-23.3 — Package Final Physical Qualification + Payment Readiness Gate

O objetivo é transformar:

```text
PR-23.2 base física = PASS parcial
PackageReadyForPayment = BLOCKED
```

em:

```text
TenantIsolation              PASS
UnitOfWorkFailureSafety      PASS
Clinical→Billing→Operations  PASS
Replay/ACK-loss              PASS
PackageReadyForPayment       PASS
```

Só depois disso abrir:

```text
PR-24 — Receivable + Payment + Ledger Foundation
```

---

# 1. Escopo do PR-23.3

Este PR deve ser **somente de qualificação final e correções mínimas derivadas das provas**.

Entram:

```text
tenant isolation physical proofs
UnitOfWork failure injection
cross-worker E2E
replay
ACK-loss
outbox lease recovery
reconciliation
package assignment propagation
package consumption propagation
timeline projection
final readiness gate
```

Ficam fora:

```text
Payment
Ledger
Receivable
Partial Payment
Refund
Internal Credit

Package reservation
Package refund
Package transfer
Manual package adjustment
```

---

# 2. Congelar baseline

Antes de alterar código:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr23
npm run gate:pr23.1
npm run gate:pr23.2
```

Depois:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers
npm run test:package-concurrency
npm run workers:dry-run
git diff --check
```

Esperado:

```text
PASS
```

Registrar no plano:

```text
PackageReadyForPayment = BLOCKED
```

antes das novas provas.

---

# 3. Criar o documento formal

Criar:

```text
docs/plans/PR-23.3-package-final-physical-qualification.md
```

Seções:

```text
Objective
Baseline
Current Blockers
Tenant Isolation
UnitOfWork Failure Safety
Clinical → Billing Delivery
Billing → Operations Delivery
Replay
ACK-loss
Lease Recovery
Full Package E2E
Failure After Assignment
Query Safety
Free Tier
PackageReadyForPayment
Definition of Done
Out of Scope
```

---

# 4. Não alterar o domínio sem prova de necessidade

Não criar:

```text
PackageReservation
FinancialSettlement
PackageLock
PaymentStatus
```

apenas para satisfazer testes.

O PR deve provar o modelo atual:

```text
assignment explícito
+
Session snapshot
+
consumption CAS
+
movement uniqueness
+
outbox
+
idempotency
```

---

# 5. Primeiro bloco: isolamento físico por tenant

Criar suíte dedicada:

```text
test/workers/package-tenant-isolation.spec.ts
```

O objetivo é provar que a separação não existe apenas nos DTOs/application services.

---

# 6. Tenant isolation — PackageDefinition

Criar:

```text
Tenant A
PackageDefinition A

Tenant B
PackageDefinition B
```

Tenant A não pode:

```text
read B
update B
materialize B
```

---

# 7. Tenant isolation — CustomerPackage

Tenant A não pode consultar:

```text
CustomerPackage Tenant B
```

mesmo conhecendo o ID.

Esperado:

```text
404 ou 403
```

conforme convenção atual.

Nunca:

```text
200 + dados B
```

---

# 8. Tenant isolation — Package eligibility RPC

Operations Tenant A tenta consultar:

```text
customerPackageId Tenant B
```

via Billing binding.

Resultado:

```text
BLOCKED
```

com código estável.

---

# 9. Tenant isolation — Appointment assignment

Cenário:

```text
Appointment Tenant A
CustomerPackage Tenant B
```

Endpoint:

```http
POST /tenants/A/appointments/:id/package
```

Resultado:

```text
BLOCKED
```

Appointment continua sem package.

---

# 10. Tenant isolation — Session snapshot

Não deve ser possível:

```text
Appointment Tenant A
Session Tenant A
customerPackageId Tenant B
```

mesmo por chamada interna adulterada.

O contexto Operations→Clinical precisa continuar tenant-scoped.

---

# 11. Tenant isolation — consumption RPC

Simular request interno Billing:

```text
tenant A
session A
customerPackageId B
```

Resultado:

```text
no decrement
no movement
no audit
no outbox
```

---

# 12. Tenant isolation — movement lookup

Tenant A não acessa:

```text
PackageMovement Tenant B
```

---

# 13. Tenant isolation — timeline

`PackageUnitConsumed` Tenant B não pode gerar evento na timeline Tenant A.

Testar mesmo se:

```text
customerId
sessionId
```

forem iguais por fixture.

---

# 14. IDs iguais entre tenants

Essa é uma prova particularmente boa.

Criar:

```text
Tenant A
sessionId = shared-id

Tenant B
sessionId = shared-id
```

Cada um deve consumir independentemente seu pacote.

Isso prova que a unicidade física inclui:

```text
tenant_id
```

e não apenas `session_id`.

---

# 15. Criar gate de isolamento

Adicionar:

```bash
npm run test:package-tenant-isolation
```

---

# 16. Segundo bloco: UnitOfWork failure injection

Esse é o maior bloqueio restante.

Precisamos provar que a mutation não deixa estados parciais.

Criar:

```text
test/workers/package-unit-of-work-failures.spec.ts
```

---

# 17. Invariante local esperada

Para consumo bem sucedido:

```text
CustomerPackage decrement
+
PackageMovement
+
Audit
+
Outbox PackageUnitConsumed
+
Idempotency
```

devem representar **um único efeito lógico**.

---

# 18. Falha antes do decrement

Simular falha antes da mutation.

Esperado:

```text
remaining unchanged
movement = 0
audit = 0
outbox = 0
idempotency success = 0
```

---

# 19. Falha no PackageMovement

Simular:

```text
CustomerPackage statement prepared
PackageMovement write fails
```

Depois verificar D1:

```text
remaining unchanged
movement = 0
audit = 0
outbox = 0
```

Não basta receber exception.

---

# 20. Falha no Audit

Inject:

```text
AuditWriter failure
```

Esperado:

```text
remaining unchanged
movement absent
outbox absent
```

---

# 21. Falha no Outbox

Inject:

```text
OutboxWriter failure
```

Esperado:

```text
remaining unchanged
movement absent
audit absent
```

se Audit e Outbox estão na mesma UnitOfWork.

---

# 22. Falha na idempotência final

Simular:

```text
mutation succeeds logically
IdempotencyStore complete fails
```

Resultado correto deve ser definido pela foundation atual.

A invariável desejável é:

```text
no domain effect without replay-safe identity
```

Se a arquitetura existente não consegue garantir isso, documentar como bloqueio.

Não mascarar.

---

# 23. Validar rollback real no D1

Não testar só via mocks.

Rodar em:

```text
workerd
D1 real
```

e consultar as tabelas após a falha.

---

# 24. Não introduzir transaction fake

Nada de:

```text
try/catch
restore remainingQuantity manually
```

A garantia deve vir da primitive `UnitOfWork`/D1 batch existente.

---

# 25. Testar última unidade com failure injection

Package:

```text
remaining = 1
```

falha em movement/outbox.

Não pode terminar:

```text
remaining = 0
status = COMPLETED
```

parcialmente.

Esperado:

```text
remaining = 1
status = ACTIVE
```

---

# 26. Testar movimento sem decrement

Também nunca pode ocorrer:

```text
PackageMovement CONSUMPTION
balanceBefore=1
balanceAfter=0

CustomerPackage remaining=1
```

---

# 27. Provar `balanceBefore`/`balanceAfter`

No sucesso:

```text
remaining=5
↓
consume
↓
movement.balanceBefore=5
movement.balanceAfter=4
package.remaining=4
```

Esses três fatos precisam coincidir.

---

# 28. Criar gate de Reliability

Adicionar:

```bash
npm run test:package-uow-failures
```

---

# 29. Terceiro bloco: E2E Clinical → Billing → Operations

Criar:

```text
test/workers/package-full-e2e.spec.ts
```

Esse será o teste de liberação final.

---

# 30. O E2E não pode chamar use cases diretamente

Precisa usar o fluxo real:

```text
HTTP
Service Binding
Outbox
D1
```

e não:

```text
new ConsumePackageUnit().execute(...)
```

diretamente.

---

# 31. Cenário completo

Preparar:

```text
Tenant A
Customer C
Service S
Professional P

CustomerPackage CP
remaining=3
status=ACTIVE
valid
```

---

# 32. Criar Appointment

Usar endpoint autoritativo:

```http
POST /tenants/:tenantId/appointments
```

com todos os gates normais.

---

# 33. Associar pacote

Usar:

```http
POST /tenants/:tenantId/appointments/:appointmentId/package
```

Validar persistência:

```text
customer_package_id = CP
settlement_source = PACKAGE
```

---

# 34. Confirmar Appointment

Fluxo normal:

```text
AWAITING_CONFIRMATION
→ CONFIRMED
```

ou deposit flow quando fixture exigir.

---

# 35. Check-in

```text
CONFIRMED
→ CHECKED_IN
```

---

# 36. StartSession

Clinical:

```text
POST .../session/start
```

Session result:

```text
IN_PROGRESS
customerPackageId = CP
```

Esse ponto deve ser assertado diretamente.

---

# 37. Satisfazer technical completion requirements

Adicionar apenas o mínimo necessário:

```text
technical values
power
equipment
photos
```

conforme fixture/Service requirements.

Não usar bypass de eligibility.

---

# 38. CompleteSession

Executar:

```http
POST /tenants/:tenantId/sessions/:sessionId/complete
```

Resultado:

```text
Session COMPLETED
```

---

# 39. Provar `PackageConsumptionRequested`

Clinical Outbox deve conter:

```text
PackageConsumptionRequested
```

com:

```text
sessionId
customerPackageId
customerId
serviceId
```

---

# 40. Dispatcher Clinical

Executar delivery real:

```text
Clinical → BILLING_SERVICE
```

Billing deve processar:

```text
ConsumePackageUnit
```

---

# 41. Estado Billing esperado

```text
CustomerPackage remaining:
3 → 2

status:
ACTIVE

PackageMovement:
CONSUMPTION = 1
sessionId = Session X
```

---

# 42. Provar `PackageUnitConsumed`

Billing Outbox:

```text
PackageUnitConsumed
```

---

# 43. Dispatcher Billing

Executar:

```text
Billing → OPERATIONS_SERVICE
```

---

# 44. Estado Operations esperado

Customer timeline:

```text
SESSION_COMPLETED = 1
PACKAGE_CONSUMED = 1
```

Appointment:

```text
COMPLETED
```

---

# 45. Resultado consolidado

Ao final:

```text
Appointment        COMPLETED
Session            COMPLETED
Package remaining  2
Package movement   1
SESSION_COMPLETED  1
PACKAGE_CONSUMED   1
```

---

# 46. E2E sem pacote

Criar outro teste:

```text
same flow
without AssignPackageToAppointment
```

Esperado:

```text
Session COMPLETED
Appointment COMPLETED

PackageConsumptionRequested = 0
PackageMovement = 0
PACKAGE_CONSUMED = 0
```

Isso prova que o pacote nunca é inferido automaticamente.

---

# 47. E2E assignment inválido

Tentar package errado antes de StartSession.

Fluxo deve parar no assignment.

Nenhuma Session precisa ser criada.

---

# 48. E2E replay completo

Reentregar:

```text
PackageConsumptionRequested
```

várias vezes.

Depois:

```text
PackageUnitConsumed
```

várias vezes.

Estado final continua:

```text
remaining=2
movement=1
timeline PACKAGE_CONSUMED=1
```

---

# 49. ACK-loss Clinical → Billing

Simular:

```text
Clinical Outbox PROCESSING
Billing consumes successfully
Clinical fails before mark SENT
```

Depois lease/retry.

Billing deve responder semanticamente como replay.

---

# 50. Assert final

```text
remaining decremented once
movements = 1
```

---

# 51. ACK-loss Billing → Operations

Simular:

```text
Operations timeline applied
Billing fails before SENT
```

Depois retry.

Timeline continua uma linha.

---

# 52. Lease recovery

Se o Outbox PR-14 suporta:

```text
PROCESSING + expired lease
→ reclaim
```

provar isso em pelo menos um dos dois saltos.

---

# 53. Não criar framework novo de Outbox

Reusar exatamente:

```text
DispatchOutboxBatch
lease
retry
dead-letter semantics
```

já consolidados.

---

# 54. Revisit `PackageUnitConsumed` routing

O PR-23.2 corrigiu o dispatcher Billing.

Agora o E2E precisa provar que essa correção funciona fisicamente.

---

# 55. Quarto bloco: failure after assignment

Ainda deve permanecer explícito.

Testar dois cenários.

---

# 56. Package expira depois do assignment

Fluxo:

```text
assign CP when valid
StartSession
advance clock
CP expires
CompleteSession
```

Billing consumption:

```text
BLOCKED / reconciliation required
```

---

# 57. Estado final esperado

```text
Session = COMPLETED
Appointment = COMPLETED

Package remaining unchanged
PackageMovement = 0
```

O erro de consumo deve ser observável.

---

# 58. Não fazer rollback clínico

Não voltar:

```text
Session COMPLETED → IN_PROGRESS
```

---

# 59. Não criar receivable

Ainda não temos PR-24.

Esse caso deve produzir algo equivalente a:

```text
PACKAGE_CONSUMPTION_RECONCILIATION_REQUIRED
```

ou estado de outbox permanent failure bem classificado.

---

# 60. Package esgotado depois do assignment

Cenário:

```text
CP remaining=1

Appointment A assigned CP
Appointment B assigned CP

B completes first
→ remaining=0

A completes later
```

Resultado A:

```text
consumption blocked
Session remains COMPLETED
```

---

# 61. Esse cenário é esperado sem reservation

O gate pode passar desde que:

```text
balance not corrupted
error explicit
state observable
no silent fallback
```

---

# 62. Atualizar ADR/plan

Registrar claramente:

```text
Assignment is not reservation.

Package eligibility is revalidated at consumption.

Package availability may change after assignment.

No reservation is implemented.

Failure after completion requires financial/commercial reconciliation.
```

Esse ponto será importante no PR-24.

---

# 63. Quinto bloco: query safety

A qualificação final deve revisar queries de package.

Usar `EXPLAIN QUERY PLAN` para:

```text
find package by tenant + id

find active customer packages
by tenant + customer + service

find consumption by tenant + session + type

list movements
```

---

# 64. Nenhum scan desnecessário

Especialmente a query de consumo duplicado deve usar índice/unique constraint.

---

# 65. Listagem paginada

Se há endpoint público:

```text
GET customer packages
GET package movements
```

garantir:

```text
cursor
limit
```

---

# 66. Não usar R2/KV/Queue

O PR continua:

```text
D1
Service Bindings
Outbox
```

somente.

---

# 67. Criar gate agregado final

Adicionar:

```bash
npm run gate:package-final-qualification
```

Esse gate deve incluir:

```text
package concurrency
tenant isolation
UoW failures
full E2E
ACK-loss
query safety
```

---

# 68. Atualizar `gate:pr23.3`

```bash
npm run gate:pr23.3
```

Idealmente:

```text
gate:pr23.2
+
gate:package-final-qualification
+
dry-runs
```

---

# 69. Não liberar Payment com testes parciais

Formalizar:

```text
gate:pr23.3 != PASS
→ PackageReadyForPayment = BLOCKED
→ PR-24 BLOCKED
```

---

# 70. Readiness final

Atualizar:

```text
docs/plans/package-ready-for-payment.md
```

---

# 71. Matriz de readiness

Deve ficar assim:

```text
Package Assignment
------------------
HTTP                           PASS
Billing Eligibility RPC        PASS
Tenant Isolation               PASS
Customer Match                 PASS
Service Match                  PASS
Expiry                         PASS
Balance                        PASS
Late Mutation Block            PASS

Session Propagation
-------------------
Appointment Package Ref        PASS
SessionStartContext            PASS
Session Snapshot               PASS
Snapshot Immutability          PASS

Physical Consumption
--------------------
CAS                            PASS
No Negative Balance            PASS
One Unit Per Session           PASS
Cross-Package Same Session     PASS
Package Completion             PASS

Reliability
-----------
Balance + Movement Atomic      PASS
Audit Atomic                   PASS
Outbox Atomic                  PASS
Idempotency Atomic             PASS

Cross Worker
------------
Clinical → Billing             PASS
Billing → Operations           PASS

Delivery Semantics
------------------
Replay Clinical→Billing        PASS
ACK-loss Clinical→Billing      PASS
Replay Billing→Operations      PASS
ACK-loss Billing→Operations    PASS
Lease Recovery                 PASS

E2E
---
Package-funded Session         PASS
Non-package Session            PASS

Tenant
------
Cross-tenant Assignment        PASS
Cross-tenant Consumption       PASS
Cross-tenant Timeline          PASS

Known Limitation
----------------
Reservation                    NOT_IMPLEMENTED
Post-assignment availability   REVALIDATED ON CONSUMPTION
```

---

# 72. Critério de PASS mesmo sem reservation

`PackageReadyForPayment` pode ser `PASS` se:

```text
reservation = NOT_IMPLEMENTED
```

desde que isso seja uma **limitação aceita e documentada**, e que falhas de consumo posteriores sejam:

```text
deterministic
observable
non-corrupting
```

O readiness significa:

> o domínio de pacote é seguro o suficiente para o financeiro integrar-se a ele.

Não significa que toda feature futura de pacote foi implementada.

---

# 73. RN-PAC final

Esperado:

```text
RN-PAC-001 PASS
RN-PAC-002 PASS
RN-PAC-003 PASS
RN-PAC-004 PASS + physical proof
RN-PAC-005 PASS + physical proof
RN-PAC-006 PASS
RN-PAC-007 PASS + regression proof
RN-PAC-008 PASS + physical traceability
```

---

# 74. RN-CONC-002

Depois deste PR:

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

---

# 75. Testes mínimos que precisam aparecer no relatório

No mínimo, números concretos de:

```text
package concurrency iterations

total attempts

successful consumptions

blocked consumptions

negative balances

duplicate movements

cross-tenant leaks

UnitOfWork injected failures

ACK-loss retries

E2E passes
```

---

# 76. Exemplo de relatório esperado

Não fixe esses números antes de rodar, mas o formato deve ser algo assim:

```text
Package Physical Safety

Concurrency
iterations: 50
attempts: 100
successes: 50
blocked: 50
negativeBalances: 0
duplicateMovements: 0

High Contention
initialBalance: 25
attempts: 100
successes: 25
blocked: 75
remaining: 0

Same Session
sameEvent: PASS
differentEvent: PASS
differentKey: PASS
differentPackage: PASS
movements: 1

Tenant Isolation
assignmentLeaks: 0
consumptionLeaks: 0
timelineLeaks: 0

UnitOfWork
movementFailure: PASS
auditFailure: PASS
outboxFailure: PASS
idempotencyFailure: PASS

Cross Worker
Clinical→Billing: PASS
Billing→Operations: PASS

ACK Loss
Clinical→Billing: PASS
Billing→Operations: PASS

E2E
package-funded: PASS
non-package: PASS
```

---

# 77. Definition of Done — Tenant isolation

```text
[ ] PackageDefinition tenant-safe
[ ] CustomerPackage tenant-safe
[ ] eligibility tenant-safe
[ ] assignment tenant-safe
[ ] Session package snapshot tenant-safe
[ ] consumption tenant-safe
[ ] movement tenant-safe
[ ] timeline tenant-safe
[ ] identical IDs across tenants tested
```

---

# 78. Definition of Done — UnitOfWork

```text
[ ] movement failure causes no decrement

[ ] audit failure causes no decrement

[ ] outbox failure causes no decrement

[ ] idempotency failure does not leave unsafe partial state

[ ] last-unit failure does not mark package COMPLETED

[ ] balanceBefore/After match persisted balance
```

---

# 79. Definition of Done — Full E2E

```text
[ ] CreateAppointment

[ ] AssignPackageToAppointment

[ ] Confirm

[ ] CheckIn

[ ] StartSession

[ ] Session snapshots package

[ ] CompleteSession

[ ] PackageConsumptionRequested

[ ] Billing consumes exactly once

[ ] PackageUnitConsumed

[ ] Operations timeline PACKAGE_CONSUMED

[ ] Appointment COMPLETED

[ ] Session COMPLETED
```

---

# 80. Definition of Done — Replay

```text
[ ] same PackageConsumptionRequested 20x → one movement

[ ] different eventIds for same Session → one movement

[ ] same PackageUnitConsumed 20x → one timeline event

[ ] replay does not alter remaining balance twice
```

---

# 81. Definition of Done — ACK loss

```text
[ ] Clinical→Billing ACK loss

[ ] Billing→Operations ACK loss

[ ] redelivery safe

[ ] lease recovery safe

[ ] final event SENT

[ ] no duplicate business effect
```

---

# 82. Definition of Done — failure after assignment

```text
[ ] expiry after assignment

[ ] exhaustion after assignment

[ ] Session not rolled back

[ ] package not corrupted

[ ] no movement on rejected consumption

[ ] reconciliation result observable

[ ] no automatic Payment fallback
```

---

# 83. Definition of Done — Free Tier

```text
[ ] no Queue

[ ] no KV

[ ] no R2

[ ] no Cron

[ ] no polling

[ ] indexed bounded D1 reads

[ ] Service Bindings only

[ ] concurrency proof does not require production resources
```

---

# 84. Definition of Done — regression

```text
[ ] PR-21 PASS
[ ] PR-22 PASS
[ ] PR-23 PASS
[ ] PR-23.1 PASS
[ ] PR-23.2 PASS

[ ] standard non-package flow PASS
[ ] package assignment PASS
[ ] package consumption PASS
[ ] timeline PASS
```

---

# 85. Comandos finais

Executar:

```bash
npm run lint
npx tsc --build --force

npm run test
npm run test:workers

npm run test:package-concurrency
npm run test:package-tenant-isolation
npm run test:package-uow-failures

npm run gate:package-physical-safety
npm run gate:package-final-qualification

npm run gate:pr23.2
npm run gate:pr23.3

npm run workers:dry-run
git diff --check
```

Tudo deve:

```text
PASS
```

---

# 86. Não aceitar `PackageReadyForPayment = PASS` sem o E2E

Mesmo que:

```text
unit
lint
typecheck
concurrency
```

passem, se ainda não estiver provado:

```text
Clinical
→ Billing
→ Operations
```

fisicamente, o readiness continua:

```text
BLOCKED
```

---

# 87. Relatório pós-implementação obrigatório

O Codex deve terminar aproximadamente assim:

```text
PR-23.3 — Package Final Physical Qualification

Baseline
PR23:
PR23.1:
PR23.2:

Tenant Isolation
definitions:
customer packages:
eligibility:
assignment:
session snapshot:
consumption:
movements:
timeline:
leaks:

UnitOfWork Failure Injection
movement failure:
audit failure:
outbox failure:
idempotency failure:
last-unit failure:
partial states:

Concurrency
iterations:
attempts:
successes:
blocked:
negative balances:
duplicate movements:

Single Session
same event:
different event:
different key:
different package:

Cross Worker E2E
CreateAppointment:
AssignPackage:
StartSession:
Session snapshot:
CompleteSession:
PackageConsumptionRequested:
Billing consumption:
PackageUnitConsumed:
Operations timeline:

Non-Package E2E
package requests:
movements:
timeline:

Replay
Clinical→Billing:
Billing→Operations:

ACK Loss
Clinical→Billing:
Billing→Operations:
lease recovery:

Failure After Assignment
expired:
exhausted:
Session state:
Package state:
reconciliation:

Query Safety
eligibility:
consumption uniqueness:
movements:
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

Quality
unit:
workers:
package concurrency:
tenant isolation:
UoW failures:
lint:
typecheck:
dry-runs:
PR23.3 gate:

Remaining blockers:

Next PR:
```

---

# 88. Próximo PR após `PackageReadyForPayment = PASS`

Aí sim o próximo PR correto será:

# PR-24 — Receivable + Payment + Ledger Foundation

Eu dividiria o PR-24 em uma base financeira muito clara:

```text
Receivable
    │
    ├── gross amount
    ├── confirmed deposit
    ├── package settlement context
    └── outstanding balance
            │
            ▼
Payment
    ├── CASH
    ├── PIX
    ├── DEBIT_CARD
    ├── CREDIT_CARD
    ├── TRANSFER
    └── INTERNAL_CREDIT
            │
            ▼
LedgerMovement
    ├── RECEIVABLE_CREATED
    ├── PAYMENT_RECEIVED
    ├── DEPOSIT_APPLIED
    ├── REFUND
    └── CREDIT
```

Mas **nenhum desses conceitos deve entrar no PR-23.3**.

A prioridade agora é fechar definitivamente a fundação de pacote. O relatório atual já mostra que CAS, replay básico e Billing→Operations estão funcionando; o que falta é provar que isso continua correto **sob isolamento multi-tenant, falhas intermediárias da UnitOfWork e no fluxo real completo Clinical→Billing→Operations**. Quando essas três provas estiverem verdes, o `PackageReadyForPayment` finalmente poderá mudar de `BLOCKED` para `PASS`, e o PR-24 estará tecnicamente liberado.
