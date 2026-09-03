Com o estado atual do **PR-26.1**, o próximo PR deve fechar exatamente o que ainda impede `AppointmentChangeReady = PASS`.

O próximo passo correto é:

# PR-26.2 — Financial Effects Execution + Stale Decision Reconciliation Qualification

O PR-26.1 já resolveu a parte de **decisão**:

```text
Operations
→ solicita avaliação ao Billing
→ Billing responde READY/BLOCKED
→ decisão financeira é congelada
→ Appointment muda de estado
→ Outbox é produzido
```

O que falta agora é transformar essa decisão congelada em **efeitos financeiros reais, idempotentes e reconciliáveis**:

```text
AppointmentCanceled / AppointmentNoShowRecorded
                    │
                    ▼
                  Billing
                    │
        ┌───────────┼────────────┐
        ▼           ▼            ▼
     REFUND       CREDIT       RETAIN
        │           │            │
        └───────────┴────────────┘
                    │
                    ▼
            Receivable effects
                    │
                    ▼
                  Ledger
                    │
                    ▼
             Audit + Outbox
```

Ao final deste PR, o resultado esperado deve ser:

```text
CancellationFinancialEffectsReady = PASS
NoShowFinancialEffectsReady       = PASS
StaleDecisionSafety               = PASS
AppointmentChangeReady            = PASS
```

---

# 1. Escopo exato do PR-26.2

Entram neste PR:

```text
Billing consumer AppointmentCanceled

Billing consumer AppointmentNoShowRecorded

RETURN
RETAIN
CONVERT_TO_CREDIT

CancelReceivable

financial decision version validation

stale financial decision detection

reconciliation-required representation

Refund reuse

Internal Credit reuse

Deposit lifecycle extension

Billing local UnitOfWork

event replay

ACK-loss Operations → Billing

ACK-loss Billing → Operations

financial concurrency tests

failure injection tests

full cancellation/no-show E2E

gate:pr26.2
```

Continuam fora:

```text
TRANSFER de sinal, se o contrato ainda não estiver completo

Package restoration

automatic reconciliation worker

Cron

automatic no-show

payment gateway

chargeback

cash closing

manual financial adjustment
```

---

# 2. Baseline obrigatória

Antes de qualquer alteração:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr25
npm run gate:pr26
npm run gate:pr26.1
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

Registrar formalmente:

```text
CancellationPolicyReady = PASS
NoShowPolicyReady        = PASS

FinancialEffectExecution = BLOCKED
StaleDecisionSafety      = BLOCKED

AppointmentChangeReady   = BLOCKED
```

---

# 3. Criar plano formal

Criar:

```text
docs/plans/PR-26.2-financial-effects-stale-decision-reconciliation.md
```

Estrutura recomendada:

```text
Objective

Baseline

Current blockers

Financial decision contract

Financial version/fingerprint

AppointmentCanceled consumer

AppointmentNoShowRecorded consumer

Deposit effects

Refund

Internal Credit

Receivable cancellation

Stale financial decision

Reconciliation required

Idempotency

UnitOfWork

Replay

ACK-loss

Concurrency

Tenant isolation

Timeline

Observability

Free-tier impact

Definition of Done

Out of Scope
```

---

# 4. Não recalcular a policy no consumer

Esse é provavelmente o ponto mais importante do PR.

O PR-26.1 já congelou uma decisão:

```text
financialDecisionSnapshot
```

Então o consumer Billing deve executar:

```text
snapshot decidido anteriormente
```

e **não**:

```text
ler policy atual
→ recalcular
→ executar nova decisão
```

Isso evita:

```text
cancelamento às 10:00
policy = RETURN

policy alterada às 10:05
policy = RETAIN

replay às 10:10
→ resultado diferente
```

O replay precisa produzir o mesmo efeito lógico.

---

# 5. Evoluir o contrato financeiro congelado

Inspecionar primeiro o contrato criado no PR-26.1.

Ele precisa conter identidade suficiente para detectar mudança de estado.

Conceitualmente:

```text
FinancialDecisionSnapshot {
  policyId
  policyVersion

  evaluatedAt

  depositId?
  depositStatus?
  depositAmountCents?

  receivableId?
  receivableStatus?
  receivableOutstandingCents?

  refundablePaymentAmountCents?

  depositDisposition
  paymentDisposition
  receivableDisposition

  financialFingerprint
}
```

Não precisa ser exatamente esse formato.

---

# 6. Criar `financialFingerprint`

O objetivo não é segurança criptográfica externa.

É detectar:

```text
estado financeiro mudou entre evaluation e apply
```

Pode ser hash determinístico de:

```text
deposit id/status/version
receivable id/status/version
relevant payment totals/version
credit-related state quando aplicável
```

Não incluir:

```text
correlationId
requestId
timestamp aleatório
```

---

# 7. Melhor ainda: usar versões explícitas

Se Deposit e Receivable já possuem:

```text
updatedAt
revision
version
```

preferir versão explícita.

Exemplo:

```text
depositVersion
receivableVersion
paymentsVersion/fingerprint
```

O importante é que o consumer consiga afirmar:

```text
snapshot ainda representa o estado atual?
```

---

# 8. Criar `ValidateFinancialDecisionSnapshot`

No Billing:

```bash
nest g service \
  appointment-change-policies/application/validate-financial-decision-snapshot \
  --project billing-worker
```

Resultado:

```text
VALID
STALE
INVALID
```

Com reason codes.

---

# 9. `STALE` não é erro genérico

Exemplo:

```text
FINANCIAL_DECISION_STALE
```

deve ser tratado separadamente de:

```text
DATABASE_ERROR
UNKNOWN_ERROR
```

Porque `STALE` exige reconciliação funcional.

---

# 10. Criar representação de reconciliation

Não precisa criar um engine complexo.

Mas o estado precisa ser persistente/observável.

Uma solução simples:

```text
financial_reconciliation_issues
```

com:

```text
id
tenant_id

source_event_id
appointment_id

type
reason_code

expected_fingerprint
actual_fingerprint

status = OPEN

created_at
resolved_at?
```

---

# 11. Migration `0023`

Se `0022` é a última:

```text
0023_financial_effect_execution_reconciliation.sql
```

Pode incluir:

```text
financial_reconciliation_issues

deposit lifecycle additions

receivable CANCELED status
```

somente se necessários.

---

# 12. Não criar tabela de reconciliation se Outbox DEAD já supre tudo

Antes de criar:

```bash
grep -R "DEAD" apps libs database -n
grep -R "reconciliation" apps libs database -n
```

Se o Outbox já possui:

```text
DEAD
last_error
reason code
```

e isso é suficiente operacionalmente, pode reutilizar.

O requisito é:

```text
observable + durable
```

não necessariamente nova tabela.

---

# 13. Criar consumer `AppointmentCanceled`

No Billing:

```bash
nest g service \
  appointment-change-policies/application/apply-appointment-canceled-financial-effects \
  --project billing-worker
```

Fluxo:

```text
event
↓
eventId replay check
↓
validate decision snapshot
↓
VALID?
↓
execute frozen disposition
↓
local UnitOfWork
↓
mark integration event consumed
```

---

# 14. Se `STALE`

Não aplicar:

```text
Refund
Credit
Retain
Receivable cancellation
```

Persistir:

```text
RECONCILIATION_REQUIRED
```

e retornar classificação adequada ao dispatcher.

---

# 15. Não retry infinito para stale decision

`STALE` não é transient na maioria dos casos.

Classificar como algo como:

```text
PERMANENT_RECONCILIATION_REQUIRED
```

em vez de:

```text
retry forever
```

---

# 16. Appointment continua cancelado

Muito importante:

```text
Operations:
Appointment = CANCELED
```

não é revertido porque Billing detectou stale state.

A inconsistência fica explícita para reconciliação.

---

# 17. Disposition `RETURN`

Reutilizar:

```text
IssueRefund
```

Não duplicar:

```text
refund repository logic
refund CAS
ledger
audit
```

---

# 18. Origem do refund deve ser congelada

O Refund precisa saber que nasceu de:

```text
APPOINTMENT_CANCELLATION
```

ou source equivalente.

Isso ajuda em idempotência de negócio.

---

# 19. Business uniqueness do refund automático

Mesmo que o evento tenha IDs diferentes por bug, não deveria gerar dois refunds do mesmo efeito de cancelamento.

Criar identidade lógica, por exemplo:

```text
tenant
appointmentId
financialEffectType=REFUND
sourcePaymentId
```

ou source operation equivalente.

---

# 20. Não impedir refunds parciais legítimos normais

A uniqueness do cancelamento automático não deve quebrar:

```text
manual partial refund A
manual partial refund B
```

que continuam possíveis quando válidos.

---

# 21. Disposition `CONVERT_TO_CREDIT`

Reutilizar:

```text
GrantInternalCredit
```

Evoluir as origins se necessário.

PR-25 relatou:

```text
origem obrigatória REFUND
```

Agora existe uma origem concreta nova:

```text
CANCELLATION
NO_SHOW
```

Não bypassar validation.

---

# 22. Evoluir origem de Internal Credit

Algo como:

```text
REFUND
CANCELLATION
NO_SHOW
```

somente se cada uma tiver use case real.

Não adicionar:

```text
PROMOTION
BONUS
MANUAL
```

sem requisito.

---

# 23. Credit business uniqueness

Para o mesmo cancelamento:

```text
one credit grant
```

mesmo com replay.

Constraint/source identity deve garantir isso.

---

# 24. Disposition `RETAIN`

O valor continua com a empresa.

O Deposit precisa refletir isso historicamente.

Se ainda não existe:

```text
RETAINED
```

agora implementar.

---

# 25. Evoluir `Deposit` lifecycle

De:

```text
PENDING
→ CONFIRMED
→ EXPIRED
→ CANCELED
```

para suportar, quando confirmado:

```text
CONFIRMED
├── RETURNED
├── RETAINED
└── CONVERTED_TO_CREDIT
```

Somente se isso fizer sentido no modelo real.

---

# 26. Essas transições devem ser terminais

Por exemplo:

```text
RETAINED → RETURNED
```

não deve acontecer normalmente.

Correção posterior deve usar novo movimento/fluxo explícito.

---

# 27. CAS no Deposit

Exemplo:

```sql
UPDATE deposits
SET status = 'RETAINED'
WHERE tenant_id = ?
  AND id = ?
  AND status = 'CONFIRMED'
```

`changes=1`.

---

# 28. Replay Deposit

Se já:

```text
RETAINED
```

e chega o mesmo source event:

```text
REPLAY
```

Sem novo Audit.

---

# 29. Decisão conflitante

Se:

```text
Deposit RETURNED
```

mas chega evento pedindo:

```text
RETAIN
```

não tentar alterar.

Resultado:

```text
FINANCIAL_DECISION_CONFLICT
```

→ reconciliation.

---

# 30. Receivable cancelation

Agora existe use case real.

Criar:

```bash
nest g service \
  receivables/application/cancel-receivable \
  --project billing-worker
```

---

# 31. Quando pode cancelar Receivable

Somente se financial decision congelada mandar isso.

Não:

```text
Appointment canceled
→ always cancel Receivable
```

---

# 32. Estados

Se normativamente coerente:

```text
OPEN
PARTIALLY_PAID
PAID
CANCELED
```

Mas:

```text
PAID → CANCELED
```

precisa ser analisado.

Se pago e depois cancelado, talvez:

```text
Receivable remains PAID
Refund records money out
```

seja mais correto.

---

# 33. Minha recomendação

```text
OPEN → CANCELED
```

quando obligation deixa de existir.

```text
PARTIALLY_PAID / PAID
```

não devem ser simplesmente cancelados sem representar settlement/refund corretamente.

A decisão financeira deve tratar cada situação.

---

# 34. Não apagar outstanding

Não:

```text
outstanding = 0
```

sem movimento/status justificando.

Se `CANCELED` significa obligation voided:

```text
status = CANCELED
```

e valores históricos permanecem.

---

# 35. Ledger do cancelamento de Receivable

Se o Ledger atual registra somente dinheiro, talvez não precise de movimento monetário.

Pode existir:

```text
RECEIVABLE_CANCELED
```

se o Ledger também registra obrigação.

Verificar semântica atual antes.

---

# 36. Não criar movimento monetário fictício

Cancelar uma dívida de R$ 100 não significa:

```text
cash -100
```

Então cuidado com o Ledger.

---

# 37. `AppointmentNoShowRecorded` consumer

Criar:

```bash
nest g service \
  appointment-change-policies/application/apply-appointment-no-show-financial-effects \
  --project billing-worker
```

Mesmo padrão do cancel.

---

# 38. No-show pode usar os mesmos dispositions

```text
RETURN
RETAIN
CONVERT_TO_CREDIT
NONE
```

Conforme policy congelada.

---

# 39. Não reutilizar `AppointmentCanceled` handler diretamente

Pode compartilhar primitives/policies, mas:

```text
Cancel
NoShow
```

são fatos distintos.

Não transformar NoShow em cancelamento interno apenas por facilidade.

---

# 40. No-show não mexe em Package

Continuar garantindo:

```text
PackageMovement CONSUMPTION = 0
```

---

# 41. Cancelamento não restaura Package

Se nenhuma unidade foi consumida, nada a fazer.

Se unidade já consumida:

```text
RECONCILIATION_REQUIRED
```

Não incrementar saldo automaticamente.

---

# 42. Criar/expandir contracts

Em:

```text
libs/contracts/src/appointment-changes/
```

ou estrutura atual.

Adicionar:

```text
AppointmentCanceled
AppointmentNoShowRecorded
FinancialDecisionSnapshot
FinancialEffectResult
FinancialReconciliationReason
```

Sem entidades de domínio.

---

# 43. Dispatcher Operations → Billing

Adicionar/confirmar routes:

```text
AppointmentCanceled
→ BILLING_SERVICE

AppointmentNoShowRecorded
→ BILLING_SERVICE
```

---

# 44. Billing WorkerEntrypoint

Expor RPCs internos:

```text
applyAppointmentCanceledFinancialEffects()
applyAppointmentNoShowFinancialEffects()
```

ou método genérico apenas se já houver contrato consistente.

---

# 45. Não criar endpoint público para aplicar efeito

Isso é integração interna.

Nenhum:

```http
POST /billing/apply-cancellation
```

público.

---

# 46. Outbox Billing → Operations

Refund/Credit já emitem fatos.

Para `RETAIN`, talvez seja útil emitir:

```text
DepositRetained
```

se Operations Timeline precisa mostrar.

Mas não emitir eventos sem consumidor.

---

# 47. Timeline mínima

Após cancelamento:

```text
APPOINTMENT_CANCELED
```

já existe localmente no Operations.

Se houver consequência:

```text
REFUND_ISSUED
```

ou:

```text
INTERNAL_CREDIT_GRANTED
```

entra depois via Billing.

Para retenção:

```text
DEPOSIT_RETAINED
```

é útil para histórico financeiro, se permission-aware.

---

# 48. Criar `DepositRetained` apenas se necessário

Não precisa de evento só por simetria.

Mas o histórico financeiro deve ser explicável.

---

# 49. Stale decision — caso principal

Criar suíte:

```text
test/workers/cancellation-stale-financial-decision.spec.ts
```

---

# 50. Cenário 1 — Deposit PENDING → CONFIRMED

Timeline:

```text
T0 evaluate cancellation
Deposit=PENDING

T1 Operations commits cancel

T2 ConfirmDeposit wins before Billing apply

T3 Billing applies AppointmentCanceled
```

Expected:

```text
STALE
```

Nenhum:

```text
refund
credit
retain
```

---

# 51. Estado final

```text
Appointment = CANCELED
Deposit = CONFIRMED
Financial effect = RECONCILIATION_REQUIRED
```

Isso parece estranho, mas é melhor que aplicar decisão errada.

---

# 52. Cenário 2 — Receivable muda

Evaluate:

```text
Receivable OPEN
outstanding = 10000
```

Depois:

```text
PaymentReceived 4000
```

Antes do apply.

Consumer deve detectar:

```text
financial snapshot stale
```

se a decisão dependeu daquele saldo.

---

# 53. Cenário 3 — Refund paralelo

Evaluate refundable amount.

Antes de aplicar, outro Refund reduz o refundable amount.

Consumer precisa bloquear stale/over-refund.

A proteção do Refund CAS continua como última linha de defesa.

---

# 54. Não confiar apenas no fingerprint

Mesmo com fingerprint, as primitives:

```text
IssueRefund
GrantInternalCredit
Deposit CAS
Receivable CAS
```

continuam protegidas fisicamente.

Fingerprint é precondition, não substituto da invariável.

---

# 55. Concorrência financeira dedicada

Criar:

```text
test/workers/cancellation-financial-concurrency.spec.ts
```

---

# 56. Race cancel vs ConfirmDeposit

Executar fisicamente, não apenas chamada sequencial simulada.

Resultados válidos:

### ConfirmDeposit primeiro

Evaluation final deve observar `CONFIRMED` ou stale deve ser detectado.

### Cancel evaluation primeiro

Se state mudar antes apply:

```text
reconciliation
```

Nunca ignorar dinheiro confirmado.

---

# 57. Race cancel event replay

20 deliveries:

```text
financial effect = 1
```

---

# 58. Race cancel + manual Refund

Se ambos tentam devolver o mesmo Payment:

```text
cumulative refund <= payment
```

sempre.

Pode acontecer:

```text
manual refund wins
automatic cancellation refund → blocked/stale
```

Isso é válido.

---

# 59. Race credit grants

Mesmo cancelamento/no-show:

```text
one credit grant
```

mesmo com múltiplos eventIds inesperados.

---

# 60. Race RETAIN vs RETURN

Duas decisões conflitantes sobre o mesmo Deposit não podem ambas vencer.

Deposit CAS decide.

---

# 61. UnitOfWork Billing

Para um effect `RETURN`, a unidade local pode envolver:

```text
Deposit transition
Refund
Payment refunded projection
Ledger
Audit
Outbox RefundIssued
Integration event consumed
```

Tudo deve ser atômico localmente.

---

# 62. Para CREDIT

```text
Deposit transition
InternalCredit balance
Ledger
Audit
Outbox InternalCreditGranted
event consumption
```

Atômico.

---

# 63. Para RETAIN

```text
Deposit transition
Audit
optional Outbox
event consumption
```

Atômico.

---

# 64. Failure injection — RETURN

Criar teste:

```text
test/workers/cancellation-financial-uow.spec.ts
```

Falhar em:

```text
Refund insert
Ledger
Audit
Outbox
event idempotency
```

Deposit não pode terminar `RETURNED` parcialmente.

---

# 65. Failure injection — CREDIT

Falhar após:

```text
Deposit transition
```

mas antes de:

```text
credit balance increment
```

Resultado:

```text
both rollback
```

---

# 66. Failure injection — RETAIN

Audit failure:

```text
Deposit remains CONFIRMED
```

se Audit é parte da unidade crítica.

---

# 67. No-show failure injection

Mesmo padrão.

---

# 68. Operations ACK-loss

Fluxo:

```text
Operations Outbox AppointmentCanceled
↓
Billing applies financial effect
↓
Operations fails to mark SENT
```

Redelivery:

```text
Billing REPLAY
```

Sem segundo effect.

---

# 69. Billing ACK-loss

Para Refund/Credit:

```text
Billing outbox
↓
Operations timeline
↓
Billing mark SENT fails
```

Redelivery:

```text
timeline rows = 1
```

---

# 70. Lease recovery

Reutilizar PR-14.

Pelo menos uma prova:

```text
PROCESSING
lease expires
reclaim
redeliver
SENT
```

---

# 71. E2E cancellation — RETURN

Criar:

```text
test/workers/cancellation-financial-e2e.spec.ts
```

Fluxo:

```text
Create Appointment
↓
Confirm Deposit
↓
Cancel
↓
Operations CANCELED
↓
AppointmentCanceled
↓
Billing
↓
Deposit RETURNED
↓
Refund
↓
Ledger
↓
RefundIssued
↓
Operations Timeline
```

---

# 72. Assertions

```text
Appointment CANCELED
Deposit RETURNED

Refund count=1
Ledger REFUND_ISSUED=1

Timeline:
APPOINTMENT_CANCELED=1
REFUND_ISSUED=1
```

---

# 73. E2E cancellation — CREDIT

Expected:

```text
Deposit CONVERTED_TO_CREDIT
CustomerCredit += deposit

Ledger CREDIT_GRANTED=1
Timeline credit event=1
```

---

# 74. E2E cancellation — RETAIN

Expected:

```text
Deposit RETAINED

Refund=0
Credit=0
```

---

# 75. Slot release regression

Em cada cancellation E2E relevante:

```text
Create another Appointment
same professional
same old slot
→ succeeds
```

---

# 76. E2E no-show — RETAIN

```text
Appointment CONFIRMED
Deposit CONFIRMED

advance time beyond tolerance

MarkNoShow
↓
Appointment NO_SHOW
↓
Billing
↓
Deposit RETAINED
```

---

# 77. No Session

Assert:

```text
Session count for appointment = 0
```

---

# 78. No Package consumption

Mesmo com package associado:

```text
remaining unchanged
movement=0
```

---

# 79. No-show relationship effect

Operations:

```text
APPOINTMENT_NO_SHOW
```

entra timeline.

Se configured threshold atingido:

```text
profile → RECURRENT_NO_SHOW
```

Se não:

```text
unchanged
```

---

# 80. Não bloquear NoShow por falha de profile recalculation?

Decidir conforme UoW local.

Como profile é same Operations D1 e efeito normativo, idealmente:

```text
Appointment NO_SHOW
Timeline
relationship facts/profile
Audit
Outbox
Idempotency
```

na mesma operação local, se já estruturado assim.

---

# 81. Cancelamento fora da policy

Se decision snapshot informa:

```text
relationshipImpact = OUT_OF_POLICY_CANCELLATION
```

aplicar fato.

Não reavaliar timing depois.

---

# 82. Criar endpoint de leitura de reconciliation?

Pode ser útil para backoffice:

```http
GET /tenants/:tenantId/financial-reconciliation/issues
```

Mas isso pode ficar fora se o Outbox/observability já fornece suporte suficiente.

Não aumentar escopo sem necessidade.

---

# 83. No mínimo observabilidade

Log estruturado:

```text
operation=ApplyAppointmentCanceledFinancialEffects
result=RECONCILIATION_REQUIRED
reason=FINANCIAL_DECISION_STALE
```

sem valores sensíveis excessivos.

---

# 84. Métricas

```text
appointment.cancel.financial.success
appointment.cancel.financial.stale
appointment.cancel.financial.refund
appointment.cancel.financial.credit
appointment.cancel.financial.retain

appointment.no_show.financial.success
appointment.no_show.financial.stale
```

Low cardinality.

---

# 85. Não colocar `appointmentId` em metric labels

Só logs/traces.

---

# 86. Query safety

Se nova tabela de reconciliation:

```text
tenant
status
created_at
```

index.

Policies já precisam ter:

```text
tenant
service
effective date
```

index.

---

# 87. Migration rerun

Fresh D1:

```text
0001 → 0023
PASS
```

Depois:

```text
No migrations to apply
```

---

# 88. Expandir script existente

Hoje já existe:

```bash
npm run test:cancellation-financial-effects
```

Agora ele deve ser um teste real completo e não parcial.

Cobrir:

```text
RETURN
RETAIN
CREDIT
stale
replay
```

---

# 89. Criar script stale

```bash
npm run test:cancellation-stale-decision
```

---

# 90. Criar script UoW

```bash
npm run test:cancellation-financial-uow
```

---

# 91. Expandir concurrency

```bash
npm run test:appointment-change-concurrency
```

deve agora incluir:

```text
cancel vs check-in
cancel vs reschedule
no-show vs check-in
cancel vs ConfirmDeposit
```

---

# 92. Gate financeiro final

Criar:

```bash
npm run gate:appointment-financial-effects
```

Incluindo:

```text
financial policy
RETURN
RETAIN
CREDIT
stale decision
UoW failures
replay
ACK-loss
```

---

# 93. Gate PR

Criar:

```bash
npm run gate:pr26.2
```

Idealmente:

```text
gate:pr26.1
+
gate:appointment-financial-effects
+
appointment-change concurrency
+
full E2E
+
dry-runs
```

---

# 94. Readiness final

Atualizar:

```text
docs/plans/appointment-change-readiness.md
```

Para:

```text
Reschedule                      PASS

CancellationPolicy              PASS
CancellationExecution           PASS
CancellationFinancialEffects    PASS

NoShowPolicy                    PASS
NoShowExecution                 PASS
NoShowFinancialEffects          PASS

Refund                          PASS
Credit                          PASS
Retain                          PASS

StaleDecisionDetection          PASS
Reconciliation                  PASS

Concurrency                     PASS
Replay                          PASS
ACKLoss                         PASS

AppointmentChangeReady          PASS
```

---

# 95. Definition of Done — consumer Billing

```text
[ ] AppointmentCanceled consumer

[ ] AppointmentNoShowRecorded consumer

[ ] decision snapshot used

[ ] policy not recalculated

[ ] eventId replay protection

[ ] tenant validation
```

---

# 96. Definition of Done — RETURN

```text
[ ] existing IssueRefund reused

[ ] Deposit transitioned appropriately

[ ] over-refund impossible

[ ] Ledger REFUND_ISSUED

[ ] Audit

[ ] Outbox RefundIssued

[ ] replay safe
```

---

# 97. Definition of Done — CREDIT

```text
[ ] existing GrantInternalCredit reused

[ ] Deposit transition

[ ] credit balance tenant/customer scoped

[ ] duplicate grant blocked

[ ] Ledger CREDIT_GRANTED

[ ] Audit

[ ] Outbox

[ ] replay safe
```

---

# 98. Definition of Done — RETAIN

```text
[ ] Deposit RETAINED

[ ] CAS

[ ] no Refund

[ ] no Credit

[ ] Audit

[ ] replay safe
```

---

# 99. Definition of Done — Receivable

```text
[ ] CancelReceivable introduced if required

[ ] only frozen decision may cancel

[ ] historical amounts preserved

[ ] no DELETE

[ ] paid Receivable not silently rewritten

[ ] payment/refund history preserved
```

---

# 100. Definition of Done — stale decision

```text
[ ] financial snapshot has identity/version

[ ] current state validated before apply

[ ] stale Deposit detected

[ ] stale Receivable detected

[ ] stale Payment/refund state detected where relevant

[ ] no incorrect financial effect applied

[ ] Appointment not rolled back

[ ] reconciliation state durable/observable
```

---

# 101. Definition of Done — No-show

```text
[ ] Billing financial consumer

[ ] configured decision applied

[ ] no Session

[ ] no Package consumption

[ ] deposit effect correct

[ ] relationship effect preserved

[ ] timeline

[ ] replay
```

---

# 102. Definition of Done — concurrency

```text
[ ] cancel vs check-in

[ ] cancel vs reschedule

[ ] no-show vs check-in

[ ] cancel vs ConfirmDeposit

[ ] cancellation refund vs manual refund

[ ] conflicting Deposit dispositions

[ ] no contradictory business effects
```

---

# 103. Definition of Done — UnitOfWork

```text
[ ] Deposit + Refund atomic

[ ] Deposit + Credit atomic

[ ] Deposit retain atomic

[ ] Ledger atomic

[ ] Audit atomic

[ ] Outbox atomic

[ ] event consumption/idempotency atomic

[ ] failure injection leaves no partial financial state
```

---

# 104. Definition of Done — ACK-loss

```text
[ ] Operations → Billing redelivery safe

[ ] RefundIssued → Operations safe

[ ] Credit event → Operations safe

[ ] lease recovery preserved

[ ] timeline deduplicated
```

---

# 105. Definition of Done — Package

```text
[ ] canceled Appointment consumes zero package units

[ ] no-show consumes zero package units

[ ] reschedule consumes zero package units

[ ] prior consumption inconsistency detected

[ ] no automatic unit restoration
```

---

# 106. Definition of Done — Security

```text
[ ] tenant-safe financial decision

[ ] tenant-safe consumer

[ ] refund belongs to correct customer/payment

[ ] credit belongs to correct customer

[ ] caller cannot choose refund amount indirectly beyond frozen decision

[ ] financial data not leaked in generic timeline/logs
```

---

# 107. Definition of Done — Free Tier

```text
[ ] D1 only for persistence

[ ] Service Bindings

[ ] Outbox

[ ] bounded queries

[ ] no KV

[ ] no R2

[ ] no Queue

[ ] no Cron

[ ] no polling
```

---

# 108. Regression obrigatória

```text
PR23.3 PASS
PR24 PASS
PR25 PASS
PR26 PASS
PR26.1 PASS

PackageReadyForPayment PASS

Payment PASS
Refund PASS
Internal Credit PASS
Reschedule PASS
```

---

# 109. Comandos finais

Executar:

```bash
npm run lint
npx tsc --build --force

npm run test
npm run test:workers

npm run test:appointment-change-concurrency
npm run test:cancellation-financial-effects
npm run test:cancellation-stale-decision
npm run test:cancellation-financial-uow

npm run gate:pr25
npm run gate:pr26
npm run gate:pr26.1

npm run gate:appointment-financial-effects
npm run gate:appointment-change-safety
npm run gate:pr26.2

npm run workers:dry-run
git diff --check
```

Tudo deve retornar:

```text
PASS
```

---

# 110. Relatório pós-implementação esperado

O Codex deve fechar aproximadamente assim:

```text
PR-26.2 — Financial Effects Execution + Stale Decision Reconciliation

Baseline
PR26:
PR26.1:

Financial Decision
snapshot:
version/fingerprint:
revalidation:
policy recalculation:

AppointmentCanceled Consumer
event:
Billing:
tenant:
replay:

Deposit RETURN
transition:
refund:
ledger:
audit:
outbox:

Deposit RETAIN
transition:
refund:
credit:

Deposit CREDIT
transition:
credit:
ledger:
audit:

Receivable
cancel:
paid state:
history:

No-show Financial Effects
consumer:
deposit:
refund:
credit:
retain:

Stale Decision
deposit changed:
receivable changed:
payment/refund changed:
detection:
financial mutation:
reconciliation:

Concurrency
cancel-vs-checkin:
cancel-vs-reschedule:
no-show-vs-checkin:
cancel-vs-confirmDeposit:
refund-vs-refund:
conflicting disposition:

UnitOfWork
return failure:
credit failure:
retain failure:
audit failure:
outbox failure:
partial states:

Replay
AppointmentCanceled:
AppointmentNoShow:
Refund:
Credit:

ACK Loss
Operations→Billing:
Billing→Operations:
lease recovery:

Package
cancel:
no-show:
reschedule:
restoration:

Timeline
CANCELED:
NO_SHOW:
REFUND:
CREDIT:
RETAIN:

Tenant Isolation
decision:
consumer:
refund:
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

Quality
unit:
workers:
financial effects:
stale decision:
UoW failures:
concurrency:
lint:
typecheck:
dry-runs:
PR26.2 gate:

Remaining blockers:

Next PR:
```

# Depois do PR-26.2

Se o resultado final for:

```text
AppointmentChangeReady = PASS
```

aí sim o fluxo manual do MVP estará muito mais completo:

```text
Create Appointment
↓
Deposit
↓
Confirm
↓
Reschedule
or
Cancel
or
No-show
↓
Financial effects
↓
Session
↓
Completion
↓
Payment / Refund / Credit
```

O próximo PR deve então mudar de foco para **processamento operacional agendado**, e eu recomendaria:

# PR-27 — Scheduled Operational Processing + Pending Actions Foundation

Com escopo inicial restrito a:

```text
Deposit expiration processing
pending confirmations
pending return recommendations
no-show candidates
package expiry candidates
outbox/reconciliation maintenance
```

sem transformar o projeto em uma arquitetura pesada de Queue/Cron.

Para o plano Cloudflare Free, o PR-27 deve avaliar primeiro quais tarefas realmente precisam de scheduler e quais podem continuar:

```text
lazy
manual
bounded
```

Portanto, o próximo passo imediato é **PR-26.2**, porque o PR-26.1 já consegue decidir corretamente “o que deveria acontecer”, mas ainda falta provar e implementar “o que efetivamente acontece” no Billing quando um cancelamento ou falta chega — especialmente nas situações críticas de `RETURN`, `RETAIN`, `CREDIT` e quando o estado financeiro muda entre a decisão e a aplicação.
