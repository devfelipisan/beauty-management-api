Com o estado atual, o próximo PR deve **fechar a lacuna contratual do snapshot financeiro antes de ativar qualquer efeito monetário**.

O próximo passo correto é:

# PR-26.3 — Financial Decision Snapshot Hardening + Safe Consumer Activation

O objetivo deste PR é transformar o estado atual:

```text
Financial reconciliation persistence = READY

FinancialDecisionSnapshot
  └── dados insuficientes

AppointmentCanceled consumer
  └── BLOCKED

AppointmentNoShowRecorded consumer
  └── BLOCKED
```

em:

```text
FinancialDecisionSnapshot = AUTHORITATIVE

SnapshotValidation = PASS

AppointmentCanceled consumer = ACTIVE

AppointmentNoShowRecorded consumer = ACTIVE

RETURN = SAFE
RETAIN = SAFE
CONVERT_TO_CREDIT = SAFE

Replay = SAFE
ACK-loss = SAFE
Stale decision = DETECTED
```

O ponto central é: **não implementar Refund/Credit/Retain antes que o evento carregue identidade suficiente para provar qual estado financeiro foi avaliado**.

---

# 1. Escopo exato

Neste PR entram:

```text
FinancialDecisionSnapshot v2

Deposit identity/version

Receivable identity/version

Eligible payment identities

Refundable amounts congelados

Financial fingerprint/version

ValidateFinancialDecisionSnapshot

AppointmentCanceled consumer

AppointmentNoShowRecorded consumer

RETURN
RETAIN
CONVERT_TO_CREDIT

Reconciliation OPEN

Replay

ACK-loss

Financial concurrency

Failure injection

Final activation gate
```

Continuam fora:

```text
TRANSFER de sinal

reconciliação automática

reconciliation UI/backoffice

chargeback

gateway

cash closing

manual credit

package restoration
```

---

# 2. Baseline

Antes de qualquer alteração:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr25
npm run gate:pr26
npm run gate:pr26.1
npm run gate:pr26.2
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

Registrar:

```text
FinancialReconciliationPersistence = PASS

FinancialSnapshotAuthority = BLOCKED
FinancialConsumers = BLOCKED

AppointmentChangeReady = BLOCKED
```

---

# 3. Criar o plano

Criar:

```text
docs/plans/PR-26.3-financial-decision-snapshot-consumer-activation.md
```

Com:

```text
Objective
Baseline

Current Contract Gap

FinancialDecisionSnapshot v2

Deposit Identity
Receivable Identity
Payment Identity

Versioning / Fingerprint

Snapshot Validation

AppointmentCanceled Consumer
AppointmentNoShow Consumer

RETURN
RETAIN
CONVERT_TO_CREDIT

Reconciliation

UnitOfWork
Replay
ACK-loss
Concurrency

Tenant Isolation
Security
Observability
Free-tier

Definition of Done
Out of Scope
```

---

# 4. Primeiro: evoluir `FinancialDecisionSnapshot`

O snapshot não deve carregar apenas uma decisão abstrata como:

```text
depositDisposition = RETURN
```

Ele precisa provar **sobre qual dinheiro** essa decisão foi tomada.

Conceitualmente:

```ts
FinancialDecisionSnapshot {
  policy: {
    id
    version
  }

  evaluatedAt

  deposit?: {
    id
    status
    amountCents
    version
  }

  receivable?: {
    id
    status
    netAmountCents
    paidAmountCents
    outstandingAmountCents
    version
  }

  payments: [
    {
      id
      amountCents
      refundedAmountCents
      refundableAmountCents
      version
    }
  ]

  depositDisposition

  paymentDisposition

  receivableDisposition

  financialFingerprint
}
```

A estrutura exata deve seguir o código atual, mas essas identidades precisam existir.

---

# 5. Não carregar dados desnecessários

Não colocar no snapshot:

```text
customer name
payment notes
card details
PII
full ledger
```

Apenas fatos necessários para executar a decisão.

---

# 6. `depositId` passa a ser obrigatório quando há efeito no sinal

Exemplo:

```text
depositDisposition = RETURN
```

sem:

```text
deposit.id
```

deve ser inválido.

Resultado:

```text
FINANCIAL_SNAPSHOT_INCOMPLETE
```

Não buscar “algum depósito” do Appointment no consumer.

---

# 7. Não inferir Deposit no momento do apply

Proibido:

```sql
SELECT latest confirmed deposit
WHERE appointment_id = ?
```

para decidir qual valor devolver.

A decisão precisa apontar explicitamente para:

```text
depositId
```

avaliado anteriormente.

---

# 8. Versionar Deposit

Precisamos detectar:

```text
evaluate:
Deposit CONFIRMED

apply:
Deposit RETURNED
```

ou:

```text
evaluate:
Deposit PENDING

apply:
Deposit CONFIRMED
```

Preferência:

```text
revision BIGINT/INTEGER
```

incrementada a cada transição.

Se o domínio já tem version/revision equivalente, reutilizar.

---

# 9. Não usar `updatedAt` se houver versão melhor

Timestamp pode ser suficiente como fallback, mas version explícita é mais determinística.

---

# 10. Evoluir Deposit persistence se necessário

Se precisar migration:

```text
0024_financial_entity_versions.sql
```

ou próximo número real.

Adicionar algo como:

```text
deposits.version NOT NULL DEFAULT 1
```

somente se ainda não existir mecanismo equivalente.

---

# 11. CAS passa a considerar version

Exemplo:

```sql
UPDATE deposits
SET
  status = ?,
  version = version + 1
WHERE tenant_id = ?
  AND id = ?
  AND status = ?
  AND version = ?
```

Assim o consumer aplica exatamente o estado avaliado.

---

# 12. Receivable também precisa de identidade suficiente

Snapshot:

```text
receivableId
status
paidAmount
outstandingAmount
version
```

Isso permite detectar:

```text
evaluate outstanding = 10000

payment arrives = 4000

apply cancellation decision
```

Sem isso, o refund poderia usar valor stale.

---

# 13. Versionar Receivable

O PR-24 já usa CAS financeiro.

Evoluir a mesma primitive para:

```text
version
```

se ainda não houver.

Toda mutation financeira relevante deve incrementar.

---

# 14. Payments elegíveis precisam ser congelados

Esse é um ponto crítico.

Se a policy decidiu:

```text
refund payments = 6000
```

o snapshot precisa registrar **quais Payments** compõem isso.

Exemplo:

```text
payments:
- paymentId=P1
  refundableAmount=4000
- paymentId=P2
  refundableAmount=2000
```

Não apenas:

```text
refundAmount=6000
```

---

# 15. Por quê?

Porque entre evaluate e apply:

```text
P1 pode ter recebido refund manual
```

Então precisamos detectar exatamente qual componente ficou stale.

---

# 16. Não fazer refund proporcional automaticamente

Se snapshot possui vários Payments, não inventar algoritmo de distribuição no apply.

A distribuição deve já estar congelada.

---

# 17. Criar tipo `PaymentRefundDecision`

Algo como:

```text
paymentId
amountCents
paymentVersion
refundedAmountAtEvaluation
```

Isso é muito mais seguro.

---

# 18. `financialFingerprint`

Depois de montar todos esses fatos:

```text
policy
deposit
receivable
payments
```

gerar fingerprint determinístico.

Pode ser:

```text
SHA-256(canonical JSON)
```

se já houver helper de hash.

---

# 19. Canonicalização obrigatória

Não usar:

```text
JSON.stringify(object)
```

dependendo de ordem arbitrária de campos/arrays.

Ordenar Payments por ID e serializar estrutura determinística.

---

# 20. O fingerprint não substitui versões

Use ambos quando possível:

```text
entity versions
+
aggregate fingerprint
```

Fingerprint ajuda a validar o snapshot inteiro.

Version CAS protege a mutation real.

---

# 21. Criar `BuildFinancialDecisionSnapshot`

No Billing:

```bash
nest g service \
  appointment-change-policies/application/build-financial-decision-snapshot \
  --project billing-worker
```

Responsável por:

```text
load deposit
load receivable
load eligible payments
calculate refundable portions
capture versions
build fingerprint
```

---

# 22. `EvaluateCancellationFinancials` passa a usar builder

Não duplicar consultas.

Fluxo:

```text
load policy
↓
BuildFinancialDecisionSnapshot
↓
evaluate policy
↓
READY/BLOCKED + immutable snapshot
```

---

# 23. Mesmo para No-show

Reutilizar builder financeiro.

NoShow muda policy/decision, não a forma de obter estado financeiro.

---

# 24. Criar `ValidateFinancialDecisionSnapshot`

Agora sim implementar o item pendente.

```bash
nest g service \
  appointment-change-policies/application/validate-financial-decision-snapshot \
  --project billing-worker
```

Input:

```text
tenantId
snapshot
```

Output:

```text
VALID
STALE
INVALID
```

---

# 25. `INVALID`

Para problemas estruturais:

```text
missing depositId for RETURN
missing Payment id
negative refund amount
snapshot fingerprint malformed
tenant mismatch
```

Isso indica contrato inválido.

---

# 26. `STALE`

Para estado legítimo que mudou:

```text
deposit version changed
receivable version changed
payment refund balance changed
payment version changed
```

---

# 27. Reason codes estruturados

Exemplo:

```text
DEPOSIT_VERSION_CHANGED
RECEIVABLE_VERSION_CHANGED
PAYMENT_VERSION_CHANGED
PAYMENT_REFUNDABLE_AMOUNT_CHANGED
FINANCIAL_FINGERPRINT_CHANGED
```

Evitar strings livres.

---

# 28. Criar reconciliation issue em `STALE`

Reusar `financial_reconciliation_issues` do PR-26.2.

Persistir:

```text
tenantId
appointmentId
sourceEventId

type = STALE_FINANCIAL_DECISION

reasonCode

expectedFingerprint
actualFingerprint

status = OPEN
```

---

# 29. Um evento não deve criar múltiplos issues iguais

Adicionar unicidade lógica:

```text
tenant + sourceEventId + issueType
```

ou equivalente.

Replay precisa retornar o mesmo issue.

---

# 30. Não criar reconciliation para erro transient

Exemplo:

```text
D1 temporary failure
```

continua retryable.

Só business inconsistency/stale vai para reconciliation.

---

# 31. Implementar consumer `AppointmentCanceled`

Ativar agora:

```text
ApplyAppointmentCanceledFinancialEffects
```

Pipeline:

```text
receive event
↓
event replay check
↓
validate tenant
↓
ValidateFinancialDecisionSnapshot
↓
VALID?
├── no → reconciliation
└── yes
     ↓
     execute dispositions
     ↓
     UnitOfWork
```

---

# 32. Não recalcular policy

Reforço:

```text
event snapshot
```

é a decisão.

O consumer não acessa policy para mudar resultado.

---

# 33. Disposition `NONE`

Também precisa ser tratada.

Pode simplesmente:

```text
mark event consumed
```

sem Refund/Credit/Retain.

---

# 34. Disposition `RETURN`

Há dois possíveis componentes:

```text
Deposit
Payments
```

Não tratá-los como a mesma coisa.

---

# 35. Deposit RETURN

Se Deposit confirmado deve ser devolvido:

```text
Deposit CONFIRMED
→ RETURNED
```

e usar primitive financeira adequada.

Se Deposit é modelado separadamente de Payment, pode haver Refund referenciando origem Deposit.

Mas o PR-25 atual parece exigir Payment existente para `IssueRefund`.

---

# 36. Não forçar Deposit a virar Payment artificialmente

Se o modelo atual não possui Payment para depósito, precisamos evoluir Refund para suportar origem tipada:

```text
PAYMENT
DEPOSIT
```

ou criar primitive específica:

```text
IssueDepositRefund
```

---

# 37. Escolha arquitetural recomendada

Se Deposit representa dinheiro efetivamente recebido, Refund deveria poder apontar para:

```text
FinancialSource {
  type: DEPOSIT
  id
}
```

Mas isso é uma mudança maior.

Outra opção é o Deposit já ter Payment/ledger correlation no PR-13/24.

**Inspecionar primeiro.**

---

# 38. Regra

Não inventar um Payment fake só para reutilizar `IssueRefund`.

Se a origem financeira real for Deposit, preserve-a.

---

# 39. Payment RETURN

Para cada `PaymentRefundDecision` do snapshot:

```text
IssueRefund(
  paymentId,
  frozen amount
)
```

reutilizando PR-25.

---

# 40. Não executar loop com commits separados

Se vários Payments precisam ser refundados, os efeitos de uma única decisão de cancelamento idealmente precisam ficar no mesmo `D1UnitOfWork`.

Isso pode exigir separar:

```text
IssueRefund
```

em:

```text
prepareRefundStatements
```

ou uma primitive composable.

---

# 41. Evitar nested UnitOfWork

Não fazer:

```text
Cancellation UoW
  ↓
IssueRefund.execute()
  ↓
separate UoW
```

porque pode deixar:

```text
Payment A refunded
Payment B failed
```

em uma decisão que exigia ambos.

---

# 42. Criar primitives transacionais reutilizáveis

Exemplo:

```text
RefundMutationPort
CreditMutationPort
DepositDispositionMutationPort
ReceivableCancellationMutationPort
```

que adicionam statements à UnitOfWork atual.

Os application services públicos continuam usando as mesmas primitives.

---

# 43. Isso é importante para `RETURN`

Uma decisão pode exigir:

```text
Deposit return
+
2 Payment refunds
+
Receivable cancel
```

Todos pertencem a um efeito financeiro lógico.

---

# 44. Disposition `CONVERT_TO_CREDIT`

Mesma preocupação.

A decisão pode envolver:

```text
deposit 3000
payments 5000
```

convertidos em:

```text
credit 8000
```

Precisamos evitar duas grants separadas não atômicas.

---

# 45. Criar uma única `CreditGrantPlan`

Exemplo:

```text
sourceOperation = AppointmentCancellation
totalCreditCents = 8000
components = [...]
```

O Ledger pode preservar componentes/origens sem criar saldo parcial.

---

# 46. InternalCredit origin

PR-25 aceitava `REFUND`.

Agora evoluir para origem tipada:

```text
REFUND
APPOINTMENT_CANCELLATION
APPOINTMENT_NO_SHOW
```

Mas o command não pode aceitar qualquer origem vinda do público.

---

# 47. Disposition `RETAIN`

Pode aplicar apenas ao Deposit ou também Payments conforme policy.

Não assumir que “retain” de pagamento precisa alterar Payment.

O dinheiro já está recebido; retenção é ausência de refund.

Pode ser necessário apenas registrar decisão/audit.

---

# 48. Deposit RETAIN

Aqui sim lifecycle explícito:

```text
CONFIRMED → RETAINED
```

se esse status foi adotado.

---

# 49. `CancelReceivable`

Implementar agora.

```bash
nest g service \
  receivables/application/cancel-receivable \
  --project billing-worker
```

---

# 50. Regra segura

Sugestão:

```text
OPEN → CANCELED
```

permitido.

```text
PARTIALLY_PAID
PAID
```

só cancelados se snapshot possuir disposições explícitas para os valores pagos.

---

# 51. Não zerar valores

Após cancel:

```text
netAmount
paidAmount
outstanding
```

continuam como fatos históricos.

O status representa que a obrigação foi anulada.

---

# 52. Se `outstanding` continuar > 0 em Receivable CANCELED

Isso pode ser aceitável se semântica for:

```text
amount originally outstanding when obligation canceled
```

Mas pode confundir queries.

---

# 53. Melhor adicionar `canceledAmountCents`

Só se realmente necessário.

Não faça isso sem revisar o modelo.

Uma alternativa é:

```text
status = CANCELED
```

e outstanding deixa de ser considerado cobrável.

---

# 54. `outstandingAmount` não deve ser usado como “collectible” sozinho

Queries financeiras precisam filtrar status.

---

# 55. Consumer `AppointmentNoShowRecorded`

Ativar com o mesmo mecanismo.

Pipeline idêntico:

```text
snapshot validate
↓
execute NoShow disposition
```

---

# 56. Compartilhar coordinator?

Pode haver:

```text
ApplyAppointmentFinancialEffects
```

com:

```text
sourceType=CANCELLATION|NO_SHOW
```

e handlers finos.

Mas evite apagar a semântica específica dos eventos.

---

# 57. Criar `FinancialEffectExecutor`

Uma boa separação:

```text
FinancialEffectExecutor
  ├── executeDepositPlan
  ├── executePaymentRefundPlan
  ├── executeCreditPlan
  └── executeReceivablePlan
```

com um único UnitOfWork.

---

# 58. Nada de controller/use case gigante

O consumer coordena.

As primitives executam invariantes.

---

# 59. Reconciliation em conflito de CAS

Mesmo snapshot VALID pode perder uma race entre validation e mutation.

Exemplo:

```text
validate Deposit version=4
↓
concurrent Confirm/Refund changes to 5
↓
CAS changes=0
```

Isso deve virar:

```text
FINANCIAL_DECISION_CONFLICT
```

e reconciliation.

---

# 60. Portanto validation não elimina CAS

Precisamos de:

```text
pre-validation
+
CAS
```

---

# 61. `expectedChanges` do D1UnitOfWork

O PR-24 corrigiu essa primitive.

Use-a intensivamente.

Toda mutation esperada:

```text
expectedChanges = 1
```

Se 0:

```text
abort transaction
```

---

# 62. Não transformar expectedChanges mismatch automaticamente em 500

No coordinator financeiro:

```text
CAS conflict
```

deve ser mapeado para:

```text
FINANCIAL_DECISION_CONFLICT
```

quando aplicável.

---

# 63. Teste stale Deposit

Criar:

```text
test/workers/financial-decision-stale.spec.ts
```

Cenário:

```text
evaluate cancellation
Deposit version=1

transition Deposit
version=2

deliver AppointmentCanceled
```

Resultado:

```text
reconciliation issue OPEN
Refund=0
Credit=0
Retain=0
```

---

# 64. Teste stale Receivable

```text
evaluate outstanding=10000/version=2
RegisterPayment 4000
version=3
apply event
```

Expected:

```text
STALE
```

---

# 65. Teste stale Payment

```text
snapshot refundable P1=10000
manual Refund 4000
apply cancellation refund=10000
```

Expected:

```text
STALE / conflict
```

e nunca over-refund.

---

# 66. Teste fingerprint tampering

Modificar snapshot no evento de teste:

```text
amount
```

sem recalcular fingerprint.

Resultado:

```text
INVALID_FINANCIAL_SNAPSHOT
```

Nunca executar.

---

# 67. Tenant tampering

Snapshot Tenant B dentro de AppointmentCanceled Tenant A.

Resultado:

```text
INVALID / BLOCKED
```

Sem mutation.

---

# 68. Replay de reconciliation

Mesmo stale event entregue 20 vezes:

```text
reconciliation issues = 1
```

---

# 69. Criar script

```bash
npm run test:financial-decision-stale
```

---

# 70. Teste RETURN completo

Fixture:

```text
Deposit/Payments
snapshot READY RETURN
```

Deliver:

```text
AppointmentCanceled
```

Assert:

```text
financial effect applied once
Refund rows correct
Deposit state correct
Receivable state correct
Ledger correct
Audit correct
Outbox correct
```

---

# 71. Teste CREDIT completo

Assert:

```text
credit account increases exactly frozen amount
```

Sem Refund, se a decision for exclusivamente credit.

---

# 72. Teste RETAIN completo

Assert:

```text
Deposit RETAINED
Refund 0
Credit 0
```

---

# 73. Mixed plan test

Se policy pode retornar:

```text
deposit RETAIN
payments REFUND
```

testar.

Essa combinação é importante para provar que dispositions são independentes.

---

# 74. Se policy atual não suporta combinações

Não inventar.

Teste apenas combinações reais do contrato.

---

# 75. Concurrency: cancel vs ConfirmDeposit

Agora criar prova física final.

Executar:

```text
Evaluate + Cancel
```

e:

```text
ConfirmDeposit
```

concorrentemente.

O resultado deve cair em uma de duas categorias seguras:

```text
decision observes confirmed state
→ applies correct effect
```

ou:

```text
decision becomes stale
→ reconciliation
```

Nunca ignorar o depósito.

---

# 76. Concurrency: cancel vs RegisterPayment

Mesmo.

---

# 77. Concurrency: cancellation automatic refund vs manual refund

Expected:

```text
cumulative refund <= Payment.amount
```

e no máximo um deles aplica o valor conflitante.

---

# 78. Concurrency: two cancel events different eventIds

Mesmo Appointment/financialDecision logical source.

Business uniqueness precisa evitar:

```text
2 credits
2 refunds
```

---

# 79. Criar source operation identity

Algo como:

```text
APPOINTMENT_CANCELLATION:{appointmentId}
```

ou usar:

```text
cancellationId
```

se existe.

Preferível ter ID do fato de cancelamento, não apenas Appointment ID.

---

# 80. Se Appointment puder ter apenas um cancelamento

AppointmentId pode funcionar, mas uma identidade explícita do event/fact é mais limpa.

---

# 81. No-show também precisa source identity própria

```text
NO_SHOW:{appointmentId}
```

ou evento autoritativo.

---

# 82. ACK-loss Operations → Billing

Testar para cada disposition pelo menos uma vez.

Idealmente `RETURN`, pois envolve mais efeitos.

---

# 83. ACK-loss Billing → Operations

Refund/Credit timeline já existe.

Revalidar através do cancel E2E completo.

---

# 84. Reconciliation não deve emitir Refund/Credit Outbox

Se stale:

```text
financial business event = none
```

Apenas observability/reconciliation record.

---

# 85. Pode emitir `FinancialReconciliationRequired`

Para Operations/backoffice?

Pode ser útil, mas não obrigatório neste PR.

Se não houver consumidor, não crie.

---

# 86. Resolver reconciliation continua fora

Tabela possui:

```text
OPEN
RESOLVED
```

mas este PR não precisa criar:

```text
ResolveFinancialReconciliationIssue
```

a menos que o contrato já esteja definido.

---

# 87. Não marcar RESOLVED automaticamente

Depois que estado financeiro muda novamente, não significa que issue foi resolvido.

Precisa ação explícita futura.

---

# 88. Failure injection — multi-effect UoW

Criar:

```text
test/workers/appointment-financial-effects-uow.spec.ts
```

Casos:

```text
Refund statement fails
Credit statement fails
Deposit transition fails
Receivable cancel fails
Ledger fails
Audit fails
Outbox fails
Idempotency/event consume fails
```

---

# 89. Assert sempre diretamente no D1

Após cada falha:

```text
no partial deposit transition
no partial refund
no partial credit
no partial receivable cancel
```

---

# 90. Teste última linha de defesa

Force CAS mismatch dentro do batch.

A correção `expectedChanges` do PR-24 precisa:

```text
abort entire D1 transaction
```

Provar isso aqui.

---

# 91. Full cancellation E2E

Fluxo:

```text
Appointment
↓
Deposit/Payment
↓
evaluate cancellation
↓
CancelAppointment
↓
AppointmentCanceled Outbox
↓
Billing consumer
↓
Financial effects
↓
Refund/Credit/Retain event
↓
Operations Timeline
```

---

# 92. Full NoShow E2E

```text
Appointment confirmed
↓
time > tolerance
↓
MarkNoShow
↓
AppointmentNoShowRecorded
↓
Billing
↓
financial disposition
↓
timeline
```

Assert:

```text
Session = none
Package consumption = none
```

---

# 93. Customer profile regression

NoShow ainda alimenta fatos do perfil.

Financial consumer não deve alterar profile.

Essa separação precisa permanecer.

---

# 94. Migration

Talvez seja necessária `0024`.

Antes:

```bash
ls database/d1/migrations
grep -R "version" database/d1/migrations apps/billing-worker/src -n
```

Só criar se versões/fingerprint persistence exigirem alteração física.

---

# 95. Possible migration content

```text
deposits.version

receivables.version

payments.version

financial reconciliation unique index

Deposit status additions
```

Não adicione tudo se já existir equivalente.

---

# 96. Version de Payment

Se `refunded_amount_cents` muda:

```text
version++
```

Sempre.

---

# 97. Version de Receivable

Incrementar em:

```text
payment apply
cancel
deposit apply
```

ou qualquer mutation que altere fatos usados por snapshot.

---

# 98. `financialFingerprint` no evento

Não precisa persistir em tabela principal.

Pode ficar:

```text
Appointment change history/outbox payload
```

como snapshot.

---

# 99. Security

Consumer precisa validar:

```text
tenant from event
==
tenant of every financial entity
```

Não basta validar Appointment.

---

# 100. Não confiar em payment IDs do event cegamente

Cada Payment deve ser carregado:

```text
tenant-aware
receivable-aware
customer-aware
```

antes de mutation.

---

# 101. Observability

Logs:

```text
operation=ApplyAppointmentFinancialEffects
source=CANCELLATION|NO_SHOW
result=SUCCESS|STALE|CONFLICT|REPLAY
```

Sem amounts se não necessários.

---

# 102. Metrics

```text
financial_effect.apply.success
financial_effect.apply.stale
financial_effect.apply.conflict
financial_effect.apply.replay

financial_reconciliation.opened
```

Labels apenas:

```text
sourceType
result
```

---

# 103. Free Tier

Este PR continua excelente para Free:

```text
event-driven
bounded D1 reads
bounded D1 writes
Service Bindings
```

Sem:

```text
Cron
Queue
KV
R2
polling
```

---

# 104. Gate snapshot

Adicionar:

```bash
npm run test:financial-decision-snapshot
```

Cobrir:

```text
build
fingerprint
validation
tampering
stale
```

---

# 105. Gate consumers

```bash
npm run test:appointment-financial-consumers
```

Cobrir:

```text
RETURN
RETAIN
CREDIT
NONE
replay
```

---

# 106. Gate UoW

```bash
npm run test:appointment-financial-uow
```

---

# 107. Gate concurrency

```bash
npm run test:appointment-financial-concurrency
```

---

# 108. Gate agregado

```bash
npm run gate:appointment-financial-effects
```

Agora deve ser efetivamente completo.

---

# 109. Gate final

```bash
npm run gate:pr26.3
```

Idealmente:

```text
gate:pr26.2
+
financial snapshot
+
consumers
+
UoW failures
+
concurrency
+
full E2E
+
dry-run
```

---

# 110. Readiness

Atualizar:

```text
docs/plans/appointment-change-readiness.md
```

Esperado:

```text
Reschedule                     PASS

CancellationPolicy             PASS
CancellationDecision           PASS
CancellationExecution          PASS
CancellationFinancialEffects   PASS

NoShowPolicy                   PASS
NoShowDecision                 PASS
NoShowExecution                PASS
NoShowFinancialEffects         PASS

FinancialSnapshotAuthority     PASS
StaleDecisionDetection         PASS
FinancialConflictDetection     PASS
ReconciliationPersistence      PASS

Refund                         PASS
Credit                         PASS
Retain                         PASS

Replay                         PASS
ACKLoss                        PASS
Concurrency                    PASS
TenantIsolation                PASS

AppointmentChangeReady         PASS
```

---

# 111. Definition of Done — Snapshot

```text
[ ] policy id/version

[ ] deposit id/state/version

[ ] receivable id/state/version

[ ] eligible payments explicit

[ ] payment refundable amounts explicit

[ ] payment versions

[ ] deterministic fingerprint

[ ] no financial inference required in consumer
```

---

# 112. Definition of Done — Validation

```text
[ ] VALID

[ ] STALE

[ ] INVALID

[ ] tenant mismatch

[ ] deposit change

[ ] receivable change

[ ] payment/refund change

[ ] fingerprint mismatch

[ ] structured reason codes
```

---

# 113. Definition of Done — Consumer

```text
[ ] AppointmentCanceled active

[ ] AppointmentNoShowRecorded active

[ ] no policy recalculation

[ ] frozen snapshot execution

[ ] event replay protection

[ ] business-source deduplication
```

---

# 114. Definition of Done — RETURN

```text
[ ] exact financial sources identified

[ ] exact refund amounts frozen

[ ] Deposit handled explicitly

[ ] Payments handled explicitly

[ ] over-refund impossible

[ ] Ledger append-only

[ ] Audit

[ ] Outbox
```

---

# 115. Definition of Done — CREDIT

```text
[ ] exact credit amount frozen

[ ] exact source operation

[ ] one grant per logical source

[ ] tenant/customer scoped

[ ] balance correct

[ ] Ledger CREDIT_GRANTED

[ ] Audit/Outbox
```

---

# 116. Definition of Done — RETAIN

```text
[ ] Deposit transition CAS

[ ] replay safe

[ ] conflicting disposition blocked

[ ] no Refund

[ ] no Credit

[ ] audit trail
```

---

# 117. Definition of Done — Receivable

```text
[ ] cancel operation explicit

[ ] only frozen decision controls it

[ ] no DELETE

[ ] historical amounts preserved

[ ] paid/partial state handled explicitly

[ ] version increments on relevant mutations
```

---

# 118. Definition of Done — Reconciliation

```text
[ ] stale snapshot → OPEN issue

[ ] CAS conflict → OPEN issue where appropriate

[ ] event replay does not duplicate issue

[ ] Appointment not rolled back

[ ] no incorrect financial effect applied

[ ] issue durable

[ ] issue observable
```

---

# 119. Definition of Done — UnitOfWork

```text
[ ] Deposit + Refund atomic

[ ] multi-Payment refunds atomic

[ ] Deposit + Credit atomic

[ ] Receivable effects atomic

[ ] Ledger atomic

[ ] Audit atomic

[ ] Outbox atomic

[ ] event consumption atomic

[ ] expectedChanges mismatch aborts all effects
```

---

# 120. Definition of Done — Concurrency

```text
[ ] cancel vs ConfirmDeposit

[ ] cancel vs RegisterPayment

[ ] cancel refund vs manual refund

[ ] conflicting Deposit disposition

[ ] duplicate cancellation events

[ ] duplicate no-show events

[ ] no over-refund

[ ] no double credit
```

---

# 121. Definition of Done — E2E

```text
[ ] Cancellation RETURN

[ ] Cancellation RETAIN

[ ] Cancellation CREDIT

[ ] NoShow configured effect

[ ] financial events reach Operations timeline

[ ] replay does not duplicate

[ ] ACK-loss recovered
```

---

# 122. Regression

```text
PR23.3 PASS
PR24 PASS
PR25 PASS
PR26 PASS
PR26.1 PASS
PR26.2 PASS

PackageReadyForPayment PASS
Payment concurrency PASS
Refund concurrency PASS
Internal Credit PASS
Reschedule PASS
```

---

# 123. Comandos finais

```bash
npm run lint
npx tsc --build --force

npm run test
npm run test:workers

npm run test:financial-decision-snapshot
npm run test:financial-decision-stale
npm run test:appointment-financial-consumers
npm run test:appointment-financial-uow
npm run test:appointment-financial-concurrency

npm run gate:pr26.2
npm run gate:appointment-financial-effects
npm run gate:appointment-change-safety
npm run gate:pr26.3

npm run workers:dry-run
git diff --check
```

Resultado:

```text
PASS
```

---

# 124. Relatório pós-implementação esperado

O Codex deve terminar aproximadamente assim:

```text
PR-26.3 — Financial Decision Snapshot Hardening + Consumer Activation

Baseline
PR26.2:

Financial Snapshot
policy:
deposit id:
deposit version:
receivable id:
receivable version:
payments:
payment versions:
refundable amounts:
fingerprint:

Snapshot Validation
valid:
stale deposit:
stale receivable:
stale payment:
tampered fingerprint:
tenant mismatch:

Cancellation Consumer
activated:
policy recalculated:
replay:

NoShow Consumer
activated:
policy recalculated:
replay:

RETURN
deposit:
payments:
refund:
receivable:
ledger:

RETAIN
deposit:
refund:
credit:

CREDIT
deposit:
payments:
credit amount:
ledger:

Reconciliation
stale:
conflict:
issue uniqueness:
Appointment rollback:

Concurrency
cancel-vs-confirmDeposit:
cancel-vs-registerPayment:
cancel-refund-vs-manual:
conflicting dispositions:
duplicate events:

UnitOfWork
multi-effect return:
credit:
retain:
ledger failure:
audit failure:
outbox failure:
expectedChanges failure:
partial states:

ACK Loss
Operations→Billing:
Billing→Operations:
lease recovery:

Timeline
CANCELED:
NO_SHOW:
REFUND:
CREDIT:
RETAIN:

Tenant Isolation
snapshot:
consumer:
deposit:
receivable:
payments:
credit:
reconciliation:

Free Tier
D1:
Bindings:
KV:
R2:
Queue:
Cron:

AppointmentChangeReady:

Regression
PR23.3:
PR24:
PR25:
PR26:
PR26.1:
PR26.2:

Quality
unit:
workers:
snapshot:
stale:
consumers:
UoW:
concurrency:
lint:
typecheck:
dry-runs:
PR26.3 gate:

Remaining blockers:

Next PR:
```

# Depois do PR-26.3

Se finalmente:

```text
AppointmentChangeReady = PASS
```

eu consideraria o lifecycle operacional manual da agenda suficientemente qualificado para avançar.

Aí o próximo PR passa a ser:

# PR-27 — Scheduled Operational Processing + Pending Actions Foundation

Mas eu o dividiria de forma conservadora:

```text
PR-27
Scheduled Processing Foundation
├── bounded Cron entrypoint
├── distributed-safe claim
├── execution budget
├── idempotent job runs
└── observability
```

e só depois:

```text
PR-27.1
Deposit Expiration Automation

PR-27.2
Pending Confirmation / No-show Candidate Processing

PR-27.3
Return Follow-up / Package Expiry Candidates
```

Isso é especialmente importante no plano **Cloudflare Free**, porque você não quer criar um Cron que varra:

```text
all tenants
all appointments
all deposits
```

periodicamente.

O scheduler futuro deve trabalhar com:

```text
indexed due-at queries
small bounded batches
leases
continuation checkpoints
```

Portanto, neste momento o próximo passo não é ainda o PR-27: é **PR-26.3 — Financial Decision Snapshot Hardening + Safe Consumer Activation**, porque o PR-26.2 corretamente criou a infraestrutura de reconciliation, mas recusou executar dinheiro sem saber exatamente **qual Deposit, qual Receivable e quais Payments** compunham a decisão original. Essa lacuna contratual precisa ser fechada antes de ativar Refund/Credit/Retain.
