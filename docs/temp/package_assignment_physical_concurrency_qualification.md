Considerando o estado pós-PR-23, eu **não iniciaria imediatamente o PR-24 de Payment**.

O PR-23 implementou o núcleo correto, porém deixou duas lacunas diretamente relacionadas às invariantes que o próprio domínio de pacotes precisa garantir antes de virar dependência do financeiro:

```text
1. concorrência física de consumo ainda não provada;
2. associação pública/autoritativa Package → Appointment ainda não fechada.
```

Como `Payment` passará a depender desses estados comerciais, avançar agora criaria uma fundação financeira sobre um fluxo de pacote ainda parcialmente qualificado.

Portanto, o próximo PR deveria ser:

# PR-23.1 — Package Assignment + Physical Concurrency Qualification

O objetivo é sair de:

```text
Package Domain          IMPLEMENTED
Package Consumption     IMPLEMENTED
CAS                     IMPLEMENTED
Business uniqueness     IMPLEMENTED

Physical concurrency    PENDING
Appointment association PARTIAL
```

para:

```text
Package Domain          QUALIFIED
Package Assignment      AUTHORITATIVE
Package Consumption     PHYSICALLY PROVEN
Session integration     PHYSICALLY PROVEN

PackageReadyForPayment = PASS
```

Somente então:

```text
PR-24 — Payment + Receivable Ledger
```

deve começar.

---

# 1. Objetivo formal

O PR-23.1 deve comprovar fisicamente quatro propriedades:

```text
A. Um Appointment só usa pacote explicitamente selecionado.

B. Um pacote nunca fica com saldo negativo.

C. Uma mesma Session nunca consome duas unidades.

D. Concorrência entre Sessions diferentes respeita o saldo disponível.
```

Além disso:

```text
package-funded Appointment
```

precisa possuir uma referência autoritativa e historicamente congelada antes de chegar à conclusão da Session.

---

# 2. Baseline obrigatória

Antes de alterar código:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr21
npm run gate:pr22
npm run gate:pr23
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

Esperado:

```text
PR21 PASS
PR22 PASS
PR23 PASS

lint PASS
typecheck PASS
unit PASS
workers PASS
dry-run PASS
```

O PR-23.1 não deve corrigir regressões antigas escondendo-as em novos testes.

---

# 3. Criar documento do PR

Criar:

```text
docs/plans/PR-23.1-package-assignment-physical-qualification.md
```

Com:

```text
Objective
Current gaps
Package assignment authority
Appointment settlement source
Package eligibility
Assignment lifecycle
Session snapshot propagation
Package consumption invariants
Physical concurrency proofs
Replay / ACK-loss
Tenant isolation
Historical safety
Free-tier impact
Definition of Done
Out of scope
```

---

# 4. Registrar explicitamente o readiness gate

No documento:

```text
PackageReadyForPayment
```

com resultado:

```text
PASS
BLOCKED
```

O `PR-24` só poderá começar se:

```text
PackageReadyForPayment = PASS
```

---

# 5. Primeiro gap: associação Package → Appointment

Hoje existe:

```text
customerPackageId
```

na Session/contratos, mas o relatório informa que a associação pública ao Appointment não foi exposta.

Isso precisa ser resolvido antes do financeiro.

O fluxo correto deve ser:

```text
Reception/Admin
      ↓
Appointment
      ↓
select CustomerPackage
      ↓
Billing validates package
      ↓
Operations persists package reference
      ↓
StartSession
      ↓
Session snapshots package reference
      ↓
CompleteSession
      ↓
PackageConsumptionRequested
```

---

# 6. Não selecionar pacote automaticamente

Continuar proibindo:

```text
SELECT first ACTIVE package
WHERE customer = ?
AND service = ?
```

para decidir consumo.

O usuário/sistema precisa ter escolhido explicitamente:

```text
customerPackageId
```

antes.

---

# 7. Criar `AssignPackageToAppointment`

No Operations Worker:

```bash
nest g service \
  appointments/application/assign-package-to-appointment \
  --project operations-worker
```

Responsabilidades:

```text
load Appointment tenant-aware
↓
validate mutable commercial state
↓
call Billing package eligibility
↓
READY?
↓
persist customerPackageId
↓
persist settlementSource=PACKAGE
↓
Audit
↓
Idempotency
```

---

# 8. Não permitir associação depois de início técnico

Definir estados permitidos explicitamente.

Em princípio, associação comercial deve ocorrer antes de:

```text
CHECKED_IN
IN_PROGRESS
COMPLETED
```

Uma regra segura seria permitir somente enquanto Appointment ainda está em um estado comercial pré-atendimento apropriado.

Não inventar livremente a lista: usar a FSM atual.

Mas obrigatoriamente:

```text
IN_PROGRESS → package assignment BLOCKED
COMPLETED   → package assignment BLOCKED
```

---

# 9. Não permitir alteração retroativa

Depois que Session começou:

```text
customerPackageId
```

fica congelado.

Não fazer:

```text
Package A
↓ session starts
change Appointment to Package B
```

Isso quebraria a rastreabilidade.

---

# 10. Criar endpoint administrativo

Sugestão:

```http
POST /tenants/:tenantId/appointments/:appointmentId/package
```

Body:

```json
{
  "customerPackageId": "..."
}
```

Pode também usar `PUT`, se a convenção atual tratar a associação como recurso singular.

O importante é não criar endpoint genérico:

```http
PATCH /appointments/:id
{
  "customerPackageId": "..."
}
```

que bypassa a regra comercial.

---

# 11. Permissão explícita

Usar algo como:

```text
appointment.package.assign
```

somente se não existir equivalente canônico.

Esse é um comando comercial/operacional.

Não deve depender de:

```text
session.start
```

---

# 12. Idempotency-Key

A associação é mutação importante.

Primeira chamada:

```text
Appointment
package = null
→ package A
```

Replay:

```text
package A
→ same logical result
```

Same key + Package B:

```text
IDEMPOTENCY_KEY_CONFLICT
```

---

# 13. Criar RPC Billing de elegibilidade

Se ainda não estiver exposto formalmente:

```text
checkPackageUsageEligibility()
```

ou nomenclatura equivalente.

Request:

```text
tenantId
customerPackageId
customerId
serviceId
appointmentId?
correlationId
```

---

# 14. Resultado estruturado

```text
READY
```

ou:

```text
BLOCKED
reason
```

Possíveis razões já deriváveis do domínio:

```text
PACKAGE_NOT_FOUND
PACKAGE_INACTIVE
PACKAGE_EXPIRED
PACKAGE_COMPLETED
PACKAGE_CANCELED
PACKAGE_BALANCE_EXHAUSTED
PACKAGE_CUSTOMER_MISMATCH
PACKAGE_SERVICE_MISMATCH
```

Sem mensagens como contrato.

---

# 15. Package eligibility deve validar saldo

No assignment:

```text
remainingQuantity > 0
```

obrigatório.

Isso não reserva a unidade, mas evita vincular pacote que já está claramente inválido.

---

# 16. Validar validade temporal

Mesmo se status estiver:

```text
ACTIVE
```

mas:

```text
validUntil < now
```

retornar:

```text
BLOCKED
PACKAGE_EXPIRED
```

---

# 17. Não consumir no assignment

Regra central:

```text
AssignPackageToAppointment
≠
ConsumePackageUnit
```

A unidade só é consumida por:

```text
SessionCompleted
```

conforme a regra já implementada.

---

# 18. Não reservar unidade neste PR

A menos que o código existente já tenha introduzido reservation.

Não precisamos criar:

```text
RESERVED
CONSUMED
RELEASED
```

agora.

A qualificação física deve provar exatamente a semântica implementada no PR-23:

```text
consumption-at-completion + CAS
```

Se essa abordagem mostrar uma inconsistência inaceitável, aí sim abrir nova decisão arquitetural.

---

# 19. Settlement source precisa ser explícito

O Appointment precisa distinguir pelo menos conceitualmente:

```text
STANDARD
PACKAGE
```

Não porque isso seja Payment ainda, mas porque CommercialTerms e futuro ledger precisam saber se aquela Session:

```text
gera cobrança própria
```

ou:

```text
é coberta por pacote
```

---

# 20. Inspecionar antes de criar coluna

Pesquisar:

```bash
grep -R "settlement" apps libs database -n || true
grep -R "customerPackageId" apps libs database -n
```

Se já existe campo equivalente:

```text
paymentSource
commercialSource
billingSource
coverageSource
```

reutilizar.

Não duplicar conceito.

---

# 21. Se necessário, criar migration `0018`

Somente se o Appointment ainda não persiste adequadamente:

```text
customer_package_id
settlement_source
```

Então:

```text
0018_package_assignment_qualification.sql
```

Mas se PR-23 já adicionou essas colunas, **não criar migration vazia**.

---

# 22. Não criar FK cross-bounded-context como substituição de regra

Mesmo que D1 seja fisicamente compartilhado:

```text
Appointment → CustomerPackage
```

é integração Operations/Billing.

A validação continua sendo feita via Billing contract.

---

# 23. Snapshot no StartSession

O PR-16 já possui:

```text
getSessionStartContext
```

O PR-23 adicionou `customerPackageId` à Session.

Agora provar o fluxo físico:

```text
Appointment.package = A
      ↓
getSessionStartContext
      ↓
customerPackageId = A
      ↓
StartSession
      ↓
Session.customerPackageId = A
```

---

# 24. Não consultar Appointment novamente no CompleteSession

Depois que Session começou:

```text
Session.customerPackageId
```

é o snapshot autoritativo.

Se Appointment for alterado indevidamente depois, isso não deve mudar a Session.

Idealmente a alteração já é bloqueada.

---

# 25. Teste histórico

```text
Appointment → Package A
StartSession → snapshot A
```

Depois tentar modificar Appointment para B.

Esperado:

```text
BLOCKED
```

Session continua:

```text
A
```

---

# 26. Package-funded Appointment não deve sofrer novo desconto

Esse ponto merece prova física.

Quando:

```text
settlementSource = PACKAGE
```

o fluxo não deve executar novamente:

```text
DiscountPolicy
DepositPolicy
```

para criar uma segunda cobrança da prestação.

---

# 27. Cuidado com PR-12

Não necessariamente precisamos reescrever toda `CreateAppointment`.

Mas o estado comercial precisa ser coerente.

Se package assignment acontece após criação de Appointment que já congelou `CommercialTerms STANDARD`, documentar claramente como esses snapshots são tratados.

---

# 28. Melhor evolução, se necessária

Permitir `customerPackageId` já em:

```http
POST /tenants/:tenantId/appointments
```

de forma opcional.

Fluxo:

```text
CreateAppointment
↓
customerPackageId?
├── no  → normal CommercialTerms
└── yes → package eligibility
          settlementSource=PACKAGE
```

---

# 29. Mas evite duplicar dois fluxos

Não criar:

```text
CreatePackageAppointment
CreateNormalAppointment
```

O mesmo `CreateAppointment` deve compor estratégias diferentes.

---

# 30. `CommercialTerms` não deve ser chamado para desconto adicional

Para Package:

```text
CustomerPackage
```

já possui:

```text
basePriceCents
discountCents
finalPriceCents
```

congelados na compra.

O Appointment pode preservar um valor de referência, mas não recalcular desconto.

---

# 31. Não definir `finalPrice = 0` silenciosamente

Melhor representar:

```text
settlementSource = PACKAGE
```

do que apagar o valor econômico do serviço.

Isso será importante no futuro:

```text
reports
revenue allocation
package accounting
```

---

# 32. Não implementar revenue allocation agora

Isso pertence ao financeiro.

---

# 33. Agora o principal: suíte de concorrência física

Criar arquivo dedicado:

```text
test/workers/package-consumption-concurrency.spec.ts
```

Esse teste é obrigatório antes do PR-24.

---

# 34. Cenário A — saldo 1, duas Sessions

Fixture:

```text
CustomerPackage
remainingQuantity = 1
status = ACTIVE
valid
```

Duas Sessions distintas:

```text
Session A
Session B
```

executam consumo concorrente.

Esperado:

```text
successful consumptions = 1
rejected consumptions = 1

remainingQuantity = 0
status = COMPLETED

PackageMovements = 1

negative balance = 0
```

---

# 35. Rodar múltiplas iterações

Não fazer uma única corrida.

Por exemplo:

```text
20 iterations
2 concurrent attempts each
```

Resultado esperado:

```text
20 packages exhausted correctly
20 movements
20 successful consumptions
20 blocked attempts
0 negative balances
```

---

# 36. Cenário B — saldo 10, dez Sessions

Fixture:

```text
remainingQuantity = 10
```

Disparar:

```text
10 Session consumption requests concurrently
```

Esperado:

```text
success = 10
remaining = 0
movements = 10
status = COMPLETED
```

---

# 37. Adicionar 11ª tentativa

```text
11 concurrent distinct Sessions
remaining = 10
```

Resultado:

```text
success = 10
blocked = 1
remaining = 0
movements = 10
```

Nunca 11.

---

# 38. Cenário C — mesma Session, mesmas keys

```text
same session
same event
same idempotency key
```

100 replays.

Resultado:

```text
movement = 1
balance decrement = 1
```

---

# 39. Cenário D — mesma Session, keys diferentes

Esse é ainda mais importante.

```text
Session X
eventId A
eventId B
idempotencyKey A
idempotencyKey B
```

concorrentes.

Resultado:

```text
movement = 1
decrement = 1
```

Isso prova a business uniqueness:

```text
tenant + session + CONSUMPTION
```

---

# 40. Cenário E — mesma Session contra dois Packages

Se a constraint do PR-23 foi realmente global por Session:

```text
Session X
Package A
Package B
```

tentam consumir.

Resultado:

```text
total package consumptions for Session X = 1
```

Se hoje a constraint permite dois, isso é uma discrepância importante e precisa ser corrigida antes do PR-24.

---

# 41. Cenário F — dois tenants

Tenant A e Tenant B podem ter:

```text
same sessionId
same idempotency key
```

sem colisão.

Resultado:

```text
independent consumption
```

---

# 42. Cenário G — saldo não negativo sob carga

Criar um teste de stress controlado:

```text
initial balance = 25
concurrent sessions = 100
```

Esperado:

```text
success = 25
blocked = 75
remaining = 0
movements = 25
negative = 0
```

Esse é o proof principal de `RN-PAC-004`.

---

# 43. Não usar mutex JS

Proibido resolver teste com:

```ts
Mutex
Semaphore
Map locks
```

A garantia precisa vir de:

```text
D1
CAS
constraints
UnitOfWork
```

---

# 44. Testar o CAS real

O test deve rodar em:

```text
workerd
+
D1 real do harness
```

Não apenas repository fake.

---

# 45. Provar atomicidade do movimento

Simular falha entre:

```text
balance decrement
```

e:

```text
PackageMovement insert
```

Resultado correto:

```text
both committed
or neither committed
```

Nunca:

```text
remaining decremented
movement absent
```

---

# 46. Provar falha de Audit

Se `Audit` falhar e ele faz parte da UnitOfWork:

```text
package decrement must not persist
```

de acordo com o padrão atual de reliability.

---

# 47. Provar falha de Outbox

Mesma coisa para:

```text
PackageUnitConsumed
```

se o evento é obrigatório para timeline.

Não pode existir:

```text
package consumed
but no integration fact
```

---

# 48. Replay depois de timeout

Simular:

```text
Billing commits consumption
caller times out
```

Caller repete.

Resultado:

```text
same logical consumption
```

---

# 49. ACK-loss cross-worker

Fluxo:

```text
Billing
Package consumed
Outbox PackageUnitConsumed
↓
Operations
timeline updated
↓
Billing mark SENT fails
```

Depois redelivery:

```text
Operations REPLAY
timeline rows = 1
```

---

# 50. Timeline deve preservar balance movement

Se o contrato permite expor saldo:

```text
balanceBefore
balanceAfter
```

pode estar no evento/timeline com permission adequada.

Não vazar isso para perfis sem acesso financeiro/comercial.

---

# 51. Verificar `PackageConsumptionRequested`

O fluxo Clinical → Billing deve ser provado com Service Binding real:

```text
SessionCompleted
↓
PackageConsumptionRequested
↓
Billing
↓
ConsumePackageUnit
```

não chamando use case diretamente no teste E2E principal.

---

# 52. Teste E2E completo com pacote

Fluxo:

```text
CustomerPackage ACTIVE
remaining=3
        ↓
Create/prepare Appointment
        ↓
Assign Package
        ↓
Confirm
        ↓
CheckIn
        ↓
StartSession
        ↓
Session snapshots package
        ↓
CompleteSession
        ↓
PackageConsumptionRequested
        ↓
Billing
        ↓
remaining=2
        ↓
PackageUnitConsumed
        ↓
Operations Timeline
```

Resultado final:

```text
Session COMPLETED
Appointment COMPLETED
Package remaining=2
Movement CONSUMPTION=1
Timeline PACKAGE_CONSUMED=1
```

---

# 53. E2E sem pacote

Executar o mesmo fluxo sem:

```text
customerPackageId
```

Resultado:

```text
Session COMPLETED
Appointment COMPLETED

PackageConsumptionRequested = 0
PackageMovement = 0
```

Isso impede consumo acidental.

---

# 54. Package expirado antes da Session

Assignment:

```text
BLOCKED
```

---

# 55. Package expira após assignment mas antes de completion

Isso precisa ser testado explicitamente.

Fluxo:

```text
Appointment assigned Package A
Package valid

time advances

Session completes after validUntil
```

Billing:

```text
consumption BLOCKED
```

Mas Session já está COMPLETED.

Isso produz estado de reconciliação financeira/comercial pendente.

---

# 56. Não esconder esse cenário

Documentar resultado como:

```text
PACKAGE_CONSUMPTION_REJECTED_EXPIRED
```

e preservar evento/diagnóstico.

Isso prova uma limitação real do modelo sem reservation.

---

# 57. Isso é importante para PR-24

Payment/ledger precisará lidar com:

```text
session completed
package settlement failed
```

por exemplo criando receivable padrão ou fluxo de reconciliação — **mas isso não deve ser inventado no PR-23.1**.

Apenas evidenciar o cenário.

---

# 58. Package saldo consumido por outra Session

Mesmo:

```text
Appointment A assigned package with balance 1
Appointment B assigned same package
```

Se B conclui primeiro:

```text
A completion later → PACKAGE_BALANCE_EXHAUSTED
```

Isso é comportamento correto com CAS atual.

---

# 59. Registrar a limitação de pre-reservation

No ADR/plan:

```text
Package selection does not reserve inventory.

Authoritative consumption occurs at Session completion.

Therefore package eligibility may change between assignment and completion.

The system fails closed at consumption time.

Pre-reservation is intentionally not implemented in PR-23.1.
```

Isso é essencial para não fingir guarantees inexistentes.

---

# 60. Não criar reservation sem necessidade

Apenas abrir um futuro ADR/PR se a regra negocial exigir que a unidade fique garantida desde o Appointment.

---

# 61. Criar endpoint de leitura de elegibilidade

Pode ser útil para recepção:

```http
GET /tenants/:tenantId/customers/:customerId/packages?serviceId=...
```

retornando somente pacotes utilizáveis.

Mas o `POST assign` precisa revalidar autoritativamente.

---

# 62. Não confiar na lista anterior

```text
GET eligible packages
↓
user waits 5 minutes
↓
POST assign
```

O POST reexecuta Billing eligibility.

---

# 63. Pagination

Lista de CustomerPackages:

```text
limit
cursor
```

sempre.

---

# 64. Free-tier

A seleção deve exigir algo como:

```text
Operations request
→ one Billing Service Binding
→ one indexed D1 lookup
→ one Operations mutation
```

Sem scans.

---

# 65. Index de elegibilidade

Verificar query plan para:

```text
tenant
customer
service
status
validUntil
remainingQuantity
```

Não criar índice enorme sem necessidade.

---

# 66. Não usar KV para pacote

Saldo é mutable e crítico.

D1 continua autoridade.

---

# 67. Não usar Queue

Outbox + Service Binding continua suficiente.

---

# 68. Não usar Cron

Expiry continua lazy/time-aware.

---

# 69. Audit assignment

Registrar:

```text
AppointmentPackageAssigned
```

com:

```text
tenantId
appointmentId
customerPackageId
actorId
correlationId
```

Sem valores comerciais detalhados desnecessários.

---

# 70. Não gerar Outbox para assignment sem consumidor

A Session obtém package reference via Operations context.

Não precisa evento só por simetria.

---

# 71. Package assignment deve ser único

Appointment pode ter:

```text
0..1 customerPackageId
```

no MVP.

Não permitir:

```text
Package A + Package B
```

simultaneamente.

---

# 72. Troca de pacote antes da Session

Se o produto permitir, precisa ser operação explícita e auditada.

Não assuma que:

```text
POST package B
```

substitui A silenciosamente.

---

# 73. Minha recomendação para este PR

Não implementar troca.

Depois de Package A atribuído:

```text
new Package B
→ APPOINTMENT_PACKAGE_ALREADY_ASSIGNED
```

até existir um comando explícito:

```text
ReplaceAppointmentPackage
```

com regras.

Isso reduz ambiguidade.

---

# 74. Não remover package association silenciosamente

Sem:

```text
DELETE /appointment/package
```

neste PR, salvo regra existente.

---

# 75. Package materialization também merece prova física

Como o relatório fala em "materialização autorizada", testar:

```text
same sourceOperationId
```

duas vezes.

Resultado:

```text
CustomerPackages = 1
```

---

# 76. Commercial snapshot immutability

Depois da materialização:

```text
base
discount
final
quantity
validity
```

não mudam se PackageDefinition for atualizada.

---

# 77. Teste de double discount

Materializar:

```text
base=10000
discount=2000
final=8000
```

Consumir uma Session.

Esperado:

```text
Package snapshot unchanged
DiscountPolicy calls during consume = 0
```

---

# 78. Não criar Payment para materialization

Ainda fora.

O teste pode usar:

```text
authorized source fixture
```

e registrar que settlement financeiro virá depois.

---

# 79. Criar gate específico

Adicionar:

```bash
npm run gate:package-physical-safety
```

ou diretamente incorporar em:

```bash
npm run gate:pr23.1
```

Eu criaria ambos:

```text
test:package-concurrency
gate:package-physical-safety
gate:pr23.1
```

---

# 80. `test:package-concurrency`

Executa apenas:

```text
D1/workerd package concurrency proofs
```

para debugging rápido.

---

# 81. `gate:package-physical-safety`

Deve provar:

```text
CAS
negative balance = 0
single Session consumption
distinct Session contention
UnitOfWork
replay
tenant isolation
```

---

# 82. `gate:pr23.1`

Idealmente:

```text
gate:pr23
+
package assignment tests
+
package physical safety
+
full package E2E
+
workers dry-run
```

---

# 83. Não começar Payment se este gate falhar

Formalizar:

```text
gate:pr23.1 != PASS
→ PR-24 BLOCKED
```

---

# 84. Workers tests sugeridos

Criar:

```text
test/workers/package-assignment.spec.ts
test/workers/package-consumption-concurrency.spec.ts
test/workers/package-session-e2e.spec.ts
```

---

# 85. Teste assignment happy path

Package:

```text
tenant A
customer C
service S
ACTIVE
remaining=5
valid
```

Appointment:

```text
tenant A
customer C
service S
```

Result:

```text
customerPackageId assigned
settlementSource PACKAGE
```

---

# 86. Assignment cross-tenant

Package tenant B:

```text
BLOCKED
```

---

# 87. Assignment wrong customer

```text
BLOCKED
PACKAGE_CUSTOMER_MISMATCH
```

---

# 88. Assignment wrong service

```text
BLOCKED
PACKAGE_SERVICE_MISMATCH
```

---

# 89. Assignment expired

```text
BLOCKED
PACKAGE_EXPIRED
```

---

# 90. Assignment exhausted

```text
BLOCKED
PACKAGE_BALANCE_EXHAUSTED
```

---

# 91. Assignment completed/canceled

Bloqueados.

---

# 92. Assignment after Session start

Appointment:

```text
IN_PROGRESS
```

→ `BLOCKED`.

---

# 93. StartSession snapshot test

Appointment package A.

Start Session.

Query Session:

```text
customerPackageId = A
```

---

# 94. E2E package consumption count

Use real flows rather than direct DB insert wherever feasible.

Isso prova:

```text
HTTP/RPC
→ Application
→ Domain
→ D1
→ Outbox
→ Service Binding
```

e não apenas SQL.

---

# 95. Eventual consistency test

Operations indisponível após:

```text
PackageUnitConsumed
```

Billing continua:

```text
remaining decremented
movement persisted
Outbox PENDING
```

Depois recovery:

```text
timeline converges
```

---

# 96. Não rollback consumo por falha de timeline

Package consumption é o fato Billing autoritativo.

---

# 97. Observability

Adicionar métricas/logs:

```text
package.assignment.ready
package.assignment.blocked

package.consume.success
package.consume.replay
package.consume.exhausted
package.consume.concurrent_conflict
```

Sem IDs como labels.

---

# 98. Métrica importante

Ter uma forma de observar:

```text
package.consumption.reconciliation_required
```

para casos:

```text
expired after assignment
exhausted after assignment
```

Isso será relevante para PR-24.

---

# 99. Não logar valores financeiros sensíveis desnecessariamente

`remainingQuantity` pode ser operacional.

Preços/discounts não precisam estar em logs normais.

---

# 100. Atualizar documentação do package flow

Criar/atualizar:

```text
docs/business/package-contracts.md
docs/reliability/package-consumption.md
```

Com fluxo:

```text
materialize
→ assign
→ snapshot
→ complete Session
→ consume
→ timeline
```

---

# 101. Atualizar workers topology

Documentar:

```text
Operations
   ↓ package eligibility
Billing

Operations Appointment
   ↓ SessionStartContext
Clinical

Clinical SessionCompleted
   ↓ PackageConsumptionRequested
Billing

Billing PackageUnitConsumed
   ↓
Operations Timeline
```

---

# 102. Atualizar ADR

Se ainda não existe, criar:

```text
ADR-0012-package-settlement-and-consumption.md
```

Congelar:

```text
explicit package selection
no automatic package discovery
no reservation
consumption only on SessionCompleted
CAS authoritative balance protection
one logical consumption per Session
eventual cross-worker consistency
```

---

# 103. Definition of Done — Assignment

```text
[ ] AssignPackageToAppointment exists

[ ] authenticated

[ ] tenant-aware

[ ] permission-aware

[ ] Idempotency-Key

[ ] Billing eligibility RPC

[ ] customer match

[ ] service match

[ ] ACTIVE

[ ] not expired

[ ] balance > 0

[ ] package reference persisted

[ ] settlement source explicit

[ ] no automatic package selection
```

---

# 104. Definition of Done — Historical snapshot

```text
[ ] StartSession receives customerPackageId

[ ] Session persists customerPackageId

[ ] later Appointment changes cannot rewrite Session package reference

[ ] completed Session event uses Session snapshot

[ ] no late lookup chooses a different package
```

---

# 105. Definition of Done — Physical balance safety

```text
[ ] remaining=1 / 2 Sessions tested

[ ] remaining=10 / 11 Sessions tested

[ ] high-contention test executed

[ ] remainingQuantity never < 0

[ ] exactly remainingQuantity consumptions succeed

[ ] package becomes COMPLETED at zero
```

---

# 106. Definition of Done — Session uniqueness

```text
[ ] same Session/same event consumes once

[ ] same Session/different event consumes once

[ ] same Session/different Idempotency-Key consumes once

[ ] same Session/two Packages cannot consume twice

[ ] DB constraint physically proven
```

---

# 107. Definition of Done — Local atomicity

```text
[ ] decrement + movement atomic

[ ] Audit included

[ ] Outbox included when required

[ ] Idempotency included

[ ] failure does not leave balance without movement

[ ] failure does not leave movement without balance decrement
```

---

# 108. Definition of Done — Double discount

```text
[ ] package commercial snapshot preserved

[ ] no DiscountPolicy called during consumption

[ ] no DepositPolicy called during consumption

[ ] no new per-session discount

[ ] settlementSource identifies package funding
```

---

# 109. Definition of Done — Integration

```text
[ ] PackageConsumptionRequested physical Service Binding PASS

[ ] PackageUnitConsumed physical Service Binding PASS

[ ] timeline PACKAGE_CONSUMED created

[ ] replay does not duplicate timeline

[ ] ACK-loss recovered
```

---

# 110. Definition of Done — Failure scenarios

```text
[ ] package expires after assignment

[ ] package is exhausted after assignment

[ ] Session completion remains authoritative

[ ] consumption failure does not corrupt balance

[ ] reconciliation-required result observable

[ ] limitation without reservation documented
```

---

# 111. Definition of Done — Free Tier

```text
[ ] no polling

[ ] no Cron

[ ] no Queue

[ ] no KV

[ ] no R2

[ ] bounded D1 queries

[ ] indexed package eligibility

[ ] one consumption mutation per package-funded completed Session
```

---

# 112. Definition of Done — regression

```text
[ ] PR-21 PASS

[ ] PR-22 PASS

[ ] PR-23 PASS

[ ] normal non-package Appointment unchanged

[ ] CreateAppointment still works

[ ] StartSession still works

[ ] CompleteSession still works

[ ] SessionCompleted Operations effects still work

[ ] Customer history still works
```

---

# 113. Qualidade final

Executar:

```bash
npm run lint
npx tsc --build --force

npm run test
npm run test:workers
npm run test:package-concurrency

npm run gate:pr23
npm run gate:package-physical-safety
npm run gate:pr23.1

npm run workers:dry-run
git diff --check
```

Tudo deve retornar:

```text
PASS
```

---

# 114. Readiness formal

Criar no final do documento:

```text
PackageReadyForPayment
```

e só permitir:

```text
PASS
```

quando:

```text
PackageAssignment              PASS
PackageEligibility             PASS
SessionPackageSnapshot         PASS

NoNegativeBalance              PASS
OneConsumptionPerSession       PASS
CASConcurrency                 PASS
UnitOfWork                     PASS

PackageConsumptionRequested    PASS
PackageUnitConsumed            PASS
TimelineProjection             PASS

Replay                         PASS
ACKLoss                        PASS
TenantIsolation                PASS
```

---

# 115. RN-PAC após o PR-23.1

O esperado é conseguir finalmente afirmar fisicamente:

```text
RN-PAC-001  PASS
RN-PAC-002  PASS
RN-PAC-003  PASS
RN-PAC-004  PASS + PHYSICAL PROOF
RN-PAC-005  PASS + PHYSICAL PROOF
RN-PAC-006  PASS
RN-PAC-007  PASS
RN-PAC-008  PASS

PackageReadyForPayment = PASS
```

---

# 116. RN-CONC-002 continua parcialmente pendente

Depois do PR-23.1:

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

Esse status deve continuar explícito.

---

# 117. O que NÃO entra no PR-23.1

Não implementar:

```text
Payment

Ledger

Receivable

Partial payment

Cash
PIX settlement
Debit/Credit card settlement
Transfer

Refund
Credit

Package reservation

Package refund

Package transfer

Package manual balance adjustment

Notifications
```

Principalmente:

```text
não começar Payment dentro deste PR
```

---

# 118. Relatório pós-implementação esperado

O Codex deve responder aproximadamente:

```text
PR-23.1 — Package Assignment + Physical Concurrency Qualification

Baseline
PR23:

Package Assignment
HTTP:
permission:
Billing eligibility:
customer validation:
service validation:
expiry:
balance:
idempotency:

Settlement Context
settlementSource:
customerPackageId:
commercial terms:
double discount:

Session Snapshot
Appointment package:
StartSession context:
Session package:
immutability:

Physical Concurrency
iterations:
initial balances:
attempts:
successful:
blocked:
negative balances:

Single Session Safety
same event:
different event:
different key:
different packages:
movements:

Local Atomicity
balance:
movement:
Audit:
Outbox:
failure injection:

Package Consumption
SessionCompleted:
PackageConsumptionRequested:
Billing CAS:
PackageUnitConsumed:

Timeline
PACKAGE_CONSUMED:
replay:
ACK-loss:

Failure Scenarios
expired after assignment:
exhausted after assignment:
reconciliation required:

Tenant Isolation
assignment:
consumption:
timeline:

Free Tier
D1:
KV:
R2:
Queue:
Cron:

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

Quality
unit:
workers:
package concurrency:
lint:
typecheck:
dry-runs:
PR23.1 gate:

Remaining blockers:

Next PR:
```

---

# Depois do PR-23.1

Se o resultado for:

```text
PackageReadyForPayment = PASS
```

aí sim o próximo PR deve ser:

# PR-24 — Receivable + Payment + Ledger Foundation

Ele deverá introduzir algo próximo de:

```text
FinancialObligation / Receivable
          │
          ├── Appointment settlement
          ├── Package acquisition
          └── Deposit already confirmed
                  │
                  ▼
              Payment
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
       CASH      PIX       CARD ...
                  │
                  ▼
           LedgerMovement
                  │
                  ├── PAYMENT
                  ├── DEPOSIT
                  ├── REFUND
                  └── CREDIT
```

e então implementar:

```text
partial payment
remaining balance
confirmed deposit deduction
append-only payment history
refund as inverse movement
internal credit
```

Sem essa etapa intermediária **PR-23.1**, o PR-24 começaria apoiado em duas garantias de pacote que atualmente estão apenas implementadas logicamente, mas não integralmente comprovadas fisicamente. Como saldo de pacote e futuro saldo financeiro vão se encontrar no fluxo pós-sessão, esse é exatamente o momento de fechar a prova concorrente antes de avançar.
