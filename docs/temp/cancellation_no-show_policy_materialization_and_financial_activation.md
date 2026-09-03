Com o estado atual do PR-26, o próximo PR deve fechar exatamente as duas capacidades deixadas propositalmente em `fail-closed`: **cancelamento** e **no-show**, incluindo a policy financeira persistida e a integração autoritativa com Billing.

O próximo PR correto é:

# PR-26.1 — Cancellation + No-show Policy Materialization and Financial Activation

O objetivo é sair de:

```text
Reschedule = ACTIVE

Cancellation
→ CANCELLATION_POLICY_UNAVAILABLE

No-show
→ NO_SHOW_POLICY_UNAVAILABLE
```

para:

```text
Reschedule = ACTIVE
Cancellation = ACTIVE
No-show = ACTIVE

Billing policy = persisted
Financial decision = authoritative
Refund/Credit = executable
Replay/ACK-loss = safe
Concurrency = physically qualified
```

## 1. Escopo exato

Entram:

```text
CancellationPolicy persistida

NoShowPolicy persistida

Billing RPCs autoritativos

CancelAppointment
MarkAppointmentNoShow

AppointmentCanceled
AppointmentNoShowRecorded

Refund / Internal Credit consequences

Deposit disposition

Receivable consequence

Package non-consumption

Timeline consumers

relationship-profile effects

concurrency proofs

financial race proofs

gate:pr26.1
```

Continuam fora:

```text
automatic no-show Cron
automatic cancellation
deposit transfer between appointments, se ainda não houver contrato completo
chargeback
gateway de pagamento
cash closing
manual package correction
```

---

# 2. Congelar baseline

Executar primeiro:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr25
npm run gate:pr26
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

Tudo precisa permanecer `PASS`.

Registrar no plano:

```text
RescheduleReady = PASS
CancellationReady = BLOCKED
NoShowReady = BLOCKED
```

---

# 3. Criar o plano formal

Criar:

```text
docs/plans/PR-26.1-cancellation-no-show-financial-activation.md
```

Com:

```text
Objective
Baseline

Cancellation Policy
No-show Policy

Policy persistence
Policy versioning
Policy snapshots

Billing evaluation RPC

CancelAppointment
MarkAppointmentNoShow

Deposit effects
Payment effects
Refund effects
Internal Credit
Receivable effects

Package invariants
Slot release

Relationship effects
Timeline

Concurrency
Financial stale-decision handling

Outbox
Replay
ACK-loss

Definition of Done
Out of Scope
```

---

# 4. Materializar policy no Billing

O bloqueio atual existe porque o Billing não possui fonte autoritativa para decidir efeitos financeiros.

Criar módulo, se ainda não existir:

```bash
nest g module appointment-change-policies \
  --project billing-worker
```

Estrutura:

```text
appointment-change-policies/
├── domain/
├── application/
├── ports/
└── adapters/
```

---

# 5. Não criar motor genérico de regras

Evitar algo como:

```text
conditions[]
actions[]
expressions[]
JSON rules engine
```

Neste momento basta uma policy tipada e previsível.

---

# 6. Criar `CancellationPolicy`

```bash
nest g class \
  appointment-change-policies/domain/cancellation-policy \
  --project billing-worker \
  --no-spec
```

Campos conceituais mínimos:

```text
id
tenantId

serviceId?

status

effectiveFrom
effectiveUntil?

customerCancellation
companyCancellation
professionalCancellation

createdAt
updatedAt
```

Cada regra precisa descrever explicitamente a disposição financeira aplicável.

---

# 7. Criar `NoShowPolicy`

```bash
nest g class \
  appointment-change-policies/domain/no-show-policy \
  --project billing-worker \
  --no-spec
```

Campos mínimos:

```text
id
tenantId
serviceId?

toleranceMinutes

depositDisposition

relationshipImpact?

effectiveFrom
effectiveUntil?

status
```

---

# 8. Não hardcode 24h ou 15 minutos

Regras como:

```text
cancel before 24h
no-show after 15 min
```

devem vir da policy.

O código só interpreta a configuração.

---

# 9. Modelar disposição do sinal

Use um enum compartilhado consistente, por exemplo:

```text
NONE
RETURN
RETAIN
CONVERT_TO_CREDIT
TRANSFER
```

Mas `TRANSFER` só deve ficar `READY` se o fluxo já estiver implementado.

Caso contrário:

```text
TRANSFER
→ BLOCKED_CAPABILITY_UNAVAILABLE
```

---

# 10. Modelar efeitos sobre pagamento

Separar sinal de outros pagamentos.

Por exemplo:

```text
paymentDisposition:
NONE
REFUND
CONVERT_TO_CREDIT
RETAIN
```

Não assumir que a decisão do depósito vale automaticamente para todos os pagamentos.

---

# 11. Snapshot da decisão

O Billing deve produzir uma decisão imutável, algo como:

```text
AppointmentFinancialDisposition {
  policyId
  policyVersion

  evaluatedAt

  depositDisposition
  depositAmountCents

  paymentDisposition
  refundablePaymentAmountCents

  creditAmountCents

  receivableDisposition

  relationshipImpact

  financialStateVersion
}
```

A forma concreta deve seguir os contratos do projeto.

---

# 12. Migration `0022`

Se `0021` é a última migration real:

```text
0022_cancellation_no_show_policy_materialization.sql
```

Prováveis tabelas:

```text
cancellation_policies
no_show_policies
```

E, se necessário:

```text
appointment_financial_decisions
```

Mas eu prefiro persistir a decisão final junto ao evento/histórico do Appointment, sem criar tabela extra se não houver necessidade.

---

# 13. Policies precisam ser versionáveis

Não sobrescrever comportamento histórico.

Uma policy usada hoje precisa continuar identificável depois de ser alterada.

Pode usar:

```text
policy_id
version
effective_from
effective_until
```

ou versão equivalente.

---

# 14. Criar repositories

```bash
nest g interface \
  appointment-change-policies/ports/cancellation-policy-repository \
  --project billing-worker

nest g interface \
  appointment-change-policies/ports/no-show-policy-repository \
  --project billing-worker
```

Tenant-aware.

---

# 15. Criar adapters D1

```bash
nest g provider \
  appointment-change-policies/adapters/d1-cancellation-policy-repository \
  --project billing-worker

nest g provider \
  appointment-change-policies/adapters/d1-no-show-policy-repository \
  --project billing-worker
```

---

# 16. Criar `EvaluateCancellationFinancials`

```bash
nest g service \
  appointment-change-policies/application/evaluate-cancellation-financials \
  --project billing-worker
```

Input:

```text
tenantId
appointmentId
customerId
serviceId

origin
scheduledAt
canceledAt

depositId?
receivableId?
customerPackageId?

correlationId
```

---

# 17. Avaliação deve considerar estado financeiro real

Billing precisa consultar suas próprias fontes:

```text
Deposit
Receivable
Payments
Refunds
Internal Credit
Package reference
```

Não confiar em valores monetários enviados pelo Operations.

---

# 18. Resultado fail-closed

Se qualquer capability essencial estiver inconsistente:

```text
BLOCKED
```

com reason code.

Exemplos:

```text
CANCELLATION_POLICY_NOT_FOUND
CANCELLATION_POLICY_INACTIVE
FINANCIAL_STATE_INCONSISTENT
TRANSFER_NOT_SUPPORTED
```

---

# 19. Criar RPC Billing

Algo como:

```text
evaluateAppointmentCancellationFinancials()
```

no WorkerEntrypoint.

Operations deve usar Service Binding real.

---

# 20. Criar também `EvaluateNoShowFinancials`

```bash
nest g service \
  appointment-change-policies/application/evaluate-no-show-financials \
  --project billing-worker
```

---

# 21. No-show policy decide tolerância?

A tolerância é operacional, mas pode estar na mesma policy comercial se isso estiver coerente com a documentação.

Uma alternativa mais limpa:

```text
Operations:
  timing policy

Billing:
  financial policy
```

Se a tolerance já pertence ao tenant/service operacional, não duplique no Billing.

O importante é existir uma fonte autoritativa persistida.

---

# 22. Ativar `CancelAppointment`

O caso de uso já pode ter stub/fail-closed. Evoluir, não duplicar.

Pipeline:

```text
Authentication
↓
Tenant
↓
Permission
↓
load Appointment
↓
validate cancellable state
↓
Billing.evaluateCancellationFinancials()
↓
decision READY?
↓
Operations UnitOfWork
    Appointment → CANCELED
    cancellation metadata
    Audit
    Outbox AppointmentCanceled
    Idempotency
↓
response
```

---

# 23. Não executar Refund antes do commit Operations

A avaliação é síncrona.

Os efeitos são aplicados depois por evento:

```text
AppointmentCanceled
→ Billing
```

Isso preserva a arquitetura eventual já consolidada.

---

# 24. Persistir snapshot da decisão

No cancelamento:

```text
policyId
policyVersion
financialDecision
financialStateVersion
```

precisam ficar congelados.

O consumer Billing não recalcula a policy no replay.

---

# 25. Criar endpoint

```http
POST /tenants/:tenantId/appointments/:appointmentId/cancel
```

Body:

```json
{
  "origin": "CUSTOMER",
  "reason": "...",
  "note": "..."
}
```

Não aceitar:

```text
canceledAt
canceledBy
refundAmount
creditAmount
```

do caller.

---

# 26. Permission

Adicionar/reutilizar:

```text
appointment.cancel
```

---

# 27. Idempotency-Key obrigatório

Primeiro cancel:

```text
CONFIRMED → CANCELED
```

Replay:

```text
same result
```

Sem:

```text
second refund
second credit
second audit
second outbox
```

---

# 28. Estados bloqueados

No mínimo:

```text
COMPLETED
IN_PROGRESS
CANCELED
NO_SHOW
```

devem seguir a FSM canônica.

Não permitir cancelamento de Session já em execução.

---

# 29. Liberação física do slot

Depois do commit:

```text
CANCELED
```

não deve mais ocupar agenda.

Criar prova:

```text
Appointment A 10:00
cancel A
Create Appointment B 10:00
→ success
```

---

# 30. Evento `AppointmentCanceled`

Outbox Operations:

```text
AppointmentCanceled
```

Payload mínimo:

```text
eventId
tenantId
appointmentId
customerId
serviceId

origin
reasonCode

depositId?
receivableId?
customerPackageId?

financialDecisionSnapshot

canceledAt
correlationId
```

---

# 31. Billing consumer

Criar:

```bash
nest g service \
  appointment-change-policies/application/apply-appointment-canceled-financial-effects \
  --project billing-worker
```

Ele executa **o snapshot**, não a policy atual.

---

# 32. Disposition RETURN

Reutilizar `IssueRefund`.

Não duplicar código de refund.

---

# 33. Disposition CONVERT_TO_CREDIT

Reutilizar:

```text
GrantInternalCredit
```

Origem:

```text
REFUND / CANCELLATION
```

conforme contratos existentes.

Se `GrantInternalCredit` só permite `REFUND`, evoluir cuidadosamente a origem canônica em vez de bypassar.

---

# 34. Disposition RETAIN

Registrar estado financeiro explícito.

Se Deposit ainda não possui:

```text
RETAINED
```

agora há caso real para adicioná-lo.

---

# 35. Deposit lifecycle

Evoluir somente quando necessário:

```text
CONFIRMED
├── RETURNED
├── RETAINED
└── CONVERTED_TO_CREDIT
```

Não sobrescrever `Deposit` destrutivamente.

---

# 36. Deposit transition CAS

Cada decisão:

```text
CONFIRMED → RETURNED
```

ou equivalente deve ser CAS.

Replay retorna sucesso lógico.

Decisão diferente depois:

```text
CONFLICT
```

---

# 37. Pagamentos adicionais

Se decision snapshot manda:

```text
REFUND
```

usar Payment/Refund existente.

Nunca:

```text
DELETE Payment
```

---

# 38. Receivable

Agora existe caso real de cancelar obrigação.

Adicionar, se ainda não existe:

```text
Receivable:
OPEN/PARTIALLY_PAID → CANCELED
```

Mas somente se a policy determinar que não há mais dívida.

---

# 39. Não apagar Ledger ao cancelar Receivable

Histórico fica:

```text
RECEIVABLE_CREATED
PAYMENT_RECEIVED
REFUND_ISSUED
...
```

Receivable atual pode virar `CANCELED`.

---

# 40. Package

Em cancelamento pré-sessão:

```text
PackageConsumptionRequested = 0
PackageMovement CONSUMPTION = 0
```

Apenas preserve associação histórica.

---

# 41. Se Package já foi consumido

Isso é inconsistência:

```text
PACKAGE_ALREADY_CONSUMED_FOR_CANCELED_APPOINTMENT
```

Não devolver unidade automaticamente.

Reconciliation required.

---

# 42. Ativar `MarkAppointmentNoShow`

Evoluir o stub existente.

Pipeline:

```text
Authentication
↓
Tenant
↓
Permission
↓
load Appointment
↓
validate eligible state
↓
validate current time >= allowed no-show time
↓
Billing.evaluateNoShowFinancials()
↓
READY
↓
Operations UnitOfWork
  Appointment → NO_SHOW
  metadata
  Audit
  Outbox
  Idempotency
```

---

# 43. Endpoint

```http
POST /tenants/:tenantId/appointments/:appointmentId/no-show
```

Body idealmente mínimo:

```json
{
  "reason": "..."
}
```

Não receber horário da falta.

---

# 44. Permission

```text
appointment.no-show
```

---

# 45. Tolerância server-side

A decisão de “já pode marcar falta?” deve usar:

```text
scheduledAt
duration/end
configured tolerance
server now
```

Não frontend time.

---

# 46. Antes da tolerância

Resultado:

```text
NO_SHOW_TOO_EARLY
```

Sem mutation.

---

# 47. Estados incompatíveis

No mínimo:

```text
CHECKED_IN
IN_PROGRESS
COMPLETED
CANCELED
NO_SHOW
```

não podem virar NO_SHOW.

---

# 48. No Session

Assert explicitamente:

```text
NO_SHOW
→ no Session created
```

---

# 49. No package consumption

Mesmo com:

```text
customerPackageId
```

:

```text
PackageMovement = 0
```

---

# 50. No-show financial event

Criar:

```text
AppointmentNoShowRecorded
```

com snapshot financeiro determinado antes da transição.

---

# 51. Billing consumer de No-show

Criar:

```bash
nest g service \
  appointment-change-policies/application/apply-appointment-no-show-financial-effects \
  --project billing-worker
```

Mesmo padrão:

```text
RETAIN
RETURN
CONVERT_TO_CREDIT
```

conforme policy.

---

# 52. Não hardcode retenção

Reforço importante:

```text
No-show != automatically retain deposit
```

A policy decide.

---

# 53. Relationship profile

Operations deve produzir efeito funcional:

```text
APPOINTMENT_NO_SHOW
```

na timeline e recalcular perfil.

---

# 54. Não hardcode threshold de faltas

Usar policy/configuração já preparada no PR-22.

Se threshold indisponível:

```text
profile remains unchanged
```

ou fail-closed apenas para reclassificação, sem impedir registro de no-show, conforme desenho atual.

---

# 55. `RECURRENT_NO_SHOW`

Só aplicar quando critério configurado for atingido.

---

# 56. Cancelamento fora da policy

A `CancellationDecision` pode carregar:

```text
relationshipImpact = OUT_OF_POLICY_CANCELLATION
```

Isso alimenta profile facts.

Cancelamento dentro da policy:

```text
NONE
```

---

# 57. Criar consumers Operations da timeline

Se ainda pendentes, implementar:

```text
AppointmentCanceled
→ APPOINTMENT_CANCELED

AppointmentNoShowRecorded
→ APPOINTMENT_NO_SHOW
```

Mesmo que Operations seja produtor original, mantenha o padrão de projection atual sem duplicações.

---

# 58. Melhor opção para eventos próprios do Operations

Como a timeline está no mesmo Worker/D1, ela pode ser escrita na mesma UnitOfWork da mutação.

Não precisa fazer Operations → Operations via outbox.

Outbox fica para efeitos cross-worker.

---

# 59. Assim:

Cancel local:

```text
Appointment
Cancellation history
Timeline
Audit
Outbox → Billing
Idempotency
```

todos locais.

---

# 60. No-show local:

```text
Appointment
Timeline
Relationship facts/profile
Audit
Outbox → Billing
Idempotency
```

quando possível.

---

# 61. Isso reduz requests e mantém Free-first

Não crie Service Binding para o próprio Worker.

---

# 62. Concurrency suite

Criar/expandir:

```text
test/workers/appointment-change-concurrency.spec.ts
```

Agora com cenários reais.

---

# 63. Race 1 — cancel vs check-in

Mesmo Appointment.

Executar simultaneamente:

```text
CancelAppointment
CheckInAppointment
```

Resultado:

```text
exactly one winner
```

Estados permitidos finais:

```text
CANCELED
ou
CHECKED_IN
```

Nunca ambos os efeitos.

---

# 64. Assertions dessa race

Se cancel vence:

```text
checked_in_at = null
Cancellation history = 1
```

Se check-in vence:

```text
Appointment != CANCELED
Cancellation history = 0
```

---

# 65. Race 2 — cancel vs reschedule

Duas mutations concorrentes.

Resultado:

```text
one logical mutation
```

Não:

```text
Appointment CANCELED
+
reschedule history applied after cancellation
```

---

# 66. Race 3 — no-show vs check-in

Especialmente no limite temporal.

Um vencedor.

---

# 67. Race 4 — no-show vs cancel

Também deve ser determinístico.

---

# 68. Race 5 — reschedule vs competing CreateAppointment

Já existe fundação; qualificar fisicamente com reservation D1 real.

---

# 69. Financial race — cancel vs ConfirmDeposit

Esse é um dos testes mais importantes do PR.

Cenário:

```text
Deposit PENDING
```

Paralelo:

```text
CancelAppointment
ConfirmDeposit
```

---

# 70. Necessidade de versão financeira

A evaluation Billing deve produzir algo como:

```text
depositStateVersion
financialFingerprint
```

Ao aplicar `AppointmentCanceled`, Billing compara com estado atual.

---

# 71. Se mudou

Resultado:

```text
FINANCIAL_DECISION_STALE
```

e:

```text
RECONCILIATION_REQUIRED
```

Sem aplicar refund/retain incorreto.

---

# 72. Não rollback cancelamento

Appointment continua:

```text
CANCELED
```

A reconciliação é efeito financeiro posterior.

---

# 73. Esse estado precisa ser rastreável

Pode ser Outbox:

```text
DEAD
```

com reason code permanente/reconciliation-required, ou entidade específica.

Não precisa criar motor de reconciliation complexo agora.

Mas precisa ser observável.

---

# 74. Criar teste stale decision

Fluxo controlado:

```text
evaluate cancellation
→ Deposit PENDING

before apply
→ confirm Deposit

apply financial effect
```

Expected:

```text
no refund
no credit
no retain
stale decision detected
```

---

# 75. Replay cancel

Entregar:

```text
AppointmentCanceled
```

20 vezes.

Financial effect count:

```text
1
```

---

# 76. ACK-loss Operations → Billing

Billing aplica refund/credit.

Operations Outbox não marca SENT.

Retry:

```text
Billing REPLAY
```

Sem duplicação.

---

# 77. ACK-loss Billing → Operations

Para:

```text
RefundIssued
InternalCreditGranted
```

timeline continua uma entrada.

O PR-25 já provou parte disso; reusar como regression no fluxo de cancelamento.

---

# 78. UnitOfWork Operations — cancel failure

Injetar falha em:

```text
Cancellation history
Timeline
Audit
Outbox
Idempotency
```

Resultado:

```text
Appointment must not become CANCELED
```

---

# 79. UnitOfWork Operations — no-show failure

Mesmo.

---

# 80. Billing UoW — cancellation effect

Injetar falha em:

```text
Deposit transition
Refund
Credit
Ledger
Audit
Outbox
event idempotency
```

Nada parcial.

---

# 81. Teste RETURN

Fixture:

```text
Deposit CONFIRMED
CancellationPolicy → RETURN
```

Expected:

```text
Deposit RETURNED
Refund 1
Ledger REFUND_ISSUED 1
```

---

# 82. Teste RETAIN

Expected:

```text
Deposit RETAINED
Refund 0
Credit 0
```

---

# 83. Teste CONVERT_TO_CREDIT

Expected:

```text
Deposit CONVERTED_TO_CREDIT
Credit balance += deposit
Ledger CREDIT_GRANTED
```

---

# 84. Teste sem depósito

Policy pode decidir:

```text
NONE
```

Cancellation ainda pode ser válida.

---

# 85. Payment refund test

Appointment possui Receivable + Payment.

Policy manda refund.

Expected:

```text
IssueRefund
```

usando primitive PR-25.

---

# 86. Over-refund continua protegido

Mesmo cancel replay/calls concorrentes não ultrapassam valor original.

---

# 87. Slot release E2E

Não basta consultar availability.

Fazer:

```text
cancel Appointment A
```

depois realmente:

```text
CreateAppointment B
```

no mesmo profissional/horário.

Deve passar.

---

# 88. No-show não precisa liberar slot retroativamente?

Depois que horário passou, a occupation deixa de ser relevante para nova reserva no mesmo intervalo passado.

Ainda assim status `NO_SHOW` deve não ser considerado ocupado em consultas futuras/históricas de availability.

---

# 89. Reschedule regression

O PR-26.1 não deve quebrar o que já passa:

```text
reason
eligibility
history
replay
audit
outbox
```

---

# 90. Package regression

Cancellation:

```text
PackageMovement = 0
```

No-show:

```text
PackageMovement = 0
```

Reschedule:

```text
PackageMovement = 0
```

---

# 91. Session regression

Cancel/no-show não podem produzir:

```text
SessionStarted
SessionCompleted
```

---

# 92. Migration testing

D1 vazio:

```text
0001 → 0022
```

ou número real.

Rerun:

```text
No migrations to apply
```

---

# 93. Query safety

Validar:

```text
effective cancellation policy
effective no-show policy
cancellation history by appointment
no-show facts by customer/time window
```

com índices adequados.

---

# 94. No-show profile query

Se usar timeline:

```text
tenant
customer
event_type = APPOINTMENT_NO_SHOW
occurred_at >= windowStart
```

precisa índice coerente.

---

# 95. Free-tier

Continuar somente com:

```text
D1
Service Bindings
Outbox
```

Sem:

```text
Queue
KV
R2
Cron
```

---

# 96. Não automatizar No-show ainda

`MarkAppointmentNoShow` continua command.

Automação vem em PR posterior.

---

# 97. Criar gate de policies

```bash
npm run test:appointment-change-policies
```

---

# 98. Criar gate financeiro

```bash
npm run test:cancellation-financial-effects
```

Agora o script existente deve deixar de ser placeholder e realmente cobrir:

```text
RETURN
RETAIN
CREDIT
stale decision
replay
```

---

# 99. Criar/expandir concurrency gate

```bash
npm run test:appointment-change-concurrency
```

---

# 100. Gate agregado

```bash
npm run gate:appointment-change-safety
```

deve incluir:

```text
reschedule
cancellation
no-show
policies
financial effects
concurrency
tenant isolation
replay
ACK-loss
```

---

# 101. Gate final PR

Criar:

```bash
npm run gate:pr26.1
```

Idealmente:

```text
gate:pr26
+
gate:appointment-change-safety
+
dry-runs
```

---

# 102. Readiness formal

Criar:

```text
docs/plans/appointment-change-readiness.md
```

Matriz:

```text
Reschedule                    PASS
CancellationPolicy            PASS
NoShowPolicy                  PASS

CancellationHTTP              PASS
NoShowHTTP                    PASS

DepositReturn                 PASS
DepositRetain                 PASS
DepositToCredit               PASS

PaymentRefund                 PASS

PackageNoConsumption          PASS

SlotRelease                   PASS

NoShowTimeGate                PASS
NoShowNoSession               PASS

RelationshipImpact            PASS

Concurrency                   PASS
StaleFinancialDecision        PASS

Replay                        PASS
ACKLoss                       PASS

AppointmentChangeReady        PASS
```

---

# 103. Definition of Done — Policy

```text
[ ] persisted
[ ] tenant-aware
[ ] effective period
[ ] version identifiable
[ ] no hardcoded commercial threshold
[ ] cancellation policy real
[ ] no-show policy real
[ ] decision snapshot immutable
```

---

# 104. Definition of Done — Cancellation

```text
[ ] endpoint active
[ ] no longer CANCELLATION_POLICY_UNAVAILABLE
[ ] reason
[ ] origin
[ ] actor trusted
[ ] state validation
[ ] Billing evaluation RPC
[ ] decision snapshot
[ ] Appointment CAS
[ ] slot release
[ ] timeline
[ ] audit
[ ] outbox
[ ] idempotency
```

---

# 105. Definition of Done — No-show

```text
[ ] endpoint active
[ ] no longer NO_SHOW_POLICY_UNAVAILABLE
[ ] server-side time validation
[ ] configurable tolerance
[ ] compatible state validation
[ ] no Session
[ ] no package consumption
[ ] financial decision
[ ] timeline
[ ] profile effect
[ ] audit
[ ] outbox
[ ] idempotency
```

---

# 106. Definition of Done — Billing consequences

```text
[ ] AppointmentCanceled consumer

[ ] AppointmentNoShowRecorded consumer

[ ] RETURN → Refund

[ ] RETAIN → deposit retained

[ ] CONVERT_TO_CREDIT → internal credit

[ ] no duplicate financial effects

[ ] no destructive payment changes

[ ] Ledger append-only
```

---

# 107. Definition of Done — Financial stale protection

```text
[ ] decision has financial identity/version

[ ] apply validates current financial state

[ ] stale decision blocks financial effect

[ ] Appointment is not rolled back

[ ] reconciliation requirement observable
```

---

# 108. Definition of Done — Concurrency

```text
[ ] cancel vs check-in

[ ] cancel vs reschedule

[ ] no-show vs check-in

[ ] no-show vs cancel

[ ] reschedule vs competing reservation

[ ] cancel vs deposit confirmation

[ ] exactly one logical winner where applicable
```

---

# 109. Definition of Done — Package

```text
[ ] reschedule = 0 consumption

[ ] cancellation = 0 consumption

[ ] no-show = 0 automatic consumption

[ ] consumed package inconsistency detected

[ ] no automatic package restore invented
```

---

# 110. Definition of Done — Relationship profile

```text
[ ] no-show contributes to facts

[ ] out-of-policy cancellation can contribute

[ ] threshold configurable

[ ] recurrent no-show not hardcoded

[ ] profile history preserved

[ ] profile change audited
```

---

# 111. Definition of Done — Reliability

```text
[ ] Operations mutations locally atomic

[ ] Billing consequences locally atomic

[ ] replay safe

[ ] ACK-loss safe

[ ] Outbox lease semantics preserved

[ ] failure injections produce no partial business state
```

---

# 112. Definition of Done — Free Tier

```text
[ ] D1 bounded queries
[ ] Service Bindings
[ ] Outbox

[ ] no KV
[ ] no R2
[ ] no Queue
[ ] no Cron
[ ] no polling
```

---

# 113. Regression obrigatória

```text
PR23.3 PASS
PR24 PASS
PR25 PASS
PR26 PASS

PackageReadyForPayment PASS

Reschedule PASS
Payment PASS
Refund PASS
Internal Credit PASS
```

---

# 114. Comandos finais

Executar:

```bash
npm run lint
npx tsc --build --force

npm run test
npm run test:workers

npm run test:appointment-change-policies
npm run test:appointment-change-concurrency
npm run test:cancellation-financial-effects

npm run gate:pr25
npm run gate:pr26
npm run gate:appointment-change-safety
npm run gate:pr26.1

npm run workers:dry-run
git diff --check
```

Tudo deve retornar:

```text
PASS
```

---

# 115. Relatório pós-implementação esperado

O Codex deve terminar aproximadamente assim:

```text
PR-26.1 — Cancellation + No-show Policy Materialization and Financial Activation

Baseline
PR26:

Policies
cancellation:
no-show:
versioning:
effective dates:
tenant isolation:

Cancellation
endpoint:
permission:
state:
reason:
origin:
Billing evaluation:
decision snapshot:
slot release:

Deposit Effects
RETURN:
RETAIN:
CONVERT_TO_CREDIT:
TRANSFER:

Payment Effects
refund:
over-refund:
receivable:

No-show
endpoint:
time gate:
tolerance:
state:
Session:
package:
financial policy:

Relationship
no-show count:
out-of-policy cancellation:
profile:
history:

Concurrency
cancel-vs-checkin:
cancel-vs-reschedule:
no-show-vs-checkin:
no-show-vs-cancel:
reschedule-vs-create:
cancel-vs-deposit-confirm:

Stale Financial Decision
version:
detection:
financial mutation:
reconciliation:

Reliability
Operations UoW:
Billing UoW:
replay:
ACK-loss:
lease recovery:

Timeline
RESCHEDULED:
CANCELED:
NO_SHOW:
REFUND:
CREDIT:

Package
reschedule consumption:
cancel consumption:
no-show consumption:

Tenant Isolation
policies:
cancel:
no-show:
financial effects:

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

Quality
unit:
workers:
policies:
concurrency:
financial effects:
lint:
typecheck:
dry-runs:
PR26.1 gate:

Remaining blockers:

Next PR:
```

# Depois do PR-26.1

Se:

```text
AppointmentChangeReady = PASS
```

a próxima lacuna deixa de ser o lifecycle manual de agenda e passa a ser **automação operacional bounded**.

Então o próximo PR deveria ser:

# PR-27 — Scheduled Operational Processing + Pending Actions Foundation

Com foco em:

```text
expire overdue deposits
pending confirmation processing
pending return follow-up
no-show candidates
package expiry observation
outbox cleanup/recovery
```

mas implementando apenas jobs realmente necessários e baratos, preservando o desenho Cloudflare Free-first.

Portanto, o próximo passo é **PR-26.1**, não PR-27 ainda. O PR-26 criou corretamente o reagendamento e manteve cancelamento/no-show fechados enquanto não havia policy autoritativa. Agora a prioridade é materializar essa policy no Billing, congelar a decisão financeira no momento da mudança operacional e provar que `Refund`, `Internal Credit`, `Deposit`, `Package`, `Timeline` e `Appointment FSM` continuam consistentes sob replay, concorrência e mudanças financeiras simultâneas.
