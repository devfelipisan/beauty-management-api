Com o **PR-25 concluído**, o próximo PR deve tratar exatamente os fluxos operacionais que agora já podem usar as primitives financeiras de forma segura:

# PR-26 — Appointment Rescheduling + Cancellation + No-show Financial Effects

Esse é o próximo passo correto porque as regras normativas já determinam que reagendamento preserve histórico e valide novamente o horário, que cancelamento avalie sinal, pagamentos, créditos, pacote e política da empresa antes de concluir, e que falta nunca gere sessão concluída nem consuma pacote automaticamente.  

O fluxo alvo fica:

```text
Appointment
   │
   ├── RESCHEDULE
   │     ├── validar novo horário
   │     ├── preservar histórico
   │     ├── não consumir pacote
   │     └── sinal pode ser transferido
   │
   ├── CANCEL
   │     ├── policy financeira
   │     ├── deposit → refund / retain / credit / transfer
   │     ├── pagamentos → efeitos financeiros
   │     ├── package → sem consumo
   │     └── liberar horário
   │
   └── NO_SHOW
         ├── somente após horário + tolerância
         ├── nenhuma Session concluída
         ├── sem consumo automático de pacote
         ├── sinal conforme policy
         └── atualizar relacionamento do cliente
```

## 1. Baseline obrigatória

Antes de alterar código:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr23.3
npm run gate:pr24
npm run gate:pr25
```

Depois:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers
npm run test:payment-concurrency
npm run workers:dry-run
git diff --check
```

Tudo deve permanecer `PASS`.

O PR-26 não deve corrigir regressões de Refund/Credit criando atalhos no Operations.

---

# 2. Criar plano normativo

Criar:

```text
docs/plans/PR-26-appointment-rescheduling-cancellation-no-show.md
```

Estrutura:

```text
Objective
Scope

Appointment lifecycle
Rescheduling
Cancellation
No-show

Cancellation Policy
Deposit Effects
Payment Effects
Internal Credit
Package Effects

Schedule release
Historical preservation
Customer profile effects

Cross-worker orchestration
Idempotency
Atomicity
Eventual consistency
Concurrency

Tenant isolation
Permissions
Audit
Timeline

Free-tier impact

Definition of Done
Out of Scope
```

---

# 3. Não inventar política fixa de cancelamento

Esse é um ponto central.

A documentação diz que o `Service` poderá possuir:

```text
cancellation policy
rescheduling policy
```

e que antes de cancelar é necessário considerar:

```text
sinal
pagamentos
créditos
pacote
política de cancelamento
```

 

Portanto não hardcode:

```text
cancelou com menos de 24h → perde sinal
```

ou:

```text
falta → retém 100%
```

sem configuração.

---

# 4. Criar contratos explícitos de policy

No Operations:

```text
CancellationPolicyPort
ReschedulingPolicyPort
NoShowPolicyPort
```

Ou uma abstração unificada:

```text
AppointmentChangePolicyPort
```

desde que não vire um objeto gigante.

Resultados devem ser explícitos.

Exemplo:

```text
CancellationDecision
├── READY
└── BLOCKED
```

e, quando READY:

```text
depositDisposition
financialDisposition
packageDisposition
```

---

# 5. Disposições do sinal

A documentação já define, em cancelamento:

```text
RETURN
RETAIN
CONVERT_TO_CREDIT
TRANSFER
```

porque o sinal pode ser devolvido, retido, convertido em crédito ou transferido para outro agendamento.

Use os nomes canônicos adotados no domínio.

---

# 6. Não deletar nem alterar sinal confirmado

`RN-SIN-008` exige imutabilidade financeira. Correções devem ocorrer por estorno, devolução, movimento complementar ou ajuste auditado.

Logo é proibido:

```sql
DELETE FROM deposits
```

ou:

```text
CONFIRMED → magically removed
```

---

# 7. Ownership

Sugestão:

```text
Operations
├── Appointment lifecycle
├── Reschedule
├── Cancel
└── NoShow

Billing
├── Deposit
├── Payment
├── Refund
├── InternalCredit
└── financial consequences
```

Operations decide a mutação operacional.

Billing executa consequências financeiras autorizadas.

---

# 8. Não acessar tabelas Billing diretamente

Operations não deve:

```sql
UPDATE deposits
UPDATE payments
INSERT refunds
```

mesmo com D1 compartilhado.

Use contratos + Service Binding.

---

# 9. Primeiro fluxo: RescheduleAppointment

A proposta técnica já lista `RescheduleAppointment` como caso de uso típico. 

Criar:

```bash
nest g service \
  appointments/application/reschedule-appointment \
  --project operations-worker
```

---

# 10. Regra de motivo obrigatório

`RN-REA-001`:

```text
reason required
```

Body conceitual:

```json
{
  "startsAt": "...",
  "professionalId": "...",
  "reason": "..."
}
```

Não receber:

```text
changedBy
changedAt
```

---

# 11. Novo horário passa pelo mesmo admission core

`RN-REA-002` determina que o novo horário deve passar pelas mesmas validações de um novo Appointment.

Reutilizar:

```text
AppointmentEligibility
availability
professional-service
customer restrictions
license
assessment
plan
```

Não criar uma versão simplificada chamada:

```text
RescheduleEligibilityLite
```

---

# 12. Atenção ao próprio Appointment no conflito

A consulta de conflito deve ignorar:

```text
appointmentId being rescheduled
```

senão o horário atual conflita consigo mesmo.

Criar suporte explícito:

```text
excludeAppointmentId
```

na policy/repository adequada.

---

# 13. Preservar histórico anterior

`RN-REA-003` exige:

```text
previous date
previous time
previous professional
user
reason
changedAt
```

Não apenas sobrescrever:

```text
starts_at
professional_id
```

sem histórico.

---

# 14. Criar `AppointmentRescheduleHistory`

Pode ser tabela append-only:

```text
appointment_reschedule_history
```

Campos:

```text
id
tenant_id
appointment_id

previous_starts_at
previous_ends_at
previous_professional_id

new_starts_at
new_ends_at
new_professional_id

reason

changed_at
changed_by

source_request_id?
```

---

# 15. Não confiar em duração enviada

Como no CreateAppointment:

```text
endsAt
```

deve ser derivado de Service/duração congelada apropriada.

---

# 16. Estado após reagendamento

A documentação possui estado `Reagendado`, mas o fluxo posterior precisa continuar operacional. 

Não criar um estado terminal acidental.

A FSM deve representar exatamente a semântica atual.

Uma possibilidade:

```text
CONFIRMED
  ↓ reschedule
RESCHEDULED
```

mas então precisa haver caminho oficial de volta ao ciclo de confirmação do novo horário.

Se isso ainda não estiver normativamente congelado, documente a decisão antes de código.

---

# 17. Melhor abordagem de histórico vs estado

Se o código atual já usa `RESCHEDULED` como status oficial, preservar.

Não criar um Appointment novo automaticamente só para evitar FSM.

---

# 18. Sinal no reagendamento

`RN-REA-004`:

> o sinal poderá ser transferido quando permitido pela política da empresa e a transferência não deverá criar novo pagamento.

Logo:

```text
Deposit CONFIRMED
Appointment A
      ↓ reschedule
Appointment A/new schedule context
```

não deve gerar:

```text
Payment 2
```

---

# 19. Se mesmo Appointment é reagendado

A transferência pode ser apenas preservação do vínculo do Deposit.

Não precisa de refund/regrant.

---

# 20. Se arquitetura optar por novo Appointment

Então precisa de:

```text
DepositTransfer
```

explícito e auditável.

Eu evitaria essa complexidade neste PR se a FSM permite reagendar o mesmo agregado.

---

# 21. Pacote no reagendamento

`RN-REA-005` é inequívoca:

```text
reschedule
→ package consumption = 0
```

Mesmo se:

```text
customerPackageId != null
```

nenhum `PackageConsumptionRequested` é produzido.

---

# 22. Criar endpoint de reagendamento

```http
POST /tenants/:tenantId/appointments/:appointmentId/reschedule
```

Headers:

```text
Authorization
Idempotency-Key
```

---

# 23. Permission

Algo como:

```text
appointment.reschedule
```

se ainda não existir.

---

# 24. Idempotência do reschedule

Replay da mesma key:

```text
one history row
one schedule mutation
one Audit
one Outbox
```

Same key + horário diferente:

```text
IDEMPOTENCY_KEY_CONFLICT
```

---

# 25. Concorrência do reschedule

Duas recepcionistas tentam mover o mesmo Appointment para horários diferentes.

Não pode haver:

```text
history A
history B
final state unpredictable
```

sem controle.

Use CAS/revision/status conforme arquitetura atual.

---

# 26. Concorrência com outra reserva

Novo horário disputado por:

```text
RescheduleAppointment
vs
CreateAppointment
```

A mesma proteção física de Scheduling deve decidir um vencedor.

Esse é teste obrigatório.

---

# 27. Agora CancelAppointment

Criar:

```bash
nest g service \
  appointments/application/cancel-appointment \
  --project operations-worker
```

---

# 28. Cancelamento exige motivo, responsável e origem

`RN-CAN-001/002` exige:

```text
responsible actor
reason
optional note
origin:
  CUSTOMER
  COMPANY
  PROFESSIONAL
  SYSTEM_EXPIRATION
```



`responsible actor` vem do contexto quando humano.

---

# 29. Completed não pode cancelar

`RN-CAN-005`:

```text
COMPLETED
→ cancellation BLOCKED
```



Correção posterior deve usar fluxo financeiro/administrativo.

---

# 30. IN_PROGRESS deve ser tratado com cuidado

Se Session já iniciou:

```text
Appointment IN_PROGRESS
```

cancelar o Appointment pode conflitar com Clinical.

Não invente cancelamento de Session neste PR.

Minha recomendação:

```text
IN_PROGRESS
→ CANCEL BLOCKED
```

até workflow clínico específico.

---

# 31. Cancelamento financeiro precisa ser decidido antes do commit final

RN-CAN-003 exige verificar:

```text
deposit
payments
credits
package
policy
```

antes da conclusão.

Isso não significa distributed transaction.

Significa que Operations deve obter uma decisão financeira autoritativa antes de mudar estado.

---

# 32. Criar Billing RPC

Algo como:

```text
evaluateAppointmentCancellationFinancials()
```

Request:

```text
tenantId
appointmentId
customerId
serviceId

depositId?
receivableId?
customerPackageId?

cancellationContext
correlationId
```

---

# 33. Resultado

```text
READY
BLOCKED
```

Quando READY:

```text
financialPlan {
  depositDisposition
  refundAmountCents?
  grantCreditAmountCents?
  retainAmountCents?
}
```

Não retornar efeito já executado.

---

# 34. Não inventar policy padrão

Se policy de cancelamento não está configurada:

```text
BLOCKED
CANCELLATION_POLICY_UNAVAILABLE
```

ou decisão fail-closed equivalente.

---

# 35. Isso é importante

Não faça:

```text
policy missing
→ full refund
```

nem:

```text
policy missing
→ retain deposit
```

Ambos seriam invenção comercial.

---

# 36. Policy deve considerar timing

Provavelmente:

```text
appointment startsAt
now
```

e origem.

Mas critérios como 24h/48h precisam ser configuráveis, não hardcoded.

---

# 37. Modelar `CancellationPolicy`

No Billing ou commercial domain.

Ela pode declarar regras como:

```text
minNoticeMinutes
customerCancellationDepositDisposition
companyCancellationDepositDisposition
noShowDepositDisposition
```

somente conforme contrato realmente aprovado.

---

# 38. Se policy persistente ainda não existe

Criar apenas a foundation necessária.

Não construir motor genérico de regras.

---

# 39. Fluxo correto de cancelamento

```text
Operations
load Appointment
↓
validate cancellable state
↓
Billing evaluate financial policy
↓
READY
↓
Operations local UnitOfWork
  Appointment → CANCELED
  cancellation history
  Audit
  Outbox AppointmentCanceled
  Idempotency
↓
Billing applies financial consequences
through event
```

---

# 40. Não executar Refund antes de cancelar Operations

Se Billing refundar e Operations falhar ao cancelar:

```text
money returned
Appointment still active
```

estado ruim.

Melhor:

```text
evaluate synchronously
commit operational fact
propagate eventual financial effects
```

---

# 41. Evento `AppointmentCanceled`

Payload mínimo:

```text
eventId
tenantId
appointmentId
customerId
serviceId

depositId?
receivableId?
customerPackageId?

financialDecisionSnapshot

canceledAt
canceledBy
origin
reasonCode

correlationId
```

---

# 42. Snapshot da decisão financeira

Isso é importante.

Se policy mudar depois do cancelamento:

```text
AppointmentCanceled
```

deve carregar a decisão aplicada.

Não reevaluar policy no retry.

---

# 43. Billing consumer

Criar:

```text
ApplyAppointmentCanceledFinancialEffects
```

Ele não recalcula a policy.

Ele executa o snapshot decidido:

```text
RETURN
RETAIN
CONVERT_TO_CREDIT
TRANSFER
NONE
```

---

# 44. Reutilizar PR-25

Se disposition:

```text
RETURN
```

→ `IssueRefund` ou primitive interna equivalente.

Se:

```text
CONVERT_TO_CREDIT
```

→ `GrantInternalCredit`.

Não duplicar implementação.

---

# 45. Retain Deposit

Se:

```text
RETAIN
```

Deposit deve passar para estado normativo:

```text
RETAINED
```

se o domínio atual suporta/precisa disso.

A especificação prevê sinal `retido`.

---

# 46. Converted to Credit

Também prevê:

```text
converted to credit
```

no lifecycle do sinal.

Não apenas criar crédito e deixar Deposit como `CONFIRMED` sem indicação, se isso quebrar a semântica histórica.

---

# 47. Returned Deposit

Deposit pode precisar:

```text
RETURNED
```

além do Refund record.

Usar CAS/replay.

---

# 48. Transfer Deposit

Para cancelamento + novo Appointment, RN-SIN-007 permite transferência. 

Mas esse é um fluxo mais complexo.

Eu recomendaria neste PR:

```text
TRANSFER
```

ser permitido somente se houver `targetAppointmentId` validado e policy permitir.

Se isso aumentar demais o escopo, deixe `TRANSFER` como capability `BLOCKED_NOT_IMPLEMENTED`, mas documente que RN-SIN-007 fica parcial.

---

# 49. Não criar novo Payment na transferência

Regra explícita no reagendamento.

---

# 50. Pagamentos além do sinal

Cancelamento pode possuir:

```text
Receivable
Payment
Refund
```

já registrados.

Policy precisa decidir se algum valor pago será:

```text
refunded
credited
retained
```

Não inferir automaticamente que todo pagamento é reembolsável.

---

# 51. Não reabrir/deletar Receivable automaticamente

PR-25 explicitamente deixou reversão automática do Receivable fora.

O PR-26 precisa decidir se isso agora entra.

Minha recomendação: **não reabrir dívida** em cancelamento.

Pode introduzir um estado financeiro específico:

```text
CANCELED / VOIDED
```

para obrigação cancelada, se necessário, mas somente com política clara.

---

# 52. É melhor criar `CancelReceivable`

Se um Appointment cancelado possui obrigação que não deve mais ser cobrada:

```text
Receivable OPEN
→ CANCELED
```

como operação financeira explícita.

Não:

```sql
DELETE receivable
```

---

# 53. Mas Payment histórico permanece

Se já houve Payment:

```text
Receivable canceled
Payment remains
Refund/Credit handles money
```

---

# 54. Criar status Receivable `CANCELED` se necessário

PR-24 deixou isso opcional.

Agora há caso de uso concreto.

Migration pode evoluir constraint/status.

---

# 55. Package em cancelamento

A regra é simples para o MVP:

```text
Appointment canceled before SessionCompleted
→ PackageMovement CONSUMPTION = 0
```

Não precisa devolver unidade porque ela não deveria ter sido consumida.

---

# 56. Se encontrou consumo de pacote

Isso é inconsistência.

Não:

```text
increment remaining automatically
```

neste PR.

Registrar:

```text
INVALID_PACKAGE_STATE
```

e bloquear/mandar para reconciliação.

---

# 57. Liberar horário

`RN-CAN-004` exige liberação após cancelamento. 

Na arquitetura atual, provavelmente o status `CANCELED` deve deixar de ocupar Scheduling.

Testar fisicamente:

```text
Appointment occupies 10:00
↓ cancel
↓
new Appointment same professional/time
→ succeeds
```

---

# 58. Não deletar Appointment para liberar horário

A occupation policy deve ignorar estado canceled.

Histórico permanece.

---

# 59. Criar `AppointmentCancellationHistory`

Talvez o Appointment já mantenha audit suficiente, mas RN-CAN exige motivo/origem/responsável como dado funcional.

Persistir explicitamente:

```text
canceledAt
canceledBy
cancellationOrigin
cancellationReason
cancellationNote
```

ou tabela histórica.

---

# 60. Timeline

Operations deve gerar:

```text
APPOINTMENT_CANCELED
```

na timeline do PR-22.

Não depender apenas de Audit.

---

# 61. Refund/Credit timeline já virá separadamente

Então timeline pode mostrar:

```text
APPOINTMENT_CANCELED
REFUND_ISSUED
```

ou:

```text
APPOINTMENT_CANCELED
INTERNAL_CREDIT_GRANTED
```

como fatos distintos.

---

# 62. Agora No-show

Criar:

```bash
nest g service \
  appointments/application/mark-appointment-no-show \
  --project operations-worker
```

---

# 63. Tempo autoritativo

`RN-FAL-001`:

```text
now >= appointment end/start + configured tolerance
```

antes de permitir falta.

Não aceitar:

```text
missedAt
```

do caller.

---

# 64. Tolerância configurável

Não hardcode:

```text
15 minutes
```

sem configuração.

Pode vir de:

```text
Tenant policy
Service policy
```

conforme contrato.

Se capability indisponível:

```text
NO_SHOW_POLICY_UNAVAILABLE
```

fail-closed.

---

# 65. Appointment state

Marcar falta somente em estado compatível:

```text
CONFIRMED
```

ou outro estado canônico pré-check-in.

Nunca:

```text
CHECKED_IN
IN_PROGRESS
COMPLETED
CANCELED
```

---

# 66. No-show não cria Session

`RN-FAL-002`:

```text
NO_SHOW
→ SessionCompleted = 0
```

Teste explicitamente.

---

# 67. Package não é consumido

`RN-FAL-003`:

```text
NoShow
→ automatic PackageConsumption = 0
```

Mesmo se package associado.

---

# 68. Consumo excepcional de pacote

A regra permite excepcionalmente, mas exige:

```text
permission
justification
audit
```

**Não implemente automaticamente.**

Pode ficar fora deste PR como:

```text
ConsumePackageForNoShow
```

futuro comando administrativo.

---

# 69. Sinal em No-show

`RN-FAL-005`:

```text
deposit treatment
→ configured policy
```

Reutilizar `NoShowPolicy`.

---

# 70. Pode resultar em retenção

Mas somente se policy explicitamente decidir:

```text
RETAIN
```

Não assumir que no-show sempre perde sinal.

---

# 71. Criar evento `AppointmentNoShowRecorded`

Operations:

```text
Appointment → NO_SHOW
Audit
Timeline
Outbox
Idempotency
```

---

# 72. Billing consequences

Evento pode carregar:

```text
depositDispositionSnapshot
financialDispositionSnapshot
```

para Billing aplicar.

Mesmo modelo do cancelamento.

---

# 73. Relationship Profile

`RN-FAL-004` determina que falta participe do cálculo do perfil.

O PR-22 já criou `RelationshipProfilePolicy/facts`.

Agora expandir facts:

```text
noShowCountInConfiguredWindow
```

---

# 74. Não transformar primeiro no-show em recurrent no-show automaticamente

A política deve usar threshold configurável.

A documentação sugere que perfil “Com faltas recorrentes” depende de quantidade no período configurado. 

---

# 75. Criar stats

Se ainda não existe:

```text
customer_relationship_stats.no_show_count
```

ou projection temporal adequada.

Mas como o threshold depende de período, um contador lifetime talvez não baste.

---

# 76. Preferir timeline/query bounded inicialmente

Pode calcular:

```text
COUNT NO_SHOW
WHERE occurred_at >= configuredWindowStart
```

indexado.

Não criar projection complexa prematuramente.

---

# 77. Profile reclassification event

Se:

```text
OLD → RECURRENT_NO_SHOW
```

então:

```text
CustomerProfileChanged
Audit
profile history
```

como PR-22.

---

# 78. Cancelamento também pode impactar perfil

`RN-PER-006/007` diz que faltas ou cancelamentos fora da política podem influenciar perfil e que cancelamento é evento relevante para reclassificação. 

Não classificar todo cancelamento como negativo.

A policy precisa saber:

```text
insidePolicy / outsidePolicy
```

ou reason class equivalente.

---

# 79. Cancellation policy outcome deve indicar isso

Algo como:

```text
relationshipImpact:
  NONE
  OUT_OF_POLICY_CANCELLATION
```

Assim Operations pode recalcular profile sem duplicar regra financeira.

---

# 80. Criar migration `0021`

Se `0020` é a última:

```text
0021_appointment_change_financial_effects.sql
```

Possíveis alterações:

```text
appointment_reschedule_history
appointment cancellation metadata
no-show metadata

cancellation_policies?
rescheduling_policies?
no_show_policies?

receivables status CANCELED
deposit lifecycle additions
```

Somente o necessário.

---

# 81. Não criar uma mega tabela de policies sem necessidade

Pode existir:

```text
appointment_change_policies
```

com tipos, mas apenas se isso simplificar de verdade.

---

# 82. Policy snapshot

Quando decisão ocorre:

```text
policyId
policyVersion/hash
decision
```

deve ser congelada no evento/histórico.

Mudança futura de policy não reinterpreta cancelamento antigo.

---

# 83. Concurrency: cancel vs check-in

Cenário:

```text
CancelAppointment
vs
CheckInAppointment
```

simultâneos.

Somente um deve vencer.

Não aceitar:

```text
CANCELED
+
checked_in_at populated
```

---

# 84. Concurrency: cancel vs reschedule

Também:

```text
cancel
vs
reschedule
```

um vencedor.

---

# 85. Concurrency: no-show vs check-in

No horário limite:

```text
MarkNoShow
vs
CheckIn
```

não podem ambos produzir efeito.

---

# 86. Concurrency: cancel vs deposit confirmation

Esse é especialmente importante.

Pode ocorrer:

```text
Cancel decision sees deposit PENDING
↓
ConfirmDeposit happens simultaneously
```

A decisão financeira pode ficar stale.

---

# 87. Não tentar resolver com mutex cross-worker

Precisamos de versão/identity no snapshot financeiro.

Billing `evaluateCancellationFinancials` deve devolver:

```text
financialVersion / depositVersion
```

ou identificadores de estado.

Ao aplicar consequência depois, Billing valida se o snapshot ainda é aplicável.

---

# 88. Se estado financeiro mudou

Não aplicar decisão errada.

Retornar:

```text
FINANCIAL_DECISION_STALE
```

e reconciliação.

---

# 89. Essa é uma prova importante

Exemplo:

```text
evaluate:
 deposit=PENDING → disposition NONE

before cancel event applied:
 deposit becomes CONFIRMED
```

Billing não pode silenciosamente ignorar o depósito confirmado.

---

# 90. Estratégia mais simples

Pode reevaluar antes do commit Operations?

Ainda existe race.

O correto é o evento carregar a versão e Billing comparar na aplicação.

---

# 91. Não rollback Appointment cancelado

Se a consequência financeira ficar stale após cancellation commit:

```text
Appointment remains CANCELED
```

e finance fica:

```text
RECONCILIATION_REQUIRED
```

como padrão eventual já adotado.

---

# 92. Isso precisa ser observável

Adicionar error/result:

```text
CANCELLATION_FINANCIAL_RECONCILIATION_REQUIRED
```

ou equivalente.

---

# 93. Reagendamento vs Deposit

Se o sinal é simplesmente preservado e o Appointment é o mesmo, race é muito menor.

Se policy muda state/transfer, usar mesma versão.

---

# 94. Audit obrigatório

A documentação lista explicitamente:

```text
rescheduling
cancellation
no-show
refund
credit
```

como eventos mínimos de auditoria. 

Garanta todos.

---

# 95. Audit Reschedule

```text
AppointmentRescheduled
```

Metadata:

```text
appointmentId
old time
new time
old professional
new professional
reasonCode
actorId
```

---

# 96. Audit Cancellation

```text
AppointmentCanceled
```

com:

```text
origin
reason
financial decision code
```

Evitar dados financeiros completos desnecessários.

---

# 97. Audit No-show

```text
AppointmentNoShowRecorded
```

com:

```text
appointmentId
policyId
tolerance
actorId
```

---

# 98. Timeline

Adicionar:

```text
APPOINTMENT_RESCHEDULED
APPOINTMENT_CANCELED
APPOINTMENT_NO_SHOW
```

Todos append-only.

---

# 99. Não editar o evento original do Appointment

Histórico deve mostrar sequência:

```text
APPOINTMENT_CREATED
APPOINTMENT_CONFIRMED
APPOINTMENT_RESCHEDULED
APPOINTMENT_CANCELED
```

quando aplicável.

---

# 100. Teste E2E — reschedule

Fluxo:

```text
Create Appointment A 10:00
Confirm
↓
Reschedule to 11:00
```

Assertions:

```text
A start=11:00
history contains 10:00→11:00
old slot free
new slot occupied
PackageMovement=0
new Payment=0
```

---

# 101. Reschedule conflict E2E

Outro Appointment ocupa 11:00.

Reschedule:

```text
409 TIME_CONFLICT
```

A continua 10:00.

Nenhum history parcial.

---

# 102. Concurrent reschedule E2E

Duas requests para horários diferentes.

Expected:

```text
one winner
one conflict
history=1
```

---

# 103. E2E — cancel sem financeiro

Appointment sem deposit/payment/package.

Cancel:

```text
Appointment CANCELED
slot released
timeline appended
Audit appended
```

---

# 104. E2E — cancel + deposit RETURN

Fixture policy:

```text
depositDisposition = RETURN
```

Deposit confirmed.

Flow:

```text
AppointmentCanceled
↓
Billing
↓
RefundIssued
```

Expected:

```text
Deposit RETURNED
Refund = deposit amount
Ledger REFUND_ISSUED
Timeline CANCELED + REFUND
```

---

# 105. Cancel + deposit RETAIN

Expected:

```text
Deposit RETAINED
Refund=0
Credit=0
```

---

# 106. Cancel + deposit CREDIT

Expected:

```text
Deposit CONVERTED_TO_CREDIT
InternalCredit += deposit amount
Ledger CREDIT_GRANTED
```

---

# 107. No double financial effect on replay

Redeliver:

```text
AppointmentCanceled
```

20 vezes.

Refund/Credit:

```text
count = 1
```

---

# 108. Cancel + Payment refund

Se policy manda devolver pagamento total/parcial:

```text
IssueRefund
```

reutilizado.

Provar no mínimo um caso.

---

# 109. E2E — cancel package-funded

Package assigned:

```text
remaining=5
```

Cancel before Session.

Result:

```text
remaining=5
PackageMovement=0
```

---

# 110. Old slot becomes available

Esse é requisito funcional e deve ser provado com uma nova reserva real, não só `availability=true`.

---

# 111. E2E — no-show

Appointment confirmado.

Clock antes do limite:

```text
MarkNoShow
→ BLOCKED_TOO_EARLY
```

Depois de:

```text
scheduled + tolerance
```

:

```text
Appointment NO_SHOW
```

---

# 112. No Session

Assert:

```text
sessions for appointment = 0
```

---

# 113. No package consumption

Mesmo com `customerPackageId`:

```text
PackageMovement=0
remaining unchanged
```

---

# 114. No-show deposit policy

Testar uma disposition configurada:

```text
RETAIN
```

ou outra.

Não hardcode no use case.

---

# 115. No-show profile effect

Emitir:

```text
AppointmentNoShowRecorded
```

e recalcular facts.

Se threshold não atingido:

```text
profile unchanged
```

Se atingido:

```text
→ RECURRENT_NO_SHOW
```

---

# 116. Cancellation profile effect

Cancelamento dentro da policy:

```text
no negative relationship impact
```

fora da policy:

```text
counter/fact relevant
```

conforme policy.

---

# 117. Physical concurrency suite

Criar:

```text
test/workers/appointment-change-concurrency.spec.ts
```

Cenários:

```text
cancel vs check-in
cancel vs reschedule
no-show vs check-in
reschedule vs create on same slot
```

---

# 118. Resultado esperado

Para cada race:

```text
one logical winner
zero contradictory terminal effects
```

---

# 119. Financial race suite

Criar:

```text
test/workers/cancellation-financial-race.spec.ts
```

No mínimo:

```text
cancel vs confirm deposit
cancel redelivery
cancel vs refund duplicate
```

---

# 120. Não duplicar refund

Mesmo se:

```text
AppointmentCanceled
```

é entregue duas vezes e alguém também tenta `IssueRefund` manualmente com mesma source identity, business invariants precisam impedir over-refund.

---

# 121. Cross-worker E2E

Provar:

```text
Operations
→ Billing
→ Operations Timeline
```

para:

```text
AppointmentCanceled
RefundIssued / InternalCreditGranted
```

---

# 122. ACK-loss

Mesmo padrão já comprovado.

Testar ao menos:

```text
AppointmentCanceled → Billing
```

com ACK loss, e:

```text
RefundIssued → Operations
```

com ACK loss.

---

# 123. UnitOfWork Operations

Cancel:

```text
Appointment state
Cancellation metadata/history
Audit
Outbox
Idempotency
```

localmente atômicos.

---

# 124. UnitOfWork Billing

Financial effect:

```text
Deposit state
Refund/Credit
Ledger
Audit
Outbox
Idempotency/event consumption
```

localmente atômicos.

---

# 125. UnitOfWork reschedule

```text
schedule mutation
history
Audit
Outbox/timeline source
Idempotency
```

e reservation conflict safety.

---

# 126. Failure injection

Criar provas para:

```text
reschedule history failure
cancel audit failure
cancel outbox failure
no-show audit failure
```

Não deixar status mudar parcialmente.

---

# 127. Migration

Provavelmente:

```text
0021_appointment_change_financial_effects.sql
```

Mas verificar:

```bash
ls database/d1/migrations
```

antes.

---

# 128. Query indexes

Prováveis:

```text
appointment_reschedule_history(
  tenant_id,
  appointment_id,
  changed_at
)

appointments(
  tenant_id,
  status,
  starts_at
)
```

Policies:

```text
tenant + service + status/effective date
```

se persistentes.

Validar query plan.

---

# 129. Free-tier

Esse PR deve continuar sem:

```text
Queue
KV
R2
Cron
```

No-show é manual neste momento.

A regra de processamento agendado pode vir mais tarde.

---

# 130. Não criar cron de no-show

Mesmo que seja possível automatizar futuramente, Free-first e escopo recomendam comando explícito/manual.

---

# 131. Não criar cron de cancelamento por sinal

`ExpireDeposit` já existe; automação vem depois.

---

# 132. Gate de change lifecycle

Criar:

```bash
npm run test:appointment-change-concurrency
```

---

# 133. Gate financeiro de cancelamento

```bash
npm run test:cancellation-financial-effects
```

---

# 134. Gate agregado

```bash
npm run gate:appointment-change-safety
```

Deve incluir:

```text
reschedule
cancel
no-show
concurrency
financial effects
tenant isolation
replay
ACK-loss
```

---

# 135. Gate PR-26

```bash
npm run gate:pr26
```

Idealmente:

```text
gate:pr25
+
gate:appointment-change-safety
+
dry-runs
```

---

# 136. Definition of Done — Reschedule

```text
[ ] reason mandatory
[ ] same appointment preserved
[ ] previous datetime preserved
[ ] previous professional preserved
[ ] actor preserved
[ ] changedAt server-side
[ ] new slot passes full eligibility
[ ] own appointment excluded from conflict
[ ] package consumption = 0
[ ] deposit transfer/preservation follows policy
[ ] no duplicate payment
[ ] idempotent
[ ] concurrency-safe
```

Isso cobre `RN-REA-001..005`.

---

# 137. Definition of Done — Cancellation

```text
[ ] reason mandatory
[ ] origin mandatory
[ ] actor trusted
[ ] COMPLETED blocked
[ ] IN_PROGRESS handled explicitly
[ ] financial policy evaluated
[ ] deposit checked
[ ] payments checked
[ ] credit checked
[ ] package checked
[ ] policy checked
[ ] time slot released
[ ] historical Appointment preserved
[ ] timeline created
[ ] audit created
```

Isso cobre `RN-CAN-001..005`.

---

# 138. Definition of Done — Deposit cancellation effects

```text
[ ] RETURN supported
[ ] RETAIN supported
[ ] CONVERT_TO_CREDIT supported
[ ] TRANSFER either supported or explicitly blocked/documented

[ ] no confirmed deposit deletion
[ ] decision records reason
[ ] decision records actor
[ ] replay safe
```

Alinhado a `RN-SIN-007/008`.

---

# 139. Definition of Done — No-show

```text
[ ] only after schedule+tolerance
[ ] tolerance configurable
[ ] state transition valid
[ ] no completed Session
[ ] no automatic package consumption
[ ] deposit follows configured policy
[ ] Audit
[ ] Timeline
[ ] profile recalculation
```

Cobre `RN-FAL-001..005`.

---

# 140. Definition of Done — Financial safety

```text
[ ] financial policy snapshot frozen
[ ] refund reuses IssueRefund
[ ] credit reuses GrantInternalCredit
[ ] no Payment deletion
[ ] no Ledger mutation
[ ] no automatic over-refund
[ ] stale financial decision detected
[ ] reconciliation state observable
```

---

# 141. Definition of Done — Package safety

```text
[ ] reschedule consumes zero
[ ] cancel before completion consumes zero
[ ] no-show consumes zero automatically
[ ] existing PackageMovement never deleted
[ ] unexpected prior consumption triggers invalid/reconciliation state
```

---

# 142. Definition of Done — Concurrency

```text
[ ] cancel vs check-in
[ ] cancel vs reschedule
[ ] no-show vs check-in
[ ] reschedule vs competing appointment
[ ] cancel vs deposit confirmation

[ ] one logical winner
[ ] no contradictory states
```

---

# 143. Definition of Done — Eventual consistency

```text
[ ] AppointmentCanceled delivery idempotent
[ ] NoShow delivery idempotent
[ ] Billing effects idempotent
[ ] Refund/Credit propagation idempotent
[ ] ACK-loss recoverable
[ ] lease recovery unchanged
```

---

# 144. Definition of Done — Relationship profile

```text
[ ] no-show feeds relationship facts
[ ] out-of-policy cancellation may feed relationship facts
[ ] configured threshold used
[ ] no hardcoded recurrent-no-show count
[ ] profile history preserved
[ ] profile change audited
```

---

# 145. Definition of Done — Security

```text
[ ] appointment.reschedule
[ ] appointment.cancel
[ ] appointment.no-show

[ ] tenant isolation
[ ] actor server-side
[ ] no cross-tenant policy
[ ] no cross-tenant Refund/Credit

[ ] financial values not leaked to unauthorized timeline consumers
```

---

# 146. Definition of Done — Free-first

```text
[ ] D1 bounded queries
[ ] Service Bindings
[ ] Outbox

[ ] no Queue
[ ] no KV
[ ] no R2
[ ] no Cron
[ ] no polling
```

---

# 147. Regression obrigatória

```text
PR23.3 PASS
PR24 PASS
PR25 PASS

PackageReadyForPayment PASS

standard Appointment flow PASS
package flow PASS
payment PASS
refund PASS
internal credit PASS
```

---

# 148. Comandos finais

Executar:

```bash
npm run lint
npx tsc --build --force

npm run test
npm run test:workers

npm run test:payment-concurrency
npm run test:appointment-change-concurrency
npm run test:cancellation-financial-effects

npm run gate:pr25
npm run gate:appointment-change-safety
npm run gate:pr26

npm run workers:dry-run
git diff --check
```

Esperado:

```text
PASS
```

---

# 149. Relatório pós-implementação esperado

O Codex deve encerrar aproximadamente assim:

```text
PR-26 — Appointment Rescheduling + Cancellation + No-show Financial Effects

Baseline
PR25:

Reschedule
endpoint:
reason:
eligibility:
schedule conflict:
history:
deposit:
package:
idempotency:

Cancellation
endpoint:
states:
origin:
reason:
policy:
slot release:

Cancellation Financial Effects
deposit:
payment:
refund:
retain:
credit:
transfer:
receivable:
policy snapshot:

No-show
time tolerance:
status:
Session:
package:
deposit:
profile:

Concurrency
cancel-vs-checkin:
cancel-vs-reschedule:
no-show-vs-checkin:
reschedule-vs-create:
cancel-vs-deposit-confirm:

Reliability
Operations UoW:
Billing UoW:
replay:
ACK-loss:
stale financial decision:
reconciliation:

Timeline
RESCHEDULED:
CANCELED:
NO_SHOW:
REFUND:
CREDIT:

Relationship Profile
no-show:
out-of-policy cancellation:
reclassification:

Tenant Isolation
reschedule:
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

RN-REA
001:
002:
003:
004:
005:

RN-CAN
001:
002:
003:
004:
005:

RN-FAL
001:
002:
003:
004:
005:

Regression
PR23.3:
PR24:
PR25:

Quality
unit:
workers:
concurrency:
financial effects:
lint:
typecheck:
dry-runs:
PR26 gate:

Remaining blockers:

Next PR:
```

# Próximo PR depois do PR-26

Depois deste PR, a **Fase 4 — Agenda** estará muito mais próxima de fechamento completo, já que reagendamento, cancelamento e falta fazem parte explicitamente dessa fase. 

O próximo candidato então passa a ser:

# PR-27 — Confirmation Lifecycle + Pending Operations + Scheduled Expirations

Com foco em:

```text
confirmation state
pending confirmations

deposit expiration automation
pending deposits

no-show automation candidate

return pending/overdue
package expiry warnings
```

Mas eu manteria automações inicialmente através de processamento agendado mínimo e bounded, já que o produto prevê expiração automática do sinal como processamento agendado, sem exigir um mecanismo pesado. 

Portanto, o **próximo PR correto é o PR-26 — Appointment Rescheduling + Cancellation + No-show Financial Effects**. O ponto principal agora não é apenas adicionar três endpoints: é garantir que cada mudança do Appointment produza **um plano financeiro congelado e auditável**, reutilizando Refund/Internal Credit sem deletar histórico, preservando zero consumo automático de pacote e garantindo por CAS/constraints que races como `cancelamento × check-in` ou `falta × check-in` tenham sempre apenas um vencedor lógico.
