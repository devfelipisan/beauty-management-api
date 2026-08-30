Com o **PR-11.9 concluído** e, principalmente, com:

```text
gate:physical-safety   = PASS
gate:create-appointment = PASS
CreateAppointmentReady = PASS
```

o ciclo preparatório dos PRs `11.x` terminou. O próximo PR deve finalmente ser:

# PR-12 — CreateAppointment Authoritative Flow

Este é o primeiro PR autorizado a criar o endpoint autoritativo:

```http
POST /tenants/:tenantId/appointments
```

O objetivo não é simplesmente “inserir uma linha em `appointments`”. O PR deve compor todas as fundações qualificadas desde o PR-05:

```text
HTTP / Cloudflare Worker
        ↓
Authentication
        ↓
Trusted Tenant
        ↓
Permission
        ↓
Validation
        ↓
Idempotency-Key
        ↓
Appointment Eligibility
        ├── Tenant
        ├── License
        ├── Plan
        ├── Customer
        ├── Customer Restrictions
        ├── Service
        ├── Professional
        ├── Professional-Service
        ├── Clinical Assessment
        ├── Availability
        └── Conflict
        ↓
CommercialTerms
        ↓
Billing Worker
        ↓
UnitOfWork
        ├── reserve slot
        ├── persist Appointment
        ├── Audit
        ├── Outbox
        └── complete Idempotency
        ↓
COMMIT
        ↓
201 Created
```

Isso corresponde diretamente ao contrato funcional: `RN-AGE-001` estabelece todas as pré-condições de criação e `RN-AGE-002` exige empresa, cliente, serviço, profissional, data/horários, duração, preço-base, desconto, preço final, sinal, origem e status.  A documentação também exige congelamento histórico dos valores utilizados e proteção idempotente contra dois agendamentos por repetição da mesma operação. 

---

# 1. Congelar o baseline antes do PR

Começar obrigatoriamente:

```bash
pwd
git status
git branch --show-current
git log --oneline -20

npm run gate:physical-safety
npm run gate:create-appointment
```

Esperado:

```text
PASS
PASS
```

Depois:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers
```

Não começar `CreateAppointment` se algum gate que já estava verde regredir.

---

# 2. Criar plano formal do PR

Criar:

```text
docs/plans/PR-12-create-appointment-authoritative-flow.md
```

O documento deve congelar:

```text
Objective
Dependencies
HTTP contract
Application flow
Idempotency boundary
Eligibility
CommercialTerms
Atomic persistence
Audit
Outbox
Error model
Concurrency
Tenant isolation
Observability
Free-tier impact
Tests
Definition of Done
Out of scope
```

---

# 3. Confirmar que o PR não redefine nenhuma fundação

O PR deve **reutilizar**:

```text
PR-06
Tenant / Professional / Service / Customer

PR-07
UnitOfWork
Idempotency
Audit
Outbox

PR-08
Appointment
TimeInterval
FSM
Availability
ScheduleReservation

PR-09
AppointmentEligibility

PR-10
CommercialTermsPort

PR-11
License / Plan / Restriction / Assessment

PR-11.6+
Cloudflare runtime + RPC + Workers tests

PR-11.8
Discount / Deposit policies

PR-11.9
final readiness
```

Não criar:

```text
CreateAppointmentEligibilityV2
NewUnitOfWork
NewIdempotencyService
AppointmentCommercialCalculator
```

paralelos.

---

# 4. Inspecionar o domínio Appointment existente

Antes de qualquer alteração:

```bash
find apps/operations-worker/src/appointments \
  -maxdepth 6 \
  -type f | sort
```

Depois revisar:

```text
appointment.ts
appointment-state-machine.ts
time-interval.ts
appointment-repository.ts
schedule-reservation.port.ts
commercial-terms-port.ts
```

`Appointment` já existe desde PR-08.

PR-12 não deve recriá-lo.

---

# 5. Inspecionar schema `appointments`

Abrir:

```bash
cat database/d1/migrations/0003_scheduling_foundation.sql
```

e migrations posteriores relevantes.

Verificar se a tabela consegue congelar tudo que agora existe em `CommercialTerms`.

Precisamos preservar, no mínimo:

```text
tenantId

customerId
serviceId
professionalId

startsAt
endsAt
durationMinutes

basePriceCents
discountCents
finalPriceCents

depositRequired
depositCents / absence

origin
status
```

A preservação histórica de preço-base, política de desconto, perfil do cliente, desconto, preço final e regra do sinal é requisito explícito do domínio. 

---

# 6. Verificar snapshots comerciais adicionais

O PR-11.8 agora produz algo mais rico que simples valores:

```text
customer profile snapshot
discount policy id
discount policy snapshot
discount type/value
deposit configuration
```

Compare isso com o schema atual.

Se o schema já preserva tudo:

```text
nenhuma migration
```

Se estiver incompleto:

```text
0006_create_appointment_authoritative_snapshot.sql
```

ou nome equivalente.

Não criar migration apenas para manter sequência numérica.

---

# 7. Não criar uma segunda representação de CommercialTerms

Se o PR-11.8 já definiu:

```text
AppliedDiscountSnapshot
DepositDecision
ServiceCommercialContext
CommercialTermsResponse
```

usar esses contratos.

Não criar:

```text
AppointmentDiscountDetailsV2
```

com os mesmos campos e semântica diferente.

---

# 8. Criar `CreateAppointment`

Usando Nest CLI:

```bash
nest g service \
  appointments/application/create-appointment \
  --project operations-worker
```

Se o generator criar spec padrão incompatível com a organização atual, mover/ajustar de acordo com os testes do repositório.

O use case deverá ser a **autoridade** da operação.

---

# 9. Definir `CreateAppointmentCommand`

O comando deve conter apenas intenção do caller.

Conceitualmente:

```ts
interface CreateAppointmentCommand {
  tenantId: string;

  customerId: string;
  serviceId: string;
  professionalId: string;

  startsAt: string;

  origin: AppointmentOrigin;

  idempotencyKey: string;

  executionContext: ExecutionContext;
}
```

A assinatura exata deve seguir as convenções atuais.

---

# 10. O cliente NÃO envia duração

Não aceitar como autoridade:

```json
{
  "durationMinutes": 60
}
```

A duração vem do Service.

Fluxo:

```text
Service.durationMinutes
        ↓
startsAt
        ↓
TimeInterval
        ↓
endsAt
```

A regra exige ocupação do intervalo completo do agendamento. 

---

# 11. O cliente NÃO envia preço

Proibido aceitar como autoridade:

```json
{
  "basePriceCents": 20000,
  "discountCents": 2000,
  "finalPriceCents": 18000
}
```

O frontend não calcula finanças.

Fluxo:

```text
ServiceCommercialContext
       ↓
Billing Worker
       ↓
CommercialTerms
```

A arquitetura consolidada determina que frontend e BFF não sejam autoridades para desconto, sinal ou estado de negócio. 

---

# 12. O cliente NÃO envia sinal calculado

Também não aceitar:

```json
{
  "depositCents": 3600
}
```

como valor autoritativo.

O cálculo já foi qualificado:

```text
basePrice 20000
- discount 2000
= finalPrice 18000

20% de 18000
= deposit 3600
```

PR-12 apenas consome esse resultado.

---

# 13. O cliente NÃO define status

Não aceitar:

```json
{
  "status": "CONFIRMED"
}
```

`Appointment` decide seu status inicial com base nos termos comerciais.

---

# 14. Payload HTTP mínimo

O request público deve ser aproximadamente:

```json
{
  "customerId": "...",
  "serviceId": "...",
  "professionalId": "...",
  "startsAt": "...",
  "origin": "RECEPTION"
}
```

Adapte os nomes às convenções atuais.

O `tenantId` vem do path:

```text
/tenants/:tenantId/appointments
```

e precisa ser transformado de tenant candidato para tenant confiável através do pipeline já qualificado.

---

# 15. Origem

Validar somente as origens canônicas já congeladas:

```text
RECEPTION
LANDING_PAGE
WHATSAPP
RETURN
CAMPAIGN
REFERRAL
MANUAL
```

RN-AGE-004 enumera essas origens funcionais. 

Não adicionar:

```text
API
MOBILE
BOT
INTERNAL
```

sem contrato.

---

# 16. `Idempotency-Key` passa a ser obrigatório

Request:

```http
POST /tenants/:tenantId/appointments
Idempotency-Key: <opaque-key>
```

Sem header:

```text
request rejected
```

pelo error contract escolhido.

A documentação técnica coloca explicitamente `JWT + Idempotency-Key` antes da reserva da idempotência e da mutação crítica. 

---

# 17. Não aceitar Idempotency-Key no body

Evite:

```json
{
  "idempotencyKey": "..."
}
```

Ela é metadado do comando HTTP.

O bridge extrai o header e passa ao Application.

---

# 18. Operation name estável

Usar uma operação estável:

```text
CREATE_APPOINTMENT
```

ou a convenção já adotada.

Não construir operation names dinamicamente:

```text
CREATE_APPOINTMENT_<tenant>
```

A identidade já contém tenant separadamente.

---

# 19. Construir hash canônico

O request hash deve representar a **intenção de negócio**.

Incluir:

```text
tenantId
customerId
serviceId
professionalId
startsAt
origin
```

Não incluir:

```text
requestId
correlationId
JWT
Authorization
timestamp interno
```

Senão replay legítimo produziria hash diferente.

---

# 20. Reutilizar IdempotencyService já provado

Não reimplementar:

```text
find key
if found ...
```

dentro de `CreateAppointment`.

Usar a foundation qualificada pelo PR-11.7.

Regra:

```text
same tenant
same operation
same key
same hash
→ replay
```

```text
same tenant
same operation
same key
different hash
→ IDEMPOTENCY_KEY_CONFLICT
```

A idempotência de operações críticas é requisito central do domínio. 

---

# 21. Ordem do caso de uso

Eu congelaria o fluxo em três fases.

```text
PHASE 1 — Admission
PHASE 2 — Commercial decision
PHASE 3 — Authoritative commit
```

Isso evita misturar RPC remoto com transação D1 local.

---

# 22. Fase 1 — Admission

Executar:

```text
CheckAppointmentEligibility
```

com:

```text
tenant
customer
service
professional
startsAt
```

Essa capability já verifica:

```text
Tenant ativo
License operacional
Plan
Customer ativo
Customer restriction
Service ativo
Professional ativo
Professional-Service
Assessment
Availability
Conflict
```

RN-AGE-001 exige justamente esse conjunto de pré-condições. 

---

# 23. Fail-closed permanece

Se Eligibility retorna:

```text
BLOCKED
```

CreateAppointment para imediatamente.

Não chamar Billing.

Não executar UnitOfWork.

Não gravar:

```text
Appointment
Audit
Outbox
Idempotency completed
```

---

# 24. Evitar consultas duplicadas

Analise o resultado atual de `CheckAppointmentEligibility`.

Se ele só retorna:

```text
READY/BLOCKED
```

mas o CreateAppointment precisa reler:

```text
Customer
Service
Professional
```

para montar o Appointment, considere devolver um **AdmissionContext** seguro no estado `READY`.

Por exemplo:

```text
service duration
service commercial context
customer profile snapshot
```

Mas não transforme `EligibilityResult` em dump das entidades.

---

# 25. `AdmissionContext` deve ser read-only

Ele representa fatos já verificados:

```text
customerId
serviceId
professionalId

duration

customerRelationshipProfile

serviceCommercialContext
```

Não é agregado.

Não persista essa estrutura como entidade.

---

# 26. Fase 2 — CommercialTerms

Depois de `Eligibility = READY`:

```text
CommercialTermsPort
        ↓
BILLING_SERVICE
        ↓
CalculateCommercialTerms
```

Passar:

```text
tenant
service commercial snapshot
customer relationship profile
correlation
```

segundo contrato do PR-11.8.

---

# 27. CommercialTerms BLOCKED

Se Billing retornar:

```text
BLOCKED
```

CreateAppointment também:

```text
BLOCKED
```

Sem mutation.

Não fallback:

```text
discount=0
deposit absent
```

---

# 28. CommercialTerms READY

Agora teremos algo como:

```text
basePriceCents
discountCents
finalPriceCents

depositRequired
depositCents?

discount snapshot
deposit configuration snapshot
```

Esses valores serão congelados no Appointment.

---

# 29. Definir `TimeInterval`

A partir de:

```text
startsAt
+
Service.durationMinutes
```

criar:

```text
TimeInterval
```

Usando a implementação do PR-08.

Não duplicar matemática temporal.

---

# 30. Status inicial

Formalizar essa regra no domínio/application.

Se:

```text
depositRequired = true
```

o Appointment nasce:

```text
AWAITING_DEPOSIT
```

Se:

```text
depositRequired = false
```

nasce:

```text
AWAITING_CONFIRMATION
```

Isso decorre do fluxo oficial `Aguardando sinal → Aguardando confirmação → Confirmado` e da possibilidade de o sinal não ser exigido. 

Não tornar `CONFIRMED` estado inicial.

---

# 31. Não criar Deposit financeiro

Neste PR:

```text
depositRequired
depositCents
deposit configuration
```

são snapshots comerciais do Appointment.

Não criar ainda:

```text
Deposit payment
Deposit confirmation
Deposit receipt
Deposit ledger
```

Isso pertence ao fluxo posterior de `ConfirmDeposit`.

---

# 32. Fase 3 — Authoritative commit

Depois de Admission + CommercialTerms:

```text
UnitOfWork.execute(...)
```

A proposta técnica determina que mutação, auditoria, outbox e idempotência façam parte da mesma fronteira lógica da operação crítica. 

---

# 33. Não manter transação aberta durante RPC

Não faça:

```text
BEGIN UnitOfWork
↓
call Clinical
↓
call Billing
↓
...
```

RPCs externos não fazem parte da transação D1 local.

Fluxo correto:

```text
Clinical/Eligibility reads
Billing calculation
        ↓
decision READY
        ↓
local UnitOfWork
```

---

# 34. Dentro do UnitOfWork

A composição deve ser aproximadamente:

```text
UnitOfWork
   │
   ├── idempotency reservation/check
   │
   ├── ScheduleReservation
   │
   ├── AppointmentRepository.create
   │
   ├── AuditWriter.append
   │
   ├── OutboxWriter.append
   │
   └── Idempotency.complete
```

usando exatamente a semântica física já qualificada.

---

# 35. Revalidar o slot no commit

Muito importante:

```text
CheckAppointmentEligibility
```

ter dito:

```text
slot free
```

é preflight.

Entre isso e o commit, outro request pode reservar o horário.

Por isso:

```text
ScheduleReservationPort
```

continua sendo a autoridade final contra conflito.

---

# 36. Nunca confiar apenas em `CheckAvailability`

Não faça:

```text
availability == true
→ INSERT appointment simples
```

O PR-11.7 já provou fisicamente concorrência usando a primitive D1.

Reutilize exatamente essa implementação.

---

# 37. Corrida esperada

Duas requests diferentes:

```text
key A
key B

same professional
same interval
```

podem ambas passar pelo preflight.

No commit:

```text
A → reservation success
B → APPOINTMENT_TIME_CONFLICT
```

Resultado final:

```text
rows = 1
```

A especificação técnica exige explicitamente que duas reservas simultâneas produzam somente um sucesso.

---

# 38. Criar Appointment somente após reserva válida

Não:

```text
INSERT appointment
↓
check conflict
```

A operação de persistência deve respeitar a estratégia de reservation já comprovada.

---

# 39. Gerar ID no servidor

`appointmentId` deve ser criado na aplicação/backend.

Não confiar em ID fornecido pelo frontend.

Reutilizar a infraestrutura de ID existente.

Não introduzir outra biblioteca de UUID se já houver estratégia.

---

# 40. Criar Appointment através do Domain

Nada de:

```ts
repository.insert({
  status: "...",
  ...
});
```

diretamente a partir do DTO.

Deve existir:

```text
CreateAppointment
    ↓
Appointment.create(...)
    ↓
validated domain object
    ↓
repository
```

ou factory equivalente já existente.

---

# 41. Snapshot monetário

Persistir exatamente:

```text
basePriceCents
discountCents
finalPriceCents
depositRequired
depositCents/absence
```

Nunca recalcular ao consultar Appointment.

RN-GER-004 determina que alterações futuras de preço, perfil e política não podem alterar automaticamente operações anteriores. 

---

# 42. Snapshot do perfil

O perfil comercial utilizado no cálculo deve ficar congelado quando previsto pelo modelo criado no PR-11.8.

Não consultar o perfil atual futuramente para “reconstruir” o desconto histórico.

---

# 43. Snapshot da DiscountPolicy

Preservar:

```text
policy identifier
policy snapshot/reference
applied discount data
```

usando exatamente o contrato já criado.

Não guardar somente:

```text
discountCents
```

se isso impedir explicar futuramente qual regra foi aplicada.

---

# 44. Snapshot da DepositPolicy

Mesma ideia:

```text
deposit mode
configured value
calculated amount
```

quando previstos pelo contrato.

---

# 45. Audit

Na mesma UnitOfWork:

```text
AuditWriter.append(...)
```

O evento deve representar:

```text
appointment.created
```

ou nomenclatura oficial equivalente.

Campos seguros:

```text
tenantId
actorId
appointmentId
action
requestId
correlationId
occurredAt
```

Pode incluir IDs de Service/Professional conforme allowlist.

---

# 46. Não incluir PII no Audit

Não gravar:

```text
customer name
phone
email
document
assessment payload
JWT
```

A proposta técnica exige auditoria append-only e payload sem fotos ou dados clínicos completos. 

---

# 47. Outbox

Na mesma UnitOfWork criar:

```text
AppointmentCreated
```

ou nomenclatura de evento vigente.

Status inicial:

```text
PENDING
```

Payload mínimo:

```text
tenantId
appointmentId
correlationId
```

Talvez:

```text
customerId
```

somente se um consumidor futuro realmente necessitar e a política de payload permitir.

---

# 48. Não criar consumer

Ainda não:

```text
Email
WhatsApp
notification
cron
queue
```

Outbox apenas persiste.

---

# 49. Falha de Audit

Se:

```text
Appointment reservation ✓
Appointment insert ✓
Audit X
```

resultado deve respeitar a semântica atômica fisicamente qualificada:

```text
operation fails
no partial committed Appointment
```

---

# 50. Falha de Outbox

Mesmo:

```text
Outbox X
→ operation fails
```

quando outbox faz parte do compromisso transacional definido.

---

# 51. Completar Idempotency apenas no sucesso lógico

Não marcar:

```text
COMPLETED
```

antes de:

```text
reservation
appointment
audit
outbox
```

estarem aceitos pela unidade.

---

# 52. Replay

Primeira chamada:

```http
Idempotency-Key: abc
```

cria:

```text
appointmentId = X
```

Segunda chamada:

```http
Idempotency-Key: abc
```

mesmo body:

```text
same logical response
appointmentId = X
```

Não criar Appointment Y.

---

# 53. Replay não chama Billing novamente se possível

Se a infrastructure atual permite recuperar resultado `COMPLETED` antes de refazer toda a operação:

```text
idempotency hit
        ↓
return stored result
```

Isso é preferível.

Reduz:

```text
Clinical RPC
Billing RPC
D1 reads
```

Mas use a semântica existente do `IdempotencyService`; não refatore agressivamente só para otimizar este PR.

---

# 54. Same key + different body

Exemplo:

Primeiro:

```text
startsAt=09:00
key=X
```

Depois:

```text
startsAt=10:00
key=X
```

Resultado:

```text
IDEMPOTENCY_KEY_CONFLICT
HTTP 409
```

Sem segundo Appointment.

---

# 55. Permission

Não inventar uma nova permissão se já existe uma permission canônica para criar Appointment.

O pipeline deve exigir a permission correspondente à Recepção/Admin conforme configuração existente.

A especificação funcional explicitamente permite que a recepção crie agendamentos. 

---

# 56. HTTP bridge

Adicionar:

```text
POST /tenants/:tenantId/appointments
```

ao mesmo bridge Cloudflare já qualificado.

Pipeline:

```text
route match
↓
request/correlation
↓
authentication
↓
tenant membership
↓
permission
↓
body parse
↓
contract validation
↓
Idempotency-Key
↓
CreateAppointment
```

---

# 57. Não colocar regra de negócio no bridge

O bridge pode:

```text
parse
authenticate
authorize
validate DTO
map errors
```

Não:

```text
calculate duration
calculate discount
choose status
calculate deposit
check overlap
```

Tudo isso continua no Application/Domain.

---

# 58. Controller Nest

Se o projeto mantém paridade com controllers Nest para Node/dev, criar com CLI somente se necessário:

```bash
nest g controller appointments \
  --project operations-worker
```

Mas não crie dois casos de uso.

Ambos:

```text
Nest Controller
Cloudflare HTTP bridge
```

devem chamar:

```text
CreateAppointment
```

único.

Se `appointments.controller.ts` já existir, apenas adicionar a operação.

---

# 59. DTO/contract compartilhado

Criar/adaptar em:

```text
libs/contracts
```

algo como:

```text
CreateAppointmentRequest
CreateAppointmentResponse
```

Sem Entity de Domain.

---

# 60. Response pública

Eu manteria enxuta.

Por exemplo:

```json
{
  "id": "...",
  "status": "AWAITING_DEPOSIT",
  "customerId": "...",
  "serviceId": "...",
  "professionalId": "...",
  "startsAt": "...",
  "endsAt": "...",
  "durationMinutes": 60,
  "basePriceCents": 20000,
  "discountCents": 2000,
  "finalPriceCents": 18000,
  "depositRequired": true,
  "depositCents": 3600,
  "origin": "RECEPTION"
}
```

Sem retornar internals de:

```text
D1
Audit
Outbox
DiscountPolicy complete configuration
```

---

# 61. HTTP status

Primeira criação:

```text
201 Created
```

Replay deve seguir o contrato de idempotência existente, preferencialmente preservando a resposta lógica estável.

Não invente comportamento diferente entre Node e Cloudflare.

---

# 62. Error mapping

Reutilizar códigos estáveis.

No mínimo:

```text
APPOINTMENT_TIME_CONFLICT

TENANT_NOT_OPERATIONAL
LICENSE_NOT_OPERATIONAL

CUSTOMER_INACTIVE
CUSTOMER_RESTRICTED

SERVICE_INACTIVE

PROFESSIONAL_INACTIVE
PROFESSIONAL_NOT_ENABLED

ASSESSMENT_REQUIRED / INVALID

PLAN_* conforme contratos existentes

COMMERCIAL_TERMS_BLOCKED

IDEMPOTENCY_KEY_CONFLICT
```

Não adicionar variações duplicadas de um erro já existente.

---

# 63. Erros de regra

Mapeamento típico:

```text
validation → 400

auth → 401

membership/permission → 403

resource unavailable/not found → 404

time/idempotency conflict → 409

business admission blocked
→ status já estabelecido pelo error model atual

unknown → 500 sanitized
```

Preservar o contrato que o bridge já utiliza.

---

# 64. Teste unitário: caminho simples

Cenário:

```text
Tenant ACTIVE
Customer ACTIVE
Service ACTIVE
Professional ACTIVE
enabled

License READY
Assessment not required
slot free

allowsDiscount=false
deposit=NOT_REQUIRED
```

Resultado:

```text
Appointment created

discount=0
deposit absent

status=AWAITING_CONFIRMATION
```

---

# 65. Teste com desconto + sinal

Usar o cenário qualificado:

```text
basePriceCents = 20000
discountCents = 2000
finalPriceCents = 18000

deposit = 20%
depositCents = 3600
```

Resultado Appointment:

```text
basePrice    20000
discount      2000
final        18000
deposit       3600

status = AWAITING_DEPOSIT
```

---

# 66. Provar congelamento

Depois de criar Appointment:

alterar:

```text
Service.price
DiscountPolicy
Customer.relationshipProfile
Deposit configuration
```

Consultar Appointment novamente.

Os valores históricos devem continuar iguais.

Isso é RN-GER-004/RN-DES-003 na prática. 

---

# 67. Teste de duração

Service:

```text
duration = 60 min
```

Request:

```text
startsAt=09:00
```

Appointment:

```text
endsAt=10:00
duration=60
```

Sem `endsAt` fornecido pelo caller.

---

# 68. Teste de origem inválida

```text
origin=FOO
```

Resultado:

```text
400
```

Sem D1 mutation.

---

# 69. Teste de customer inactive

Resultado:

```text
BLOCKED
appointments=0
audit=0
outbox=0
```

---

# 70. Customer restricted

Mesma prova.

---

# 71. License suspended

```text
License=SUSPENDED
```

Resultado:

```text
no Appointment
```

A licença suspensa não pode criar novos agendamentos. 

---

# 72. Assessment `NAO_APTO`

Com serviço que exige avaliação:

```text
NAO_APTO
→ no Appointment
```

A última prova do PR-11.9 garante que esse gate agora está fisicamente confiável.

---

# 73. CommercialTerms BLOCKED

Exemplo:

```text
discount requires approval
```

Resultado:

```text
Appointment not created
```

Não grave Appointment parcial aguardando resolução comercial.

---

# 74. Concurrency E2E

Agora repetir a prova através do **CreateAppointment real**.

Duas requests:

```text
different Idempotency-Key
same professional
same interval
```

simultâneas.

Esperado:

```text
1 × 201
1 × 409 APPOINTMENT_TIME_CONFLICT
```

Banco:

```text
appointments = 1
```

---

# 75. Esse teste é obrigatório

O teste do PR-11.7 provou a primitive.

PR-12 precisa provar:

```text
HTTP/Application
        ↓
primitive
```

sem regressão.

---

# 76. Idempotency E2E

Duas requests simultâneas ou sequenciais:

```text
same key
same payload
```

Esperado:

```text
1 Appointment
1 audit creation
1 outbox creation
same appointment ID
```

A documentação técnica exige que repetição devolva o mesmo recurso e não duplique efeitos.

---

# 77. Diferenciar dois testes concorrentes

### Concorrência de negócio

```text
different keys
same slot
→ conflict
```

### Repetição idempotente

```text
same key
same operation
→ replay
```

Não confundir os dois.

---

# 78. Cross-tenant E2E

Tenant A não pode criar Appointment usando:

```text
Customer B
Service B
Professional B
```

Testar cada referência individualmente.

RN-GER-002 exige isolamento de agendamentos, clientes, profissionais, serviços e demais registros operacionais. 

---

# 79. Audit E2E

Depois do sucesso:

```text
appointment row = 1
audit row = 1
```

Audit deve referenciar:

```text
appointment ID
tenant
actor
correlation
```

---

# 80. Outbox E2E

Depois do sucesso:

```text
outbox row = 1
status=PENDING
```

Ainda nenhum consumer.

---

# 81. Failure injection

No harness Workers, criar cenário controlado onde Audit ou Outbox falha.

Confirmar:

```text
Appointment row = 0
```

conforme a semântica de UnitOfWork fisicamente provada.

---

# 82. Idempotency failure/retry

Se primeira tentativa falha antes do commit, a segunda tentativa deve seguir o contrato atual de retry/failure.

Não inventar `COMPLETED` falso.

---

# 83. Teste de resposta estável

No replay:

```text
id
status
financial snapshots
interval
```

devem ser os mesmos.

Não recalcular CommercialTerms usando policy nova.

---

# 84. Isso é especialmente importante

Imagine:

```text
09:00 primeira request
Discount 10%
→ Appointment X
```

Policy muda.

Retry da mesma idempotency key:

```text
09:01
```

Não pode retornar desconto novo.

Replay devolve resultado original.

---

# 85. Observabilidade

Adicionar operação:

```text
CreateAppointment
```

com atributos seguros:

```text
tenantId
actorId
appointmentId
professionalId
serviceId
origin
status
result
duration
correlationId
```

---

# 86. Não logar snapshots completos

Evitar:

```text
DiscountPolicy JSON
Customer DTO
Assessment
```

em logs/traces.

---

# 87. Métricas

Se a foundation atual permitir:

```text
appointment.create.success
appointment.create.blocked
appointment.create.conflict
appointment.create.replay
```

com reason code de baixa cardinalidade.

Não criar labels com appointment ID.

---

# 88. Health continua intocado

Depois do PR:

```http
GET /health
```

ainda:

```text
D1            0
Clinical RPC  0
Billing RPC   0
Audit         0
Outbox        0
```

---

# 89. Free Tier

O PR deve documentar o custo lógico aproximado de CreateAppointment.

Fluxo típico:

```text
Operations invocation
+
Clinical RPC somente se assessment required
+
Billing RPC
+
bounded D1 reads
+
appointment/reliability writes
```

Não fazer:

```text
load all appointments
load all discounts
load all assessments
```

---

# 90. Query de conflito permanece indexada

Não substituir a primitive qualificada por:

```text
SELECT all
→ filter TypeScript
```

A consulta deve continuar tenant/professional/interval-aware.

---

# 91. Não adicionar KV

Ainda não.

Eligibility, license, restriction, policy e availability são decisões que podem gerar inconsistência perigosa se stale.

---

# 92. Não adicionar Queue

Outbox já cumpre a fronteira assíncrona.

Consumer será outro PR.

---

# 93. Nenhuma landing page neste PR

Mesmo que `origin=LANDING_PAGE` exista, este PR implementa o **caso de uso autoritativo**, não o formulário público/anti-abuse da landing.

Uma landing futuramente chama o mesmo Application UseCase por outro adapter.

---

# 94. Não implementar confirmação do sinal

Se Appointment nasce:

```text
AWAITING_DEPOSIT
```

ele permanece nesse estado.

Próximo fluxo futuro:

```text
ConfirmDeposit
```

tratará mudança de Deposit/Appointment.

RN-AGE estabelece a independência entre status de sinal e presença. 

---

# 95. Não implementar confirmação de presença

Também fica para outro PR.

---

# 96. Não implementar check-in

Mesmo raciocínio.

---

# 97. Migration

Regra final:

```text
se schema atual comporta o snapshot:
  no migration

se faltam campos normativos:
  0006_...
```

Qualquer migration deve:

```text
apply 0001 → 0006 em DB vazio
PASS
```

e:

```text
second apply
→ no migrations to apply
```

---

# 98. Testes de migration

Se criar `0006`, adicionar ao harness Workers automaticamente através do mecanismo existente `applyD1Migrations`.

Não manter lista manual desatualizada se helper já varre diretório.

---

# 99. Architecture test

Adicionar regras:

```text
CreateAppointment
  X
D1Database
```

```text
CreateAppointment
  X
Cloudflare bindings
```

```text
Appointment Domain
  X
Billing implementation
```

Permitido:

```text
CreateAppointment
→ CommercialTermsPort
```

e:

```text
CreateAppointment
→ UnitOfWork
```

---

# 100. Teste HTTP Worker real

`test:workers` deve agora conter um vertical E2E:

```text
fetch
→ security bridge
→ CreateAppointment
→ Clinical RPC
→ Billing RPC
→ D1
→ reliability
→ 201
```

Esse é o teste culminante de todo o ciclo PR-05–PR-12.

---

# 101. Cenário E2E mínimo

Eu começaria com:

```text
Assessment not required
No discount
No deposit
```

para diminuir variáveis.

Resultado:

```text
201
AWAITING_CONFIRMATION
```

---

# 102. Segundo E2E

Depois:

```text
Assessment APTO required
Configured discount
Percentage deposit
```

Resultado:

```text
201
AWAITING_DEPOSIT

20000
- 2000
= 18000

deposit = 3600
```

---

# 103. Terceiro E2E negativo

```text
Assessment NAO_APTO
```

Resultado:

```text
not created
```

---

# 104. Quarto E2E negativo

```text
same professional
same time
different appointment
```

Resultado:

```text
409
```

---

# 105. Quinto E2E

Same Idempotency-Key replay.

Resultado:

```text
same resource
```

---

# 106. Gate agregado pós-PR

Criar:

```bash
npm run gate:create-appointment-flow
```

ou evoluir:

```bash
npm run gate:create-appointment
```

de readiness para implementação final.

Eu preferiria preservar:

```text
gate:create-appointment
```

como gate preparatório e criar:

```text
gate:pr12
```

para o fluxo implementado.

---

# 107. `gate:pr12`

Deve executar:

```text
lint
typecheck
unit tests
workers tests
physical safety
create appointment readiness
create appointment E2E
workers dry-runs
```

Sem comandos interativos.

---

# 108. Definition of Done — HTTP

```text
[ ] POST /tenants/:tenantId/appointments existe

[ ] Cloudflare bridge expõe a rota

[ ] auth obrigatória

[ ] tenant membership obrigatória

[ ] permission obrigatória

[ ] validation obrigatória

[ ] Idempotency-Key obrigatório

[ ] x-request-id presente

[ ] x-correlation-id presente
```

---

# 109. Definition of Done — input authority

```text
[ ] client não define duration

[ ] client não define endsAt autoritativamente

[ ] client não define base price

[ ] client não define discount

[ ] client não define final price

[ ] client não define deposit

[ ] client não define status

[ ] origin validada
```

---

# 110. Definition of Done — admission

```text
[ ] Tenant validado

[ ] License validada

[ ] Plan validado

[ ] Customer validado

[ ] Customer restriction validada

[ ] Service validado

[ ] Professional validado

[ ] Professional-Service validado

[ ] Assessment validado quando required

[ ] Availability verificada

[ ] authoritative conflict reservation executada
```

---

# 111. Definition of Done — CommercialTerms

```text
[ ] Billing RPC real

[ ] READY obrigatório

[ ] base price congelado

[ ] profile snapshot congelado

[ ] discount congelado

[ ] discount policy identificável

[ ] final price congelado

[ ] deposit decision congelada

[ ] deposit calculado após desconto

[ ] BLOCKED nunca vira fallback
```

---

# 112. Definition of Done — Appointment

```text
[ ] ID server-generated

[ ] tenant-owned

[ ] interval derived from Service duration

[ ] monetary values integers

[ ] origin canonical

[ ] initial status correct

[ ] AWAITING_DEPOSIT quando sinal requerido

[ ] AWAITING_CONFIRMATION quando sinal não requerido
```

---

# 113. Definition of Done — atomicity

```text
[ ] UnitOfWork real utilizado

[ ] ScheduleReservation participa da unidade prevista

[ ] Appointment persistence participa

[ ] Audit participa

[ ] Outbox participa

[ ] Idempotency completion participa

[ ] partial success impossível conforme prova D1
```

---

# 114. Definition of Done — idempotência

```text
[ ] first request creates one Appointment

[ ] replay same key/hash returns same Appointment

[ ] business row count remains 1

[ ] audit creation count remains 1

[ ] outbox creation count remains 1

[ ] same key/different hash → conflict

[ ] tenant A/key X independente de tenant B/key X
```

---

# 115. Definition of Done — concorrência

```text
[ ] same slot / different keys tested concurrently

[ ] exactly one success

[ ] exactly one conflict

[ ] appointment count = 1

[ ] adjacent interval continues allowed

[ ] cross-tenant independent
```

---

# 116. Definition of Done — failure

```text
[ ] Billing BLOCKED → no writes

[ ] Clinical BLOCKED → no writes

[ ] License blocked → no writes

[ ] Customer restricted → no writes

[ ] Time conflict → no duplicate Appointment

[ ] Audit failure → no partial success

[ ] Outbox failure → no partial success
```

---

# 117. Definition of Done — security

```text
[ ] no token → 401

[ ] invalid token → 401

[ ] invalid tenant membership → 403

[ ] missing permission → 403

[ ] cross-tenant customer blocked

[ ] cross-tenant professional blocked

[ ] cross-tenant service blocked

[ ] no PII in Audit/Outbox/logs
```

---

# 118. Definition of Done — quality

```text
[ ] npm run lint PASS

[ ] tsc --build --force PASS

[ ] npm run test PASS

[ ] npm run test:workers PASS

[ ] gate:physical-safety PASS

[ ] gate:create-appointment PASS

[ ] gate:pr12 PASS

[ ] Operations dry-run PASS

[ ] Clinical dry-run PASS

[ ] Billing dry-run PASS

[ ] git diff --check PASS
```

---

# 119. O que explicitamente NÃO entra no PR-12

Mesmo sendo um PR grande, não deixe o escopo crescer para:

```text
ConfirmDeposit

ExpireDeposit

ConfirmPresence

CheckIn

RescheduleAppointment

CancelAppointment

NoShow

StartSession

Payment

Refund

Package

Queue consumer

Outbox consumer

Notifications

WhatsApp

R2
KV
```

PR-12 termina em:

```text
Appointment CREATED
```

---

# 120. Relatório pós-implementação obrigatório

O Codex deve fechar com algo semelhante:

```text
PR-12 — CreateAppointment Authoritative Flow

Baseline
physical safety:
readiness:

HTTP
route:
auth:
tenant:
permission:
validation:
idempotency header:

CreateAppointment
command:
application service:
domain:

Eligibility
tenant:
license:
plan:
customer:
restriction:
service:
professional:
professional-service:
assessment:
availability:
conflict:

CommercialTerms
Billing RPC:
base:
profile:
discount:
final:
deposit:
snapshot:

Persistence
appointment:
reservation:
migration:

Reliability
UnitOfWork:
audit:
outbox:
idempotency:

Status
with deposit:
without deposit:

E2E
simple creation:
assessment required:
commercial terms:
replay:
hash conflict:
time conflict:
cross-tenant:
failure rollback:

Physical
appointment rows:
audit rows:
outbox rows:
double bookings:

Quality
lint:
typecheck:
unit:
workers:
physical safety:
readiness:
PR12 gate:
dry-runs:

Remaining blockers:

Next PR:
```

---

# Depois do PR-12

Se o PR-12 terminar com todos os gates verdes, eu não partiria imediatamente para Payment.

O próximo fluxo natural é:

> **PR-13 — Deposit Lifecycle + Appointment Deposit Transitions**

Porque alguns Appointments recém-criados terão:

```text
AWAITING_DEPOSIT
```

e o sistema precisará materializar:

```text
Deposit
        ↓
pending
        ↓
confirmed / rejected / expired
```

e coordenar:

```text
Appointment
AWAITING_DEPOSIT
        ↓
deposit confirmed
        ↓
AWAITING_CONFIRMATION
```

A especificação já determina que o status do sinal seja independente da presença e que o fluxo de Appointment inclua `Aguardando sinal → Aguardando confirmação`. 

Portanto, **o ciclo PR-11.x está encerrado**. O próximo PR correto é definitivamente o **PR-12 — CreateAppointment Authoritative Flow**. Ele deve ser tratado como a composição das fundações já provadas, e não como um novo exercício de arquitetura. Se surgir necessidade de recriar idempotência, eligibility, CommercialTerms, concurrency ou runtime dentro desse PR, isso deve ser considerado um sinal de regressão arquitetural, porque essas capacidades já estão qualificadas.
