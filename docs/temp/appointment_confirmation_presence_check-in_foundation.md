Com o **PR-14 concluído e `gate:pr14 = PASS`**, o próximo PR deixa de ser infraestrutura de confiabilidade e volta ao fluxo funcional do Appointment.

O próximo PR deve ser:

# PR-15 — Appointment Confirmation + Presence / Check-in Foundation

A sequência natural agora é:

```text
Appointment created
        ↓
AWAITING_DEPOSIT
        ↓
Deposit confirmed
        ↓
AWAITING_CONFIRMATION
        ↓
PR-15
CONFIRMED
        ↓
CHECKED_IN / READY_FOR_SERVICE
        ↓
PR-16
Session Lifecycle
```

O objetivo do PR-15 é implementar **confirmação do agendamento, registro de presença/check-in e transições operacionais imediatamente anteriores ao início da sessão**, sem ainda implementar a sessão técnica.

---

# 1. Baseline obrigatório

Antes de qualquer alteração:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:physical-safety
npm run gate:create-appointment
npm run gate:pr12
npm run gate:pr13
npm run gate:pr14
```

Todos devem retornar:

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

Não avançar se qualquer gate já consolidado regredir.

---

# 2. Criar o plano formal do PR

Criar:

```text
docs/plans/PR-15-appointment-confirmation-presence-checkin.md
```

O documento deve conter:

```text
Objective
Current Appointment lifecycle
Canonical states
Confirmation authority
Presence/check-in authority
State machine changes
Commands
HTTP/RPC contracts
Idempotency
Audit
Outbox
Concurrency
Tenant isolation
Observability
Tests
Definition of Done
Out of scope
```

---

# 3. Não criar um novo agregado Appointment

O PR-08 já criou:

```text
Appointment
AppointmentStateMachine
```

O PR-15 deve evoluir essas estruturas.

Antes:

```bash
find apps/operations-worker/src/appointments \
  -maxdepth 7 \
  -type f | sort
```

Revisar:

```text
appointment.ts
appointment-state-machine.ts
appointment.repository.ts
create-appointment.ts
apply-deposit-confirmed.ts
apply-deposit-expired.ts
```

Não criar:

```text
AppointmentV2
ConfirmedAppointment
PresenceAppointment
```

---

# 4. Congelar os estados realmente necessários

Antes de implementar, revisar os estados já definidos no PR-08 e posteriores.

O fluxo precisa suportar semanticamente algo equivalente a:

```text
AWAITING_DEPOSIT
        ↓
AWAITING_CONFIRMATION
        ↓
CONFIRMED
        ↓
CHECKED_IN
```

e estados terminais existentes como:

```text
CANCELED
EXPIRED
NO_SHOW
COMPLETED
```

somente se já canônicos.

Não adicionar estados apenas para conveniência.

---

# 5. Não implementar `IN_SERVICE` ainda se isso pertence à Session

Eu separaria claramente:

```text
CHECKED_IN
```

como último estado do PR-15.

O início técnico:

```text
IN_SERVICE
```

ou equivalente deve ocorrer no PR-16 com Session.

Isso mantém ownership claro:

```text
Operations
→ chegada/presença

Clinical/Session
→ início do procedimento
```

---

# 6. Atualizar `AppointmentStateMachine`

A FSM deve conter transições puras.

Por exemplo:

```text
AWAITING_CONFIRMATION
   └── confirm
          ↓
      CONFIRMED

CONFIRMED
   └── checkIn
          ↓
      CHECKED_IN
```

Além de rejeitar transições inválidas.

---

# 7. `AWAITING_DEPOSIT` não pode ser confirmado diretamente

Se o Appointment exige depósito:

```text
AWAITING_DEPOSIT
```

não deve aceitar:

```text
confirmAppointment()
```

antes de receber `DepositConfirmed`.

O PR-13/14 já resolve:

```text
AWAITING_DEPOSIT
→ AWAITING_CONFIRMATION
```

preservar essa separação.

---

# 8. Confirmar Appointment sem depósito

Appointment criado com:

```text
AWAITING_CONFIRMATION
```

pode seguir diretamente para:

```text
CONFIRMED
```

via `ConfirmAppointment`.

---

# 9. Criar `ConfirmAppointment`

Via Nest CLI:

```bash
nest g service \
  appointments/application/confirm-appointment \
  --project operations-worker
```

Responsabilidade:

```text
load tenant-owned Appointment
↓
validate current status
↓
FSM confirm
↓
persist
↓
Audit
↓
Outbox
↓
Idempotency
```

---

# 10. O comando deve ser pequeno

Conceitualmente:

```text
tenantId
appointmentId
actorId/executionContext
idempotencyKey
```

Não receber:

```text
new status
customerId
professionalId
price
deposit
```

Esses fatos já pertencem ao Appointment.

---

# 11. Não permitir o caller escolher o status

Proibido endpoint genérico:

```http
PATCH /appointments/:id
{
  "status": "CONFIRMED"
}
```

Transições de negócio devem ser explícitas:

```text
ConfirmAppointment
CheckInAppointment
```

Isso preserva FSM e auditoria.

---

# 12. Criar endpoint de confirmação

No Operations Worker:

```http
POST /tenants/:tenantId/appointments/:appointmentId/confirm
```

ou a convenção REST já adotada.

Não usar:

```http
PATCH /appointments/:id/status
```

como mecanismo genérico.

---

# 13. Pipeline HTTP

Reutilizar exatamente:

```text
Cloudflare HTTP Bridge
↓
Authentication
↓
Tenant membership
↓
Permission
↓
Validation
↓
Idempotency-Key
↓
ConfirmAppointment
```

---

# 14. Permissão

Usar permissão canônica existente, se já houver algo como:

```text
appointment.confirm
```

Se não existir, verificar documentação antes de criar.

Não transformar:

```text
appointment.create
```

automaticamente em poder de confirmar.

---

# 15. Idempotência obrigatória

`ConfirmAppointment` é uma mutação crítica.

Primeira request:

```text
AWAITING_CONFIRMATION
→ CONFIRMED
```

Replay:

```text
CONFIRMED
→ same logical response
```

Sem:

```text
novo Audit
novo Outbox
segunda mutação
```

---

# 16. Same key + different Appointment

Deve gerar:

```text
IDEMPOTENCY_KEY_CONFLICT
```

conforme foundation atual.

Não reutilizar key silenciosamente.

---

# 17. CAS para confirmação

Mesmo com FSM, precisamos garantir concorrência física.

Repository deve realizar transição condicional:

```sql
UPDATE appointments
SET status = 'CONFIRMED'
WHERE tenant_id = ?
  AND id = ?
  AND status = 'AWAITING_CONFIRMATION'
```

e verificar:

```text
changes = 1
```

A ideia é equivalente às proteções já usadas em Scheduling/Deposit.

---

# 18. Não usar read → write sem CAS

Evitar:

```text
SELECT status
↓
if valid
↓
UPDATE status
```

sozinho.

Duas requests concorrentes podem passar pelo read.

FSM + CAS precisam trabalhar juntas.

---

# 19. Repository port

Se o repository atual só tem `save`, considere adicionar operação orientada à transição:

```text
transitionStatus(...)
```

ou método específico.

Não colocar SQL no Application.

---

# 20. Concorrência Confirm × Confirm

Duas requests diferentes:

```text
different Idempotency-Key
same Appointment
```

simultâneas.

Esperado:

```text
1 transition applied
1 logical replay/conflict depending on contract
Appointment final = CONFIRMED
```

Nunca dois eventos de negócio independentes.

---

# 21. Confirmar Appointment cancelado

```text
CANCELED
→ Confirm
```

deve ser rejeitado.

Não ressuscitar Appointment.

---

# 22. Confirmar Appointment expirado

Mesmo:

```text
EXPIRED
→ reject
```

---

# 23. Confirmar Appointment já confirmado

Há dois casos.

### Mesmo evento/idempotency

```text
replay
```

### Nova key tentando repetir a operação

Pode retornar:

```text
ALREADY_CONFIRMED
```

ou resultado idempotente, conforme contrato que você congelar.

Escolha uma semântica única e documente.

---

# 24. Audit da confirmação

Na mesma UnitOfWork:

```text
appointment.confirmed
```

ou nome oficial equivalente.

Metadata:

```text
tenantId
actorId
appointmentId
previousStatus
newStatus
requestId
correlationId
occurredAt
```

Sem PII.

---

# 25. Outbox da confirmação

Criar:

```text
AppointmentConfirmed
```

status:

```text
PENDING
```

PR-14 agora já possui delivery foundation, mas **não crie consumer sem necessidade neste PR**.

O evento fica preparado para:

```text
notifications
reminders
future integrations
```

---

# 26. Não enviar mensagem diretamente

Não:

```text
confirm Appointment
→ send WhatsApp
```

dentro da transação.

Outbox é justamente a fronteira correta.

---

# 27. Criar Presence / Check-in

Depois de Appointment confirmado, precisamos representar que o cliente chegou.

Eu manteria isso no Operations.

---

# 28. Não criar entidade `Presence` complexa ainda

Para MVP, provavelmente basta:

```text
Appointment status = CHECKED_IN
```

e timestamps:

```text
checkedInAt
checkedInBy
```

se normativos.

Não criar um aggregate Presence separado sem necessidade.

---

# 29. Verificar schema atual

Se `appointments` não possui:

```text
confirmed_at
checked_in_at
```

criar migration:

```text
0009_appointment_confirmation_presence.sql
```

ajustando numeração real.

---

# 30. Campos recomendados

Somente se normativos:

```text
confirmed_at
confirmed_by

checked_in_at
checked_in_by
```

Talvez:

```text
confirmation_source
```

se o produto realmente diferencia manual/automática.

Não inventar agora.

---

# 31. Criar `CheckInAppointment`

Via CLI:

```bash
nest g service \
  appointments/application/check-in-appointment \
  --project operations-worker
```

Fluxo:

```text
load Appointment
↓
must be CONFIRMED
↓
FSM checkIn
↓
CAS
↓
Audit
↓
Outbox
↓
Idempotency
```

---

# 32. Endpoint Check-in

Recomendado:

```http
POST /tenants/:tenantId/appointments/:appointmentId/check-in
```

---

# 33. Permissão

Usar:

```text
appointment.check-in
```

somente se já prevista.

Se o projeto possui modelo mais genérico de atendimento operacional, usar a permissão canônica real.

---

# 34. Não permitir Check-in a partir de `AWAITING_CONFIRMATION`

Fluxo esperado:

```text
AWAITING_CONFIRMATION
   X
CHECK_IN
```

É necessário confirmar antes.

---

# 35. Não permitir Check-in a partir de `AWAITING_DEPOSIT`

Obviamente:

```text
deposit pending
→ check-in blocked
```

Mesmo que o cliente fisicamente tenha chegado, o workflow oficial precisa manter a regra de negócio já definida.

Se produto posteriormente permitir exceção administrativa, outro fluxo explícito será necessário.

---

# 36. Check-in em Appointment cancelado

```text
CANCELED
→ reject
```

---

# 37. Check-in já realizado

Replay seguro.

Nenhuma duplicação de Audit/Outbox.

---

# 38. CAS de Check-in

Mesma estratégia:

```sql
UPDATE appointments
SET status='CHECKED_IN',
    checked_in_at=?
WHERE tenant_id=?
  AND id=?
  AND status='CONFIRMED'
```

`changes=1`.

---

# 39. Concorrência Confirm × Check-in

Esse cenário precisa ser testado.

Duas operações concorrentes:

```text
ConfirmAppointment
CheckInAppointment
```

sobre:

```text
AWAITING_CONFIRMATION
```

O Check-in não pode “pular” a confirmação.

Resultados possíveis:

```text
Confirm succeeds
CheckIn initially fails
```

ou, se retry ocorrer depois:

```text
CONFIRMED
→ CHECKED_IN
```

Mas nunca uma escrita incoerente.

---

# 40. Concorrência Check-in × Check-in

Duas requests simultâneas.

Resultado lógico único.

---

# 41. Timestamp deve ser server-side

Não aceitar:

```json
{
  "checkedInAt": "..."
}
```

como autoridade normal.

Use relógio do backend:

```text
ClockPort.now()
```

se já existir abstraction.

---

# 42. Criar ClockPort se ainda não houver?

Somente se o projeto já sofre com `new Date()` espalhado e o padrão fizer sentido.

Não transformar PR-15 em refatoração global de time.

Pode usar abstraction local/testável.

---

# 43. Cancelamento continua fora

Mesmo que FSM tenha `CANCELED`, não implementar:

```text
CancelAppointment
```

neste PR.

Isso merece regras próprias:

```text
motivo
janela
depósito
refund
no-show
```

---

# 44. No-show também fora

`NO_SHOW` depende de:

```text
horário
grace period
presença
política
```

Não misturar com check-in.

---

# 45. ConfirmPresence é diferente de Check-in?

Se o produto usa:

```text
presence confirmation
```

antes do check-in, revisar documentação.

Mas para evitar estados duplicados, eu faria:

```text
AppointmentConfirmed
```

= agendamento confirmado operacionalmente.

```text
CheckIn
```

= cliente chegou.

Não criaria `Presence` como terceiro conceito sem regra clara.

---

# 46. Reutilizar Reliability

Tanto confirmação quanto check-in:

```text
UnitOfWork
Idempotency
Audit
Outbox
```

já existem.

Não criar reliability específica.

---

# 47. Atomicidade Confirm

Local UnitOfWork:

```text
Appointment CAS transition
+
Audit
+
Outbox
+
Idempotency completion
```

tudo local.

---

# 48. Atomicidade Check-in

Mesma estrutura.

---

# 49. Nenhuma RPC externa necessária para confirmar

Confirmation é Operations-owned.

Não chamar Billing/Clinical só porque Appointment foi confirmado.

Isso mantém custo baixo.

---

# 50. Nenhuma RPC externa para Check-in

Também local.

O Clinical será acionado apenas quando a Session começar, no próximo PR.

---

# 51. Free Tier

Isso é importante.

Após PR-15:

```text
ConfirmAppointment
→ 1 Operations invocation
→ bounded D1 writes
```

```text
CheckIn
→ 1 Operations invocation
→ bounded D1 writes
```

Sem:

```text
Billing RPC
Clinical RPC
KV
R2
Queue
```

---

# 52. Outbox dispatcher PR-14

Não execute dispatcher dentro do request.

Após confirmação:

```text
Outbox AppointmentConfirmed = PENDING
```

O request retorna.

Delivery assíncrona continua independente.

---

# 53. Suporte futuro a confirmação automática

Não implementar agora.

No futuro:

```text
DepositConfirmed
→ AWAITING_CONFIRMATION
```

pode ser seguido por uma política que confirme automaticamente.

Mas neste PR a confirmação é um comando explícito.

---

# 54. Criar contratos HTTP

Em `libs/contracts`, se necessário:

```text
ConfirmAppointmentResponse
CheckInAppointmentResponse
```

Requests podem não ter body.

Não criar Domain entities compartilhadas.

---

# 55. Request body vazio é suficiente

Por exemplo:

```http
POST .../confirm
Idempotency-Key: ...
```

Body:

```json
{}
```

ou nenhum body.

Não force DTO sem campos.

---

# 56. Response

Pode retornar snapshot enxuto:

```json
{
  "id": "...",
  "status": "CONFIRMED",
  "confirmedAt": "..."
}
```

Para check-in:

```json
{
  "id": "...",
  "status": "CHECKED_IN",
  "checkedInAt": "..."
}
```

---

# 57. Não retornar Audit/Outbox internals

Continuar escondendo infraestrutura.

---

# 58. Error codes

Reutilizar/introduzir códigos estáveis como:

```text
APPOINTMENT_NOT_CONFIRMABLE
APPOINTMENT_NOT_CHECKIN_ELIGIBLE
APPOINTMENT_ALREADY_CONFIRMED
APPOINTMENT_ALREADY_CHECKED_IN
```

somente se o error model não possuir equivalentes.

Preferir código semântico a mensagem.

---

# 59. HTTP mapping

Provável:

```text
resource missing → 404
invalid transition → 409
idempotency conflict → 409
auth → 401
permission → 403
validation → 400
```

---

# 60. Teste unitário da FSM

Cobrir:

```text
AWAITING_CONFIRMATION → CONFIRMED
```

```text
CONFIRMED → CHECKED_IN
```

e todas as transições proibidas relevantes.

---

# 61. Teste unitário ConfirmAppointment

Com fake repository/UoW.

Caminho feliz.

---

# 62. Teste unitário CheckInAppointment

Mesmo.

---

# 63. Worker E2E — criação sem depósito

Reutilizar CreateAppointment real:

```text
CreateAppointment
→ AWAITING_CONFIRMATION
```

Depois:

```text
Confirm
→ CONFIRMED
```

Depois:

```text
CheckIn
→ CHECKED_IN
```

Esse será o principal vertical do PR-15.

---

# 64. Worker E2E — criação com depósito

Fluxo:

```text
CreateAppointment
→ AWAITING_DEPOSIT
```

Confirm attempt:

```text
→ 409 / BLOCKED
```

Depois aplicar fluxo PR-13:

```text
Deposit CONFIRMED
→ Appointment AWAITING_CONFIRMATION
```

Então:

```text
Confirm
→ CONFIRMED
```

Depois:

```text
CheckIn
→ CHECKED_IN
```

---

# 65. Replay de Confirm

Primeira:

```text
201/200 logical transition
```

Replay:

```text
same Appointment
same confirmedAt
```

Não gerar novo timestamp.

Muito importante.

---

# 66. Replay de Check-in

Mesma regra:

```text
checkedInAt original
```

não deve mudar.

---

# 67. Idempotency key conflict

Mesma key usada em:

```text
appointment A
```

e depois:

```text
appointment B
```

deve conflictar.

---

# 68. Audit physical test

Confirm:

```text
appointment row updated
audit +1
outbox +1
idempotency completed
```

Check-in idem.

---

# 69. Outbox physical test

Eventos:

```text
AppointmentConfirmed
AppointmentCheckedIn
```

status:

```text
PENDING
```

Se PR-14 dispatcher não suporta esses event types, eles podem permanecer pending.

Não marque `DEAD` automaticamente no mesmo Worker se ainda não existe destination.

O dispatcher precisa distinguir eventos localmente não roteados de unsupported invalid event.

---

# 70. Este ponto pode exigir cuidado no PR-14

Se `DispatchOutboxBatch` atual marca qualquer event type desconhecido como `DEAD`, adicionar `AppointmentConfirmed` agora poderia produzir `DEAD`.

Há duas opções:

```text
A. registrar destination/event routing somente para eventos dispatcháveis
```

ou:

```text
B. event type sem delivery configurado permanece fora da seleção do dispatcher
```

Eu prefiro B.

Não transformar evento válido porém ainda sem consumidor em evento morto.

---

# 71. Ajustar dispatcher apenas se necessário

Se o PR-14 busca:

```text
todos PENDING
```

e tenta qualquer type, ajuste `findDispatchable`/routing para selecionar apenas eventos com delivery route conhecida.

Isso é uma pequena evolução legítima no PR-15.

---

# 72. Não implementar Notification consumer

Ainda fora.

---

# 73. Cross-tenant Confirm

Tenant A não confirma Appointment B.

---

# 74. Cross-tenant Check-in

Mesma regra.

---

# 75. Confirm after DepositExpired

Appointment:

```text
EXPIRED
```

não pode confirmar.

---

# 76. Check-in after DepositExpired

Também não.

---

# 77. Confirm canceled

Bloqueado.

---

# 78. Check-in canceled

Bloqueado.

---

# 79. Simultaneous confirm requests

Teste físico com D1 real.

Por exemplo:

```text
20 iterations
2 concurrent confirms each
```

Resultado:

```text
one state transition per appointment
duplicate business effects = 0
```

---

# 80. Simultaneous check-in

Mesmo.

---

# 81. Confirm vs cancellation não é necessário

Cancel ainda não existe como use case.

Não criar teste fictício.

---

# 82. Migration

Se necessário:

```text
0009_appointment_confirmation_presence.sql
```

Adicionar somente os campos/timestamps que o domínio precisa.

---

# 83. Não criar tabela `appointment_status_history` automaticamente

Audit já fornece histórico confiável.

Se futuramente houver necessidade de timeline rápida, outra decisão.

---

# 84. Indexes

Não adicionar índice para:

```text
confirmed_at
```

sem query real.

O update usa:

```text
tenant_id + id + status
```

Verifique índices existentes.

---

# 85. Query CAS deve ser eficiente

Se primary key `id` + tenant validation já resolvem, ótimo.

Não criar índices redundantes.

---

# 86. Observability

Confirm:

```text
operation=ConfirmAppointment
appointmentId
tenantId
actorId
previousStatus
result
correlationId
duration
```

Check-in equivalente.

---

# 87. Não logar customer details

Ainda não.

---

# 88. Métricas

Se já existe mecanismo:

```text
appointment.confirm.success
appointment.confirm.replay
appointment.confirm.conflict

appointment.checkin.success
appointment.checkin.replay
appointment.checkin.conflict
```

Baixa cardinalidade.

---

# 89. Health regression

Operations `/health` continua sem D1.

---

# 90. Billing/Clinical intocados

Dry-runs continuam obrigatórios porque monorepo/shared libs podem ter sido alterados.

---

# 91. Criar gate `pr15`

```bash
npm run gate:pr15
```

Incluindo:

```text
lint
typecheck
unit
workers
physical safety
pr12
pr13
pr14
PR15 tests
dry-runs
```

---

# 92. Não duplicar gates de forma absurda

Se:

```text
gate:pr14
```

já inclui todos os anteriores:

```text
gate:pr15
→ gate:pr14
+ PR15-specific tests
```

é suficiente.

Evitar repetir tudo três vezes se isso tornar CI lento.

---

# 93. Teste vertical principal

O cenário culminante:

```text
POST Appointment
        ↓
AWAITING_CONFIRMATION
        ↓
POST confirm
        ↓
CONFIRMED
        ↓
POST check-in
        ↓
CHECKED_IN
```

Com:

```text
Audit
Outbox
Idempotency
```

em cada mutação.

---

# 94. Cenário completo com depósito

Segundo vertical:

```text
CreateAppointment
↓
AWAITING_DEPOSIT
↓
Create/Confirm Deposit
↓
Outbox/Reconciliation
↓
AWAITING_CONFIRMATION
↓
ConfirmAppointment
↓
CONFIRMED
↓
CheckIn
↓
CHECKED_IN
```

Esse teste prova integração PR-12–15.

---

# 95. Não iniciar Session

No final:

```text
CHECKED_IN
```

e parar.

Nada de:

```text
Session.create
TechnicalRecord
Equipment
Parameters
Photos
```

---

# 96. Definition of Done — FSM

```text
[ ] AWAITING_CONFIRMATION → CONFIRMED

[ ] CONFIRMED → CHECKED_IN

[ ] AWAITING_DEPOSIT cannot confirm

[ ] AWAITING_CONFIRMATION cannot check-in

[ ] terminal/incompatible states protected
```

---

# 97. Definition of Done — Confirm

```text
[ ] ConfirmAppointment use case

[ ] endpoint exposed

[ ] auth

[ ] tenant

[ ] permission

[ ] Idempotency-Key

[ ] CAS transition

[ ] confirmedAt server-generated

[ ] Audit

[ ] Outbox

[ ] replay safe
```

---

# 98. Definition of Done — Check-in

```text
[ ] CheckInAppointment use case

[ ] endpoint exposed

[ ] auth

[ ] tenant

[ ] permission

[ ] Idempotency-Key

[ ] CAS transition

[ ] checkedInAt server-generated

[ ] Audit

[ ] Outbox

[ ] replay safe
```

---

# 99. Definition of Done — reliability

```text
[ ] Appointment mutation + Audit + Outbox + Idempotency locally atomic

[ ] failure injection PASS

[ ] no partial confirmation

[ ] no partial check-in
```

---

# 100. Definition of Done — concurrency

```text
[ ] concurrent confirm protected

[ ] concurrent check-in protected

[ ] no duplicate Audit effect

[ ] no duplicate Outbox effect

[ ] no in-memory mutex
```

---

# 101. Definition of Done — tenant isolation

```text
[ ] cross-tenant confirm blocked

[ ] cross-tenant check-in blocked

[ ] repository queries tenant-aware
```

---

# 102. Definition of Done — Outbox integration

```text
[ ] AppointmentConfirmed persisted

[ ] AppointmentCheckedIn persisted

[ ] status PENDING

[ ] dispatcher does not incorrectly DEAD-letter valid unrouted events

[ ] no notification consumer added
```

---

# 103. Definition of Done — regression

```text
[ ] CreateAppointment PASS

[ ] Deposit lifecycle PASS

[ ] Deposit reconciliation PASS

[ ] scheduling PASS

[ ] Clinical PASS

[ ] Billing PASS
```

---

# 104. Definition of Done — quality

```text
[ ] npm run lint PASS

[ ] tsc --build --force PASS

[ ] npm run test PASS

[ ] npm run test:workers PASS

[ ] gate:pr14 PASS

[ ] gate:pr15 PASS

[ ] Operations dry-run PASS

[ ] Billing dry-run PASS

[ ] Clinical dry-run PASS

[ ] git diff --check PASS
```

---

# 105. O que fica fora do PR-15

Não implementar:

```text
Session

StartSession

TechnicalRecord

Assessment mutation

Equipment

Photos

R2

Payment

Refund

CancelAppointment

RescheduleAppointment

NoShow

Reminder scheduler

WhatsApp

Email
```

---

# 106. Relatório pós-implementação obrigatório

O Codex deve finalizar com algo como:

```text
PR-15 — Appointment Confirmation + Presence / Check-in Foundation

Baseline
PR14 gate:

Appointment FSM
confirmed transition:
check-in transition:
invalid transitions:

Persistence
migration:
confirmedAt:
checkedInAt:
CAS:

ConfirmAppointment
HTTP:
permission:
idempotency:
success:
replay:
concurrency:

CheckInAppointment
HTTP:
permission:
idempotency:
success:
replay:
concurrency:

Reliability
Audit:
Outbox:
failure atomicity:

Outbox Routing
AppointmentConfirmed:
AppointmentCheckedIn:
unrouted event handling:

Tenant Isolation
confirm:
check-in:

E2E
no-deposit:
with-deposit:
full flow:

Regression
PR12:
PR13:
PR14:

Quality
unit:
workers:
lint:
typecheck:
dry-runs:
PR15 gate:

Remaining blockers:

Next PR:
```

---

# Próximo PR após PR-15

Com `CHECKED_IN` disponível, o próximo PR deve ser:

# PR-16 — Session Lifecycle Foundation

O fluxo então passa a ser:

```text
Appointment
CHECKED_IN
      ↓
PR-16
StartSession
      ↓
Session IN_PROGRESS
      ↓
Technical Record
      ↓
CompleteSession
      ↓
Appointment COMPLETED
```

O PR-16 será o ponto certo para introduzir:

```text
Session
Technical parameters
Equipment
Performed area
Time
Professional execution
Clinical record linkage
```

mas ainda pode deixar:

```text
photos / R2
payment settlement
```

para PRs separados.

Portanto, **o próximo PR correto é o PR-15 — Appointment Confirmation + Presence / Check-in Foundation**. A principal regra de escopo é terminar em `CHECKED_IN`: confirmação e presença são responsabilidade operacional; a sessão técnica começa apenas no PR seguinte.
