Com o estado atual, o próximo PR deve finalmente ativar a execução financeira porque agora o Billing já possui os elementos necessários para deixar de inferir dinheiro:

```text
Snapshot V2                 PASS
Builder financeiro          PASS
Allocation por Payment      PASS
Fingerprint                 PASS
Validator INVALID/STALE     PASS
Payment version             PASS

Financial consumers         BLOCKED
```

O próximo PR correto é:

# PR-26.5 — Financial Consumer Activation + Refund / Retain / Credit Physical Qualification

O objetivo não é mais descobrir ou decidir valores. O consumer deve apenas executar uma decisão já congelada:

```text
AppointmentCanceled
ou
AppointmentNoShowRecorded
          │
          ▼
ValidateFinancialDecisionSnapshot
          │
     ┌────┴─────┐
     │          │
 INVALID/STALE  VALID
     │          │
     ▼          ▼
Reconciliation  Execute frozen plan
                  │
        ┌─────────┼──────────┐
        ▼         ▼          ▼
      RETURN    RETAIN     CREDIT
        │         │          │
        └─────────┼──────────┘
                  ▼
               Ledger
                  │
             Audit/Outbox
```

Ao término:

```text
FinancialDecisionReady  = PASS
FinancialConsumers      = PASS
FinancialEffectsSafe    = PASS
AppointmentChangeReady  = PASS
```

---

# 1. Congelar a baseline

Começar por:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr26.1
npm run gate:pr26.2
npm run gate:pr26.3
npm run gate:pr26.4
npm run gate:pr26.4.1
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
FinancialDecisionReady = PASS
FinancialConsumers     = BLOCKED
AppointmentChangeReady = BLOCKED
```

Nenhum consumer financeiro deve ser habilitado antes dessa baseline permanecer verde.

---

# 2. Criar o plano formal

Criar:

```text
docs/plans/PR-26.5-financial-consumer-activation.md
```

Com pelo menos:

```text
Objective
Baseline

Financial consumer architecture
Consumer contract
Snapshot validation

AppointmentCanceled
AppointmentNoShowRecorded

FinancialEffectExecutor

Deposit RETURN
Deposit RETAIN
Deposit CONVERT_TO_CREDIT

Payment refunds
Internal credit
Receivable cancellation

Business uniqueness
UnitOfWork
CAS

INVALID
STALE
CONFLICT
Reconciliation

Replay
ACK-loss
Lease recovery

Concurrency
Failure injection
Tenant isolation

E2E cancellation
E2E no-show

Observability
Free-tier impact

AppointmentChangeReady
Definition of Done
Out of Scope
```

---

# 3. Regra central do PR

O consumer fica proibido de responder estas perguntas:

```text
Qual Deposit?
Qual Receivable?
Quais Payments?
Quanto devolver?
Como distribuir o refund?
Quanto virar crédito?
Quanto reter?
```

Isso já foi resolvido no PR-26.4.1.

O consumer apenas:

```text
recebe snapshot
→ valida snapshot
→ executa snapshot
```

Portanto:

```text
ConsumerFinancialInference = FALSE
```

deve virar uma invariante arquitetural explícita.

---

# 4. Criar `FinancialEffectExecutor`

No Billing:

```bash
nest g service \
  appointment-change-policies/application/financial-effect-executor \
  --project billing-worker
```

Responsabilidade:

```text
VALID snapshot
↓
prepare financial mutations
↓
compose D1UnitOfWork
↓
commit exactly once
↓
return APPLIED / REPLAY / CONFLICT
```

Ele não resolve policy e não consulta novamente valores para tomar decisão.

---

# 5. Manter consumers finos

O desenho deve ficar aproximadamente:

```text
ApplyAppointmentCanceledFinancialEffects
          │
          ├── validate event
          ├── validate snapshot
          └── FinancialEffectExecutor
```

e:

```text
ApplyAppointmentNoShowFinancialEffects
          │
          ├── validate event
          ├── validate snapshot
          └── FinancialEffectExecutor
```

Não duplicar Refund/Credit/Retain nos dois consumers.

---

# 6. Ativar `AppointmentCanceled`

Criar/completar:

```bash
nest g service \
  appointment-change-policies/application/apply-appointment-canceled-financial-effects \
  --project billing-worker
```

Fluxo:

```text
AppointmentCanceled
↓
validate tenant
↓
business/event replay check
↓
ValidateFinancialDecisionSnapshot
↓
INVALID?
├── yes → permanent invalid
│
STALE?
├── yes → reconciliation
│
VALID
↓
FinancialEffectExecutor
```

---

# 7. Ativar `AppointmentNoShowRecorded`

Criar/completar:

```bash
nest g service \
  appointment-change-policies/application/apply-appointment-no-show-financial-effects \
  --project billing-worker
```

Mesmo padrão.

Mas manter tipos de origem distintos:

```text
APPOINTMENT_CANCELLATION
APPOINTMENT_NO_SHOW
```

Não tratar NoShow como um cancelamento artificial.

---

# 8. `INVALID` nunca movimenta dinheiro

Casos como:

```text
fingerprint inválido
snapshot incompleto
tenant mismatch
Payment de outro Receivable
Deposit inconsistente
```

devem retornar algo equivalente a:

```text
INVALID_FINANCIAL_DECISION
```

E garantir:

```text
Refund = 0
Credit delta = 0
Deposit transitions = 0
Receivable transitions = 0
```

---

# 9. `STALE` abre reconciliation

Reutilizar:

```text
financial_reconciliation_issues
```

do PR-26.2.

Persistir:

```text
type = STALE_FINANCIAL_DECISION
status = OPEN
sourceEventId
appointmentId
expectedFingerprint
actualFingerprint
reasonCode
```

Com unicidade lógica suficiente para:

```text
same stale event delivered 20x
→ one reconciliation issue
```

---

# 10. Diferenciar `STALE` de `CONFLICT`

`STALE`:

```text
validator detectou mudança antes da mutation
```

`CONFLICT`:

```text
validator retornou VALID
↓
outra mutation venceu
↓
CAS expectedChanges = 0
```

Então:

```text
FINANCIAL_DECISION_CONFLICT
```

também deve resultar em reconciliation.

---

# 11. Não retry infinito de conflito funcional

Não classificar como erro transitório genérico.

Se a decisão congelada perdeu suas preconditions:

```text
reconciliation required
```

é mais seguro do que repetir indefinidamente.

---

# 12. Implementar disposition `NONE`

Se o snapshot disser:

```text
financial effects = NONE
```

o consumer deve apenas registrar consumo idempotente do evento.

Nenhuma mutation financeira.

Esse cenário é importante para cancelamentos sem valores financeiros.

---

# 13. Implementar `RETURN` do Deposit

Usar exatamente:

```text
deposit.id
deposit.version
allocated/return amount
```

do snapshot.

Nenhuma busca do tipo:

```text
find latest confirmed deposit
```

---

# 14. Evoluir lifecycle do Deposit

Se ainda necessário:

```text
CONFIRMED
├── RETURNED
├── RETAINED
└── CONVERTED_TO_CREDIT
```

Esses estados devem representar fatos históricos.

---

# 15. Deposit RETURN via CAS

Conceitualmente:

```sql
UPDATE deposits
SET
  status = 'RETURNED',
  version = version + 1
WHERE tenant_id = ?
  AND id = ?
  AND status = 'CONFIRMED'
  AND version = ?
```

Obrigatório:

```text
expectedChanges = 1
```

---

# 16. Não criar Payment artificial para Deposit

Antes de reutilizar `IssueRefund`, inspecionar o modelo:

```bash
grep -R "payment_id" apps/billing-worker/src/deposits database -n
grep -R "deposit_id" apps/billing-worker/src/refunds database -n
```

Há dois cenários seguros:

```text
Deposit já referencia Payment real
→ refund do Payment real
```

ou:

```text
Deposit é origem financeira autônoma
→ Refund precisa suportar sourceType=DEPOSIT
```

O que não pode acontecer:

```text
create fake Payment only to issue Refund
```

---

# 17. Se Refund precisar aceitar Deposit

Evoluir para uma origem tipada, algo como:

```text
RefundSourceType
├── PAYMENT
└── DEPOSIT
```

Preservando compatibilidade do PR-25.

---

# 18. Não quebrar refunds atuais

Os existentes continuam:

```text
sourceType = PAYMENT
```

Não alterar comportamento de:

```text
partial refund
full refund
over-refund
refund concurrency
```

---

# 19. Implementar refund de Payments

Para cada:

```text
PaymentRefundDecision
```

usar exatamente:

```text
paymentId
allocatedAmountCents
paymentVersion
```

do snapshot.

---

# 20. Não recalcular refundable amount

O snapshot já congelou:

```text
refundableAmountCents
allocatedAmountCents
```

O consumer apenas usa CAS para garantir que continua válido.

---

# 21. CAS do Payment

Conceitualmente:

```sql
UPDATE payments
SET
  refunded_amount_cents =
    refunded_amount_cents + ?,
  version = version + 1
WHERE tenant_id = ?
  AND id = ?
  AND version = ?
  AND amount_cents - refunded_amount_cents >= ?
```

Se:

```text
changes = 0
```

→ `FINANCIAL_DECISION_CONFLICT`.

---

# 22. Multi-Payment refund precisa ser atômico

Se allocation for:

```text
P1 → 4.000
P2 → 1.000
```

não pode persistir:

```text
P1 refunded
P2 failed
```

Todos os statements precisam pertencer ao mesmo `D1UnitOfWork`.

---

# 23. Refatorar `IssueRefund` para composição

Se hoje:

```text
IssueRefund.execute()
```

abre uma UoW própria, não chamar esse método dentro de outra UoW.

Extrair primitive compartilhada.

Por exemplo:

```text
RefundMutationBuilder
```

ou:

```text
PrepareRefundMutation
```

Então:

```text
IssueRefund
       └── usa RefundMutationBuilder

FinancialEffectExecutor
       └── usa RefundMutationBuilder
```

---

# 24. Não duplicar regra de over-refund

A mesma primitive deve preservar:

```text
refunded + requested <= payment amount
```

---

# 25. Implementar `RETAIN`

Para Deposit:

```text
CONFIRMED → RETAINED
```

usando:

```text
depositId
expected version
```

do snapshot.

---

# 26. RETAIN não gera novo recebimento

Não criar:

```text
PAYMENT_RECEIVED
```

de novo.

O valor já tinha sido recebido.

---

# 27. RETAIN não gera Refund

Assert físico:

```text
refund rows = 0
```

---

# 28. RETAIN não gera Internal Credit

Assert:

```text
credit delta = 0
```

---

# 29. Registrar retenção

No mínimo:

```text
Deposit.status = RETAINED
Audit
```

E, caso exista necessidade de timeline financeira:

```text
DepositRetained
```

Mas não criar evento sem consumidor.

---

# 30. Implementar `CONVERT_TO_CREDIT`

Usar exatamente:

```text
snapshot.creditDecision.amountCents
snapshot.creditDecision.sources[]
```

Não recalcular valor.

---

# 31. Evoluir origins do Internal Credit

PR-25 possuía origem obrigatória `REFUND`.

Agora adicionar apenas origins com use case real:

```text
REFUND
APPOINTMENT_CANCELLATION
APPOINTMENT_NO_SHOW
```

---

# 32. Não expor essas origins ao caller público

São definidas internamente pelo caso de uso.

---

# 33. Business uniqueness do crédito

Mesmo cancelamento entregue várias vezes:

```text
one logical credit grant
```

Use algo equivalente a:

```text
tenantId
sourceType
sourceOperationId
```

como identidade única.

---

# 34. Multi-source Credit

Se snapshot declarar:

```text
Deposit: 3.000
Payment P1: 2.000
```

e:

```text
credit total = 5.000
```

a projection do cliente sobe exatamente:

```text
+5.000
```

uma vez.

---

# 35. Preservar componentes

Audit/Ledger precisa permitir explicar que os 5.000 vieram de:

```text
3.000 Deposit
2.000 Payment
```

Sem precisar consultar state antigo.

---

# 36. Não criar dois créditos separados sem necessidade

Um fato de cancelamento pode gerar uma única grant:

```text
CREDIT_GRANTED = 5.000
```

com componentes.

Isso simplifica replay e atomicidade.

---

# 37. Deposit convertido em crédito

Se aplicável:

```text
CONFIRMED → CONVERTED_TO_CREDIT
```

com:

```text
version++
```

---

# 38. Implementar `CancelReceivable`

Agora existe informação segura para isso.

Criar:

```bash
nest g service \
  receivables/application/cancel-receivable \
  --project billing-worker
```

se ainda não existe.

---

# 39. Não cancelar Receivable automaticamente por status do Appointment

Somente:

```text
snapshot.receivableDisposition = CANCEL
```

pode comandar isso.

---

# 40. Usar `receivableId + version`

CAS.

Não procurar:

```text
current receivable by appointment
```

no consumer.

---

# 41. Preservar valores

Não zerar:

```text
gross
net
paid
outstanding
```

somente porque status virou:

```text
CANCELED
```

---

# 42. `CANCELED` altera cobrabilidade, não história

Queries de valores a cobrar precisam considerar:

```text
status IN (OPEN, PARTIALLY_PAID)
```

ou equivalente.

---

# 43. PAID não deve ser reescrito silenciosamente

Se Receivable está `PAID`, qualquer cancelamento financeiro precisa estar completamente representado por:

```text
Refund
Credit
Financial decision
```

antes de alterar status, caso essa transição sequer seja permitida.

---

# 44. Não criar movimento monetário falso para cancelar dívida

Se Ledger é monetário:

```text
RECEIVABLE_CANCELED
```

não deve simular dinheiro saindo.

Use:

```text
Receivable state
Audit
```

ou tipo de ledger de obrigação apenas se já fizer parte da semântica atual.

---

# 45. Source operation identity

O consumer não deve depender só de:

```text
eventId
```

para deduplicação.

Precisamos proteger:

```text
same cancellation fact
different event IDs
```

---

# 46. Usar `appointmentChangeId`

Se PR-26 possui um ID de mudança:

```text
appointmentChangeId
```

utilizar.

Senão introduzir uma identidade explícita:

```text
cancellationId
noShowId
```

no fato operacional.

---

# 47. Evitar `appointmentId` puro se possível

É melhor deduplicar pelo fato:

```text
AppointmentCancellation:cancellationId
```

do que apenas pelo agregado.

---

# 48. Registrar consumo do evento

Reutilizar Reliability/Idempotency.

O consumer precisa poder retornar:

```text
APPLIED
REPLAY
RECONCILIATION_REQUIRED
INVALID
```

de forma explícita.

---

# 49. UnitOfWork financeira

Para `RETURN`, uma única UoW pode ter:

```text
Deposit transition
+
Payment refund CAS(es)
+
Refund records
+
Receivable transition
+
Ledger movements
+
Audit
+
Outbox
+
event/business idempotency
```

---

# 50. Para CREDIT

```text
Deposit transition
+
Payment source validation/mutations quando necessário
+
CustomerCredit balance mutation
+
Receivable transition
+
Ledger
+
Audit
+
Outbox
+
event consumption
```

---

# 51. Para RETAIN

```text
Deposit transition
+
Receivable effect if snapshot says so
+
Audit
+
event consumption
```

---

# 52. `expectedChanges` obrigatório

A correção introduzida no PR-24 passa a ser uma proteção crítica.

Cada CAS:

```text
expectedChanges = 1
```

Mismatch:

```text
abort D1 batch
```

---

# 53. Reconciliation após rollback

Se o batch falhar por CAS:

```text
financial UoW rollback
↓
classify FINANCIAL_DECISION_CONFLICT
↓
persist reconciliation issue
```

A issue não pode fazer parte do batch que acabou de ser abortado.

---

# 54. Reconciliation idempotente

Unique algo equivalente a:

```text
tenant
sourceOperationId
issueType
```

---

# 55. INVALID não é reconciliation de stale

Pode registrar observabilidade/permanent failure.

Não tratar:

```text
fingerprint tampered
```

da mesma forma que uma legítima mudança de estado.

---

# 56. Teste físico `RETURN`

Criar:

```text
test/workers/appointment-financial-consumers.spec.ts
```

Cenário simples:

```text
Deposit CONFIRMED
policy RETURN
cancel
deliver event
```

Resultado:

```text
Deposit RETURNED
Refund exactly once
Ledger correct
Audit correct
```

---

# 57. Teste multi-Payment RETURN

Exemplo:

```text
P1 allocated = 4.000
P2 allocated = 1.000
```

Após consumer:

```text
P1.refunded += 4.000
P2.refunded += 1.000

P1.version += 1
P2.version += 1
```

---

# 58. Validar allocations exatas

Não apenas:

```text
total refund = 5.000
```

Validar cada Payment.

---

# 59. Teste RETAIN

Resultado:

```text
Deposit RETAINED
Refunds = 0
Credit delta = 0
```

---

# 60. Teste CREDIT

Resultado:

```text
Credit balance += frozen amount
Deposit correct state
Ledger CREDIT_GRANTED
```

---

# 61. Teste `NONE`

Resultado:

```text
financial mutations = 0
event marked consumed
```

---

# 62. Teste No-show

Usar snapshot real gerado para no-show.

Assert:

```text
financial disposition applied once
Session count = 0
Package consumption = 0
```

---

# 63. Stale Deposit

Snapshot:

```text
deposit.version=3
```

Alterar Deposit para version 4.

Deliver.

Esperado:

```text
STALE
reconciliation issue OPEN

Refund=0
Credit=0
Retain=0
```

---

# 64. Stale Receivable

Snapshot:

```text
version=5
```

Antes do delivery:

```text
RegisterPayment
→ version=6
```

Esperado:

```text
reconciliation
```

---

# 65. Stale Payment

Gerar snapshot.

Depois:

```text
manual IssueRefund
```

Payment version aumenta.

Consumer:

```text
STALE
```

---

# 66. Fingerprint inválido

Modificar allocation no evento.

Esperado:

```text
INVALID
financial mutations = 0
```

---

# 67. Não abrir reconciliation como se state tivesse mudado

Reason deve indicar snapshot inválido.

---

# 68. Concorrência: cancel vs ConfirmDeposit

Criar suíte:

```text
test/workers/appointment-financial-concurrency.spec.ts
```

Rodar de fato as duas operações concorrentes.

---

# 69. Resultados aceitáveis

### Caso A

ConfirmDeposit vence antes do builder:

```text
builder snapshots CONFIRMED
→ correct effect
```

### Caso B

Builder vê state anterior:

```text
Deposit changes
→ consumer detects STALE
→ reconciliation
```

Ambos são seguros.

---

# 70. Resultado inaceitável

```text
Deposit CONFIRMED
Appointment CANCELED
No financial effect
No reconciliation
```

Esse estado nunca pode ocorrer silenciosamente.

---

# 71. Cancel vs RegisterPayment

Mesmo padrão.

Ou:

```text
snapshot includes payment
```

ou:

```text
payment makes snapshot stale
→ reconciliation
```

---

# 72. Automatic refund vs manual refund

Rodar simultaneamente.

Invariante:

```text
totalRefunded <= Payment.amount
```

sempre.

---

# 73. Dois consumers concorrentes

Mesmo source fact.

Resultado:

```text
one APPLIED
one REPLAY/conflict-safe
```

E:

```text
financial effect count = 1
```

---

# 74. Diferentes eventIds do mesmo fact

Também uma única aplicação.

Isso prova business idempotency além do transport id.

---

# 75. UnitOfWork failure injection

Criar:

```text
test/workers/appointment-financial-uow.spec.ts
```

---

# 76. Falha no segundo Payment refund

Snapshot:

```text
P1 4000
P2 1000
```

Inject failure em P2.

Resultado:

```text
P1.refunded unchanged
P2.refunded unchanged
versions unchanged
Deposit unchanged
Ledger=0
Audit=0
```

---

# 77. Falha no Credit balance mutation

Se Deposit já teria transition:

```text
whole batch rollback
```

Deposit continua anterior.

---

# 78. Falha no Ledger

Nenhum efeito financeiro fica persistido.

---

# 79. Falha no Audit

Seguir a policy atual de atomicidade:

```text
financial effect rolled back
```

---

# 80. Falha no Outbox

Se o Outbox é necessário para projection externa:

```text
effect rolled back
```

de acordo com Reliability foundation atual.

---

# 81. CAS mismatch físico

Forçar version stale entre validation e commit.

Esperado:

```text
expectedChanges failure
↓
whole batch rollback
↓
FINANCIAL_DECISION_CONFLICT
↓
one reconciliation issue
```

---

# 82. Replay

Para cada disposition testar:

```text
same event 20x
```

e validar:

```text
RETURN → one refund effect
RETAIN → one transition
CREDIT → one credit grant
```

---

# 83. ACK-loss Operations → Billing

Fluxo:

```text
Operations sends AppointmentCanceled
↓
Billing commits
↓
Operations doesn't mark SENT
↓
redelivery
```

Billing:

```text
REPLAY
```

---

# 84. ACK-loss Billing → Operations

Para:

```text
RefundIssued
InternalCreditGranted
```

Operations timeline deve permanecer:

```text
1 row per source event/business fact
```

---

# 85. Lease recovery

Reusar `DispatchOutboxBatch`.

Não criar novo scheduler/retry framework.

---

# 86. E2E Cancellation RETURN

Criar:

```text
test/workers/cancellation-return-e2e.spec.ts
```

Fluxo:

```text
CreateAppointment
↓
Deposit
↓
ConfirmDeposit
↓
CancelAppointment
↓
AppointmentCanceled
↓
Billing consumer
↓
Refund
↓
RefundIssued
↓
Operations
```

Resultado final:

```text
Appointment CANCELED
Deposit RETURNED

Refund = 1

Timeline:
APPOINTMENT_CANCELED
REFUND_ISSUED
```

---

# 87. E2E RETAIN

```text
Appointment CANCELED
Deposit RETAINED
Refund=0
Credit=0
```

---

# 88. E2E CREDIT

```text
Appointment CANCELED
Deposit CONVERTED_TO_CREDIT
InternalCredit correct
Credit event/timeline correct
```

---

# 89. E2E No-show

```text
Appointment CONFIRMED
↓
time > tolerance
↓
MarkNoShow
↓
Billing effect
```

Assert:

```text
Appointment NO_SHOW
Session = none
PackageMovement = 0
financial effect exactly once
```

---

# 90. Não mexer no profile dentro do Billing

No-show relationship/profile continua responsabilidade do Operations.

Billing apenas executa dinheiro.

---

# 91. Package regression

Reprovar explicitamente:

```text
Cancel → package consumption 0
NoShow → package consumption 0
Reschedule → package consumption 0
```

---

# 92. Não restaurar Package automaticamente

Se encontrar unit consumption incompatível:

```text
reconciliation/inconsistent state
```

Não:

```text
remainingQuantity++
```

---

# 93. Tenant isolation

Testar:

```text
event tenant A + Deposit tenant B
event tenant A + Receivable B
event tenant A + Payment B
event tenant A + Credit account B
```

Nenhuma mutation.

---

# 94. Customer isolation

Mesmo tenant, outro cliente:

```text
INVALID
```

---

# 95. Receivable/Payment consistency

Payment precisa pertencer exatamente ao Receivable congelado.

Caso contrário:

```text
INVALID_FINANCIAL_DECISION
```

---

# 96. Observabilidade

Log estruturado:

```text
operation=ApplyAppointmentFinancialEffects
source=CANCELLATION|NO_SHOW
disposition=RETURN|RETAIN|CREDIT|NONE
result=APPLIED|REPLAY|STALE|CONFLICT|INVALID
```

---

# 97. Não logar valores detalhados por padrão

Valores ficam em:

```text
Audit
Ledger
domain records
```

Logs devem ser diagnósticos, não extrato financeiro.

---

# 98. Métricas

Baixa cardinalidade:

```text
financial_consumer.applied
financial_consumer.replay
financial_consumer.stale
financial_consumer.conflict
financial_consumer.invalid

financial_effect.refund
financial_effect.credit
financial_effect.retain

financial_reconciliation.created
```

---

# 99. Não usar IDs como labels

Nada de:

```text
appointmentId
tenantId
paymentId
```

nas labels métricas.

---

# 100. Migration

Pode ser necessária:

```text
0026_financial_consumer_activation.sql
```

somente se houver mudança física, por exemplo:

```text
Deposit new statuses
Refund source typing
business uniqueness index
source operation id
```

Antes:

```bash
ls database/d1/migrations
grep -R "RETURNED\|RETAINED\|CONVERTED_TO_CREDIT" database apps -n
```

---

# 101. Índices

Possíveis necessidades:

```text
financial_reconciliation_issues(
  tenant_id,
  status,
  created_at
)

refunds(
  tenant_id,
  source_type,
  source_id
)
```

Só adicionar após verificar queries.

---

# 102. Free-tier continua simples

Nenhuma nova infraestrutura Cloudflare é necessária.

Continuar com:

```text
D1
Service Bindings
Outbox
workerd tests
```

Sem:

```text
KV
R2
Queue
Cron
polling
```

---

# 103. Criar script de consumers

```bash
npm run test:appointment-financial-consumers
```

Cobertura:

```text
NONE
RETURN
RETAIN
CREDIT
replay
invalid
```

---

# 104. Criar stale test

```bash
npm run test:appointment-financial-stale
```

Cobrir:

```text
Deposit
Receivable
Payment
```

---

# 105. Criar UoW test

```bash
npm run test:appointment-financial-uow
```

---

# 106. Criar concurrency test

```bash
npm run test:appointment-financial-concurrency
```

---

# 107. Gate específico

Criar:

```bash
npm run gate:appointment-financial-consumers
```

Incluindo:

```text
consumers
RETURN
RETAIN
CREDIT

invalid/stale
CAS conflict
reconciliation

UoW failure injection
replay
ACK-loss
tenant isolation
E2E
```

---

# 108. Gate PR

```bash
npm run gate:pr26.5
```

Com:

```text
gate:pr26.4.1
+
gate:appointment-financial-consumers
+
gate:appointment-change-safety
+
workers dry-run
```

---

# 109. Readiness final

Atualizar:

```text
docs/plans/appointment-change-readiness.md
```

Resultado esperado:

```text
FinancialDecisionReady           PASS

AppointmentCanceledConsumer      PASS
AppointmentNoShowConsumer        PASS

ReturnEffect                     PASS
RetainEffect                     PASS
CreditEffect                     PASS

PaymentRefund                    PASS
ReceivableCancellation           PASS

SnapshotValidation               PASS
StaleDetection                   PASS
CASConflictDetection             PASS
ReconciliationPersistence        PASS

Replay                           PASS
ACKLoss                          PASS
FinancialConcurrency             PASS
TenantIsolation                  PASS

FinancialConsumers               PASS

AppointmentChangeReady           PASS
```

---

# 110. Definition of Done — Consumers

```text
[ ] AppointmentCanceled ativo
[ ] AppointmentNoShowRecorded ativo

[ ] validator obrigatório

[ ] consumer não consulta policy

[ ] consumer não calcula allocation

[ ] consumer não descobre recursos financeiros

[ ] consumer usa snapshot V2 congelado
```

---

# 111. Definition of Done — RETURN

```text
[ ] Deposit exato
[ ] version exata

[ ] Payments exatos

[ ] allocation exata por Payment

[ ] Refund reutiliza primitive PR-25

[ ] Payment.version incrementa

[ ] over-refund impossível

[ ] Deposit transition CAS

[ ] Ledger append-only

[ ] replay seguro
```

---

# 112. Definition of Done — RETAIN

```text
[ ] Deposit exato

[ ] CONFIRMED → RETAINED

[ ] version CAS

[ ] Refund = 0

[ ] Credit = 0

[ ] Audit

[ ] replay seguro
```

---

# 113. Definition of Done — CREDIT

```text
[ ] sources exatas

[ ] valor total congelado

[ ] source versions

[ ] Deposit transition quando aplicável

[ ] CustomerCredit incrementa uma vez

[ ] source business uniqueness

[ ] Ledger CREDIT_GRANTED

[ ] replay seguro
```

---

# 114. Definition of Done — Receivable

```text
[ ] CancelReceivable explícito

[ ] receivableId/version vindos do snapshot

[ ] sem DELETE

[ ] valores históricos preservados

[ ] PAID não reescrito silenciosamente

[ ] status CANCELED excluído da cobrança ativa
```

---

# 115. Definition of Done — Reconciliation

```text
[ ] STALE → one OPEN issue

[ ] CAS conflict → one OPEN issue

[ ] INVALID → no financial mutation

[ ] duplicate delivery → no duplicate issue

[ ] Appointment não é revertido

[ ] state durável e observável
```

---

# 116. Definition of Done — UnitOfWork

```text
[ ] multi-Payment refund atômico

[ ] Deposit + Refund atômico

[ ] Deposit + Credit atômico

[ ] Receivable effects atômicos

[ ] Ledger atômico

[ ] Audit atômico

[ ] Outbox atômico

[ ] business/event idempotency atômico

[ ] expectedChanges mismatch aborta tudo
```

---

# 117. Definition of Done — Concurrency

```text
[ ] Cancel vs ConfirmDeposit

[ ] Cancel vs RegisterPayment

[ ] automatic refund vs manual refund

[ ] competing consumer instances

[ ] conflicting Deposit disposition

[ ] no over-refund

[ ] no double credit

[ ] no contradictory Deposit lifecycle
```

---

# 118. Definition of Done — E2E

```text
[ ] Cancellation RETURN

[ ] Cancellation RETAIN

[ ] Cancellation CREDIT

[ ] No-show financial effect

[ ] Operations → Billing real Service Binding

[ ] Billing → Operations real Service Binding

[ ] timeline deduplicated

[ ] ACK-loss recoverable
```

---

# 119. Definition of Done — Agenda/package

```text
[ ] Cancel releases slot

[ ] Cancel consumes package = 0

[ ] No-show consumes package = 0

[ ] No-show Session count = 0

[ ] Reschedule remains PASS

[ ] no package restoration invented
```

---

# 120. Definition of Done — Free-first

```text
[ ] bounded D1 mutations

[ ] Service Bindings

[ ] Outbox

[ ] no Queue

[ ] no KV

[ ] no R2

[ ] no Cron

[ ] no polling
```

---

# 121. Regression obrigatória

Executar os gates anteriores relevantes:

```text
PR23.3 PASS
PR24 PASS
PR25 PASS

PR26 PASS
PR26.1 PASS
PR26.2 PASS
PR26.3 PASS
PR26.4 PASS
PR26.4.1 PASS

PackageReadyForPayment PASS
Payment concurrency PASS
Refund concurrency PASS
```

---

# 122. Comandos finais

```bash
npm run lint
npx tsc --build --force

npm run test
npm run test:workers

npm run test:appointment-financial-consumers
npm run test:appointment-financial-stale
npm run test:appointment-financial-uow
npm run test:appointment-financial-concurrency

npm run gate:pr26.4.1
npm run gate:appointment-financial-consumers
npm run gate:appointment-change-safety
npm run gate:pr26.5

npm run workers:dry-run
git diff --check
```

Resultado esperado:

```text
PASS
```

---

# 123. Relatório pós-implementação esperado

O relatório do Codex deveria terminar aproximadamente assim:

```text
PR-26.5 — Financial Consumer Activation

Baseline
PR26.4.1:

Consumers
AppointmentCanceled:
AppointmentNoShow:
snapshot validation:
financial inference:
policy reevaluation:

RETURN
Deposit:
Deposit version:
Payment allocations:
Payment versions:
Refund:
Ledger:

RETAIN
Deposit:
status:
version:
Refund:
Credit:

CREDIT
sources:
amount:
Deposit:
Credit balance:
business uniqueness:
Ledger:

Receivable
status:
version:
historical amounts:

Invalid Snapshot
fingerprint:
tenant:
source mismatch:
financial effects:

Stale Decision
Deposit:
Receivable:
Payment:
reconciliation:

CAS Conflict
expectedChanges:
rollback:
reconciliation:

Replay
same event:
same fact/different event:
refund:
credit:
retain:

Concurrency
cancel-vs-confirmDeposit:
cancel-vs-registerPayment:
automatic-vs-manual-refund:
consumer-vs-consumer:
conflicting disposition:

UnitOfWork
multi-payment refund:
deposit+refund:
deposit+credit:
receivable:
ledger:
audit:
outbox:
idempotency:
failure injection:

ACK Loss
Operations→Billing:
Billing→Operations:
lease recovery:

E2E
Cancel RETURN:
Cancel RETAIN:
Cancel CREDIT:
No-show:

Package / Session
Cancel package consumption:
No-show package consumption:
No-show Session:
Reschedule regression:

Tenant Isolation
event:
Deposit:
Receivable:
Payment:
Refund:
Credit:
Reconciliation:

Free Tier
D1:
Bindings:
KV:
R2:
Queue:
Cron:

FinancialDecisionReady:
FinancialConsumers:
AppointmentChangeReady:

Quality
unit:
workers:
consumer tests:
stale tests:
UoW:
concurrency:
lint:
typecheck:
dry-runs:
gate:pr26.5:

Remaining blockers:

Next PR:
```

# Depois do PR-26.5

Se o resultado for:

```text
AppointmentChangeReady = PASS
```

a próxima etapa deixa finalmente de ser a agenda manual.

O próximo PR recomendado passa a ser:

# PR-27 — Scheduled Operational Processing Foundation

Mas eu o dividiria desde o início para proteger o plano Cloudflare Free:

```text
PR-27
Scheduler Foundation
        │
        ├── Cron entrypoint
        ├── bounded query
        ├── small batch
        ├── lease/claim
        ├── idempotent JobRun
        ├── execution budget
        ├── continuation/checkpoint
        └── observability
```

Depois:

```text
PR-27.1 — Deposit Expiration Automation

PR-27.2 — Confirmation / No-show Candidate Processing

PR-27.3 — Return Follow-up Processing
```

Sem varrer todas as tabelas ou todos os tenants a cada execução.

Portanto, o próximo PR agora é **PR-26.5 — Financial Consumer Activation + RETURN / RETAIN / CREDIT Qualification**. O PR-26.4.1 eliminou o último motivo arquitetural para o consumer “descobrir dinheiro”: ele já recebe Deposit, Receivable, Payments, versões, refundable amounts e allocations. Agora é hora de executar exatamente esse plano sob `D1UnitOfWork`, CAS e idempotência, e provar fisicamente que `STALE`, concorrência, replay e ACK-loss nunca conseguem produzir over-refund, crédito duplicado ou estado financeiro parcial.
