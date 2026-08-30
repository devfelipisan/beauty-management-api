Com o **PR-18 concluído e `gate:pr18 = PASS`**, o próximo PR deve ser:

# PR-19 — Intercurrence Foundation + Clinical Restrictions Propagation

O motivo é direto: agora a sessão já possui contexto técnico suficiente para registrar uma intercorrência com rastreabilidade real.

O estado atual é aproximadamente:

```text
Session IN_PROGRESS
    │
    ├── Technical Form Snapshot
    ├── Technical Values
    ├── Power History
    ├── Equipment Usage
    ├── Previous Session Context
    └── Variation Alerts
```

O próximo passo deve acrescentar:

```text
Session IN_PROGRESS
    │
    └── Intercurrence
            ├── classification
            ├── severity
            ├── description
            ├── conduct
            ├── technical context
            ├── professional
            ├── follow-up requirement
            └── customer clinical restriction
                         ↓
               future Appointment admission
```

Esse PR deve ser concluído **antes de Photos/R2 e antes de `CompleteSession`**, porque uma intercorrência pode criar uma restrição clínica que precisa impactar imediatamente novos agendamentos.

---

# 1. Escopo exato do PR-19

Entram:

```text
Intercurrence aggregate

classification/type
severity
description
conduct
occurredAt
professional
session linkage

optional references:
equipment usage
power record
technical parameters

follow-up requirement
reassessment requirement

clinical restriction resulting from intercurrence

tenant isolation
professional authorization

idempotency
audit
outbox where cross-worker propagation is required

Clinical → Operations restriction propagation

AppointmentEligibility integration

physical Worker tests

gate:pr19
```

Continuam fora:

```text
Photos
R2

CompleteSession

Payment
Refund

Inventory/materials

full medical record

notification/WhatsApp

advanced intercurrence workflow

automatic diagnostic decisions
```

---

# 2. Corrigir primeiro os arquivos gerados pelo ambiente

O relatório registra alterações automáticas em:

```text
yarn.lock
.yarn/install-state.gz
```

Antes de abrir o PR:

```bash
git status
git diff -- yarn.lock
git diff -- .yarn/install-state.gz
```

O projeto já consolidou:

```text
package-lock.json
```

como lock principal.

Portanto, se esses arquivos não fazem parte da estratégia oficial do repositório, restaurar/remover as alterações acidentais antes de iniciar o PR:

```bash
git restore yarn.lock
git restore .yarn/install-state.gz
```

quando rastreados.

Se `.yarn/install-state.gz` não deve fazer parte do Git, ajustar `.gitignore` separadamente conforme política atual.

Não misturar ruído do package manager com o PR-19.

---

# 3. Congelar a baseline

Executar:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr16
npm run gate:pr17
npm run gate:pr18
```

Depois:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers
npm run workers:dry-run
```

Tudo precisa continuar:

```text
PASS
```

---

# 4. Criar o documento do PR

Criar:

```text
docs/plans/PR-19-intercurrence-clinical-restrictions.md
```

Com:

```text
Objective
Scope
Intercurrence ownership
Canonical classification
Severity
Session linkage
Technical context
Professional authorization
Follow-up/reassessment
Clinical restriction model
Cross-worker propagation
AppointmentEligibility impact
Idempotency
Audit
Outbox
Eventual consistency
Tenant isolation
Observability
Tests
Definition of Done
Out of scope
```

---

# 5. Ownership

Intercurrence deve pertencer ao:

```text
clinical-worker
```

Porque ela nasce durante a execução clínica/técnica.

Portanto:

```text
Clinical
├── Session
├── Technical Form
├── Equipment Usage
├── Variation Alert
└── Intercurrence
```

Operations continua proprietário de:

```text
Appointment
Customer operational profile
AppointmentEligibility
```

---

# 6. Não colocar `Intercurrence` em Operations

Proibido criar:

```text
apps/operations-worker/src/intercurrences
```

como domínio autoritativo.

Operations só precisa receber a consequência operacional:

```text
customer restricted for new appointments
```

quando aplicável.

---

# 7. Inspecionar contratos já existentes

Antes de gerar código:

```bash
grep -R "Intercurr" apps libs docs -n || true
grep -R "Restriction" apps/clinical-worker apps/operations-worker libs -n
```

Especialmente porque já existe:

```text
CustomerRestrictionPort
```

no AppointmentEligibility.

PR-19 deve substituir/expandir a fonte real de restrição, não criar uma segunda lógica incompatível.

---

# 8. Criar módulo Intercurrences

```bash
nest g module intercurrences \
  --project clinical-worker
```

Estrutura:

```text
apps/clinical-worker/src/intercurrences/
├── domain/
├── application/
├── ports/
└── adapters/
```

---

# 9. Criar agregado `Intercurrence`

```bash
nest g class \
  intercurrences/domain/intercurrence \
  --project clinical-worker \
  --no-spec
```

Campos mínimos:

```text
id
tenantId

sessionId
customerId
serviceId
professionalId

type
severity

description
conduct

occurredAt
reportedAt
reportedBy

requiresFollowUp
requiresReassessment

status

createdAt
updatedAt
```

---

# 10. Não duplicar dados técnicos inteiros

Intercurrence pode referenciar:

```text
equipmentUsageId?
powerRecordId?
```

quando pertinente.

Não copiar:

```text
all technical values
all session form JSON
```

para dentro do aggregate.

A Session já é a fonte histórica.

---

# 11. Tipo da intercorrência

Se a documentação atual não congela um catálogo completo, não inventar uma enum médica enorme.

Pode-se usar uma classificação pequena e genérica, por exemplo somente se normativamente sustentada:

```text
TECHNICAL
CLINICAL
ADVERSE_REACTION
OTHER
```

Mas se nem isso estiver consolidado, prefira:

```text
typeCode
```

configurável/validado.

Não codificar dezenas de diagnósticos.

---

# 12. Severity

Precisa ser explícita porque influencia acompanhamento.

Use somente valores canônicos existentes.

Se ainda não houver definição normativa, um conjunto técnico pequeno pode ser documentado, como:

```text
LOW
MODERATE
HIGH
CRITICAL
```

mas isso deve estar descrito como decisão do PR, não inferência silenciosa.

Se não houver base suficiente, mantenha severity como contrato configurável.

---

# 13. Status da Intercurrence

Não é necessário criar workflow gigante.

Um lifecycle suficiente pode ser:

```text
OPEN
RESOLVED
```

se houver regra para acompanhamento.

Ou apenas:

```text
ACTIVE
RESOLVED
```

O ponto importante é distinguir intercorrência ainda relevante de histórico resolvido.

---

# 14. Não apagar intercorrências

Intercurrence é histórico técnico.

Logo:

```text
DELETE
```

não deve ser operação normal.

Correções devem ocorrer por:

```text
append/update auditável
resolve
```

conforme regras futuras.

---

# 15. Criar migration `0013`

Provavelmente:

```text
database/d1/migrations/
0013_intercurrence_clinical_restrictions.sql
```

Depois de confirmar que `0012` é realmente a migration mais recente.

---

# 16. Tabela `intercurrences`

Conceitualmente:

```text
id
tenant_id

session_id
customer_id
service_id
professional_id

type_code
severity

description
conduct

equipment_usage_id
power_record_id

requires_follow_up
requires_reassessment

status

occurred_at
reported_at
reported_by

resolved_at
resolved_by

created_at
updated_at
```

Somente os campos realmente necessários.

---

# 17. Índices

Baseados em queries reais:

```text
tenant_id + session_id

tenant_id + customer_id + status

tenant_id + professional_id + occurred_at
```

Não criar índices em todo campo textual.

---

# 18. Criar `IntercurrenceRepository`

```bash
nest g interface \
  intercurrences/ports/intercurrence-repository \
  --project clinical-worker
```

Métodos:

```text
findById
listBySession
findActiveByCustomer
create
resolve
```

Tenant-aware.

---

# 19. D1 adapter

```bash
nest g provider \
  intercurrences/adapters/d1-intercurrence-repository \
  --project clinical-worker
```

O Domain não conhece D1.

---

# 20. Criar `ReportIntercurrence`

```bash
nest g service \
  intercurrences/application/report-intercurrence \
  --project clinical-worker
```

Fluxo:

```text
Authentication
↓
Tenant
↓
Professional authorization
↓
load Session
↓
Session must permit clinical recording
↓
validate Intercurrence
↓
UnitOfWork
    ├── Intercurrence
    ├── Audit
    ├── optional Outbox
    └── Idempotency
↓
response
```

---

# 21. Session deve estar tecnicamente aberta

Normalmente:

```text
Session = IN_PROGRESS
```

para registrar intercorrência ocorrida durante o atendimento.

Não permitir nova intercorrência em Session inexistente.

---

# 22. Não bloquear registro porque a sessão possui alerta técnico

Variation alert e Intercurrence são conceitos diferentes.

Um alerta:

```text
variation threshold exceeded
```

não significa automaticamente:

```text
Intercurrence
```

O profissional precisa registrar o fato real separadamente.

---

# 23. Professional ownership

O profissional autorizado precisa ser:

```text
Session.professionalId
```

ou possuir permissão explícita para atuar na sessão de outro profissional.

Não permitir edição apenas por conhecer `sessionId`.

---

# 24. `reportedBy` é confiável

Nunca aceitar:

```json
{
  "reportedBy": "..."
}
```

como autoridade do body.

Vem do ExecutionContext.

---

# 25. `occurredAt`

Pode haver necessidade de informar que a intercorrência ocorreu alguns minutos antes do registro.

Portanto talvez seja aceitável receber:

```text
occurredAt
```

do caller profissional, mas validar:

```text
not future
within Session temporal context
```

`reportedAt` deve ser server-side.

---

# 26. Não exigir Photo neste PR

Mesmo que uma intercorrência possa futuramente possuir fotos:

```text
photoIds
```

não devem existir até o PR de R2.

No máximo, domínio deve permitir:

```text
attachments = future capability
```

sem implementação.

---

# 27. Criar endpoint

Sugestão:

```http
POST /tenants/:tenantId/sessions/:sessionId/intercurrences
```

Body aproximadamente:

```json
{
  "type": "...",
  "severity": "...",
  "description": "...",
  "conduct": "...",
  "occurredAt": "...",
  "requiresFollowUp": true,
  "requiresReassessment": true,
  "equipmentUsageId": "...",
  "powerRecordId": "..."
}
```

Somente campos autorizados.

---

# 28. Idempotency-Key obrigatório

Reportar intercorrência é mutação clínica crítica.

Portanto:

```http
Idempotency-Key: ...
```

obrigatório.

---

# 29. Operation identity

Algo estável:

```text
REPORT_INTERCURRENCE
```

Hash:

```text
tenant
session
type
severity
description/normalized command
occurredAt
```

Não incluir:

```text
requestId
correlationId
reportedAt
```

---

# 30. Replay

Mesma key/hash:

```text
same Intercurrence
```

Nenhuma duplicação de:

```text
row
Audit
Outbox
```

---

# 31. Different hash

Mesmo key com outra descrição/severity:

```text
IDEMPOTENCY_KEY_CONFLICT
```

---

# 32. Audit

Evento obrigatório:

```text
IntercurrenceReported
```

Metadata:

```text
tenantId
sessionId
intercurrenceId
professionalId
severity
requiresFollowUp
requiresReassessment
correlationId
```

Evite persistir no Audit:

```text
description completa
conduta completa
dados clínicos detalhados
```

---

# 33. Clinical restriction é uma consequência separada

Não faça:

```text
every intercurrence
→ customer blocked
```

Isso seria incorreto.

Precisa haver policy.

---

# 34. Criar `ClinicalRestrictionPolicy`

Policy pura:

```text
Intercurrence
↓
restriction outcome
```

Resultado explícito:

```text
NO_RESTRICTION

RESTRICT_NEW_APPOINTMENTS

REQUIRE_REASSESSMENT
```

ou estrutura equivalente.

---

# 35. Não derivar restrição somente da severity se regra não existir

Exemplo proibido:

```text
HIGH
→ always blocked
```

se isso não estiver documentado.

Melhor usar flags explícitas do comando/policy:

```text
requiresReassessment
requiresFollowUp
restrictionRequested
```

ou configuração normativa futura.

---

# 36. Separar restrição e acompanhamento

São conceitos diferentes:

```text
requiresFollowUp
```

não necessariamente bloqueia agendamento.

```text
requiresReassessment
```

pode bloquear determinados serviços.

```text
blockedForNewAppointments
```

é restrição operacional forte.

Não fundir tudo em um boolean.

---

# 37. Criar domínio `ClinicalRestriction`

No Clinical Worker, se necessário:

```bash
nest g class \
  restrictions/domain/clinical-restriction \
  --project clinical-worker \
  --no-spec
```

Campos conceituais:

```text
id
tenantId
customerId

sourceType = INTERCURRENCE
sourceId

scope

status

requiresReassessment
blocksNewAppointments

effectiveFrom
resolvedAt

createdAt
```

---

# 38. Scope da restrição

Pode ser:

```text
CUSTOMER_GLOBAL
SERVICE_SPECIFIC
```

somente se documentado.

Se não houver escopo fino ainda, começar com comportamento mais simples e explicitamente documentado.

Não criar mecanismo supergenérico antecipadamente.

---

# 39. Uma restrição precisa ter origem

Obrigatório preservar:

```text
sourceIntercurrenceId
```

para explicabilidade.

Não apenas:

```text
customer.blocked = true
```

sem motivo rastreável.

---

# 40. Customer `blockedForNewAppointments` existente

O PR-11 introduziu:

```text
Customer.blockedForNewAppointments
```

no Operations.

Agora precisamos decidir se continua autoridade ou se vira projeção.

Eu recomendo:

```text
ClinicalRestriction
    = clinical authority

Customer.blockedForNewAppointments
    = Operations projection / fast admission flag
```

Isso encaixa perfeitamente no modelo de consistência eventual dos PR-13/14.

---

# 41. Não escrever Customer diretamente pelo Clinical

Clinical não deve:

```sql
UPDATE customers SET blocked_for_new_appointments=1
```

mesmo se D1 for compartilhado.

Usar evento.

---

# 42. Evento `ClinicalRestrictionActivated`

Clinical:

```text
Intercurrence commit
+
ClinicalRestriction
+
Audit
+
Outbox ClinicalRestrictionActivated
```

na mesma consistência local quando a policy determinar restrição.

---

# 43. Payload mínimo

```text
eventId
tenantId
customerId
restrictionId
sourceIntercurrenceId

blocksNewAppointments
requiresReassessment

serviceId? se escopo específico

correlationId
```

Sem descrição clínica completa.

---

# 44. PR-14 dispatcher deve ganhar uma route

```text
ClinicalRestrictionActivated
→ Operations
```

Reutilizar:

```text
DispatchOutboxBatch
```

Não criar novo dispatcher.

---

# 45. Operations consumer

Criar algo como:

```bash
nest g service \
  customers/application/apply-clinical-restriction \
  --project operations-worker
```

Responsabilidade:

```text
tenant-aware Customer
↓
eventId idempotency
↓
update restriction projection
↓
Audit
```

---

# 46. Não simplesmente usar um boolean se precisa de múltiplas restrições

Esse é um ponto importante.

Se Customer pode ter:

```text
Intercurrence A → restriction
Intercurrence B → restriction
```

resolver A não deve desbloquear o Customer se B ainda está ativa.

Portanto o Operations provavelmente precisa de projeção normalizada:

```text
customer_restrictions
```

em vez de apenas editar boolean.

---

# 47. Migration pode criar projeção Operations

`0013` pode incluir:

```text
customer_clinical_restrictions
```

ou nome equivalente.

Campos:

```text
id / restriction_id
tenant_id
customer_id

source_type
source_id

blocks_new_appointments
requires_reassessment

status

activated_at
resolved_at
```

---

# 48. Então `blockedForNewAppointments` pode ser derivado

O existing Customer field pode continuar por compatibilidade, mas a fonte correta para eligibility deve evoluir para:

```text
exists active blocking restriction
```

ou projection consolidada.

Evitar dois estados divergentes.

---

# 49. Evoluir `CustomerRestrictionPort`

Hoje ele provavelmente consulta:

```text
Customer.blockedForNewAppointments
```

PR-19 deve usar um adapter real sobre a nova projeção.

Por exemplo:

```text
D1CustomerClinicalRestrictionAdapter
```

---

# 50. AppointmentEligibility não muda de contrato

Ele continua perguntando:

```text
CustomerRestrictionPort
```

sem saber de Intercurrence.

Isso preserva hexagonal architecture.

---

# 51. Resultado

Depois da propagação:

```text
Clinical Intercurrence
        ↓
ClinicalRestrictionActivated
        ↓
Outbox
        ↓
Operations
        ↓
customer restriction projection
        ↓
AppointmentEligibility
        ↓
CUSTOMER_RESTRICTED
```

Esse é o principal vertical E2E do PR.

---

# 52. Eventual consistency é aceitável

Se Operations estiver temporariamente indisponível:

```text
Clinical Intercurrence ACTIVE
ClinicalRestriction ACTIVE
Outbox PENDING

Operations projection ainda antiga
```

Isso é uma janela de consistência eventual.

PR-14 deve convergir depois.

---

# 53. Mas cuidado com segurança fail-closed

Essa janela é mais crítica que Deposit, porque envolve restrição clínica.

Precisamos reduzir risco de novo Appointment enquanto projeção ainda não chegou.

---

# 54. Estratégia recomendada

Quando `CheckAppointmentEligibility` tiver um serviço que exige avaliação/clínica, pode consultar Clinical também para verificar restrições ativas, ou podemos garantir propagation síncrona best-effort.

Mais seguro:

```text
Operations CustomerRestrictionPort
        ↓
Clinical restriction RPC
```

como authority final quando possível.

Mas isso adiciona RPC a todo agendamento.

---

# 55. Free-tier versus segurança

Minha recomendação:

```text
Operations projection
+
Clinical authority fallback/revalidation only
when clinical restriction capability is required
```

Porém isso pode ser complexo para PR-19.

Alternativa MVP:

```text
ReportIntercurrence
→ local commit
→ immediate best-effort Service Binding Operations
→ Outbox recovery
```

A janela tende a ser mínima.

Documentar explicitamente.

---

# 56. Não alterar o fato Clinical caso propagação falhe

Mesmo modelo do Deposit/Session:

```text
ClinicalRestriction active
Operations unavailable
```

não pode desfazer a intercorrência.

---

# 57. Criar `ClinicalRestrictionResolved`

Se PR-19 implementar resolução da Intercurrence/restrição, também precisa propagar desbloqueio.

Mas não é obrigatório implementar todo lifecycle agora.

---

# 58. Devemos implementar resolução?

Eu recomendaria **sim, uma resolução mínima**.

Sem isso, qualquer restrição criada ficaria eterna.

Criar:

```bash
nest g service \
  intercurrences/application/resolve-intercurrence \
  --project clinical-worker
```

---

# 59. `ResolveIntercurrence`

Fluxo:

```text
load active Intercurrence
↓
professional/admin authorized
↓
resolution note/conduta
↓
mark RESOLVED
↓
resolve associated ClinicalRestriction when appropriate
↓
Audit
↓
Outbox ClinicalRestrictionResolved
```

---

# 60. Não permitir resolve por qualquer profissional

Precisa:

```text
same professional
```

ou permissão explícita como:

```text
intercurrence.resolve
```

conforme RBAC.

---

# 61. Endpoint

```http
POST /tenants/:tenantId/intercurrences/:intercurrenceId/resolve
```

ou sob Session:

```http
POST /tenants/:tenantId/sessions/:sessionId/intercurrences/:id/resolve
```

Prefiro a segunda se isso reforçar ownership.

---

# 62. Idempotência da resolução

Replay:

```text
RESOLVED
→ same logical result
```

sem novos efeitos.

---

# 63. `ClinicalRestrictionResolved`

Operations recebe e marca apenas aquela restriction:

```text
ACTIVE → RESOLVED
```

Depois calcula:

```text
does customer still have another active blocking restriction?
```

Somente se nenhuma:

```text
customer admission unrestricted
```

---

# 64. Nunca resolver tudo pelo customerId

Proibido:

```sql
UPDATE restrictions
SET status='RESOLVED'
WHERE customer_id=?
```

Um evento resolve somente:

```text
restrictionId
```

específica.

---

# 65. `requiresReassessment`

Essa flag pode integrar o Clinical Assessment flow.

Se uma restriction exige reavaliação:

```text
AppointmentEligibility
```

deve continuar bloqueando até avaliação adequada/restrição resolvida conforme policy.

Não inventar liberação automática por APTO no mesmo PR a menos que contrato determine.

---

# 66. Não modificar Assessment automaticamente

Reportar intercorrência não deve criar:

```text
Assessment NAO_APTO
```

automaticamente.

São agregados diferentes.

---

# 67. Alert no Customer

A documentação prevê alerta de intercorrência ativa no cadastro.

Isso pode ser representado pela projeção Operations:

```text
hasActiveClinicalRestriction = true
```

ou endpoint de restrições.

Não precisa criar UI neste PR.

---

# 68. Query de restrições precisa ser bounded

Eligibility:

```sql
WHERE tenant_id = ?
  AND customer_id = ?
  AND status = 'ACTIVE'
  AND blocks_new_appointments = 1
LIMIT 1
```

Não carregar histórico inteiro.

---

# 69. Histórico Clinical

Criar consulta:

```http
GET /tenants/:tenantId/sessions/:sessionId/intercurrences
```

ou via RPC/application.

Somente authorized technical history.

---

# 70. Não retornar PII além do necessário

Resposta da Intercurrence pode conter:

```text
description
conduct
severity
status
timestamps
professional
```

porque é dado clínico autorizado.

Mas nunca em logs.

---

# 71. Observabilidade

Report:

```text
operation=ReportIntercurrence
tenantId
sessionId
intercurrenceId
severity
result
correlationId
```

Restriction:

```text
operation=PropagateClinicalRestriction
tenantId
restrictionId
result
```

Sem:

```text
description
conduct
technical values
```

---

# 72. Severity em métrica

Se o catálogo for pequeno e estável:

```text
severity
```

pode ser low-cardinality.

Não usar description como label.

---

# 73. Audit versus log

Audit pode registrar:

```text
intercurrence.reported
intercurrence.resolved
clinical.restriction.activated
clinical.restriction.resolved
```

sem payload clínico integral.

---

# 74. Outbox

Eventos cross-worker necessários:

```text
ClinicalRestrictionActivated
ClinicalRestrictionResolved
```

Talvez `IntercurrenceReported` não precise sair do Clinical.

Não criar evento externo se ninguém consome.

---

# 75. Não usar Queue

Reutilizar D1 Outbox + dispatcher do PR-14.

---

# 76. Não usar R2

Fotos de intercorrência ficam no próximo PR.

---

# 77. Não implementar notificações

Nenhum WhatsApp/email automático ainda.

---

# 78. Não implementar hard-block de Session atual

Uma intercorrência pode ocorrer durante a sessão.

Não transformar automaticamente:

```text
Session IN_PROGRESS
→ CANCELED
```

sem regra.

A Session continua ativa até ação explícita/futura completion policy.

---

# 79. Pode haver Intercurrence e Session continuar

Isso é esperado:

```text
Session IN_PROGRESS
Intercurrence OPEN
```

Não é estado inconsistente.

---

# 80. CompleteSession futuro poderá considerar Intercurrence

Quando PR de conclusão chegar, pode avaliar:

```text
open intercurrence
requires follow-up
requires reassessment
```

mas PR-19 apenas expõe os fatos.

---

# 81. Criar `EvaluateSessionIntercurrenceState`

Uma policy consultiva útil:

```text
NONE
OPEN
RESOLVED
```

ou detalhes:

```text
hasOpenIntercurrence
requiresFollowUp
requiresReassessment
```

Sem concluir Session.

---

# 82. Teste principal — report

Fixture:

```text
Session IN_PROGRESS
Professional authorized
```

Reportar Intercurrence.

Esperado:

```text
Intercurrence row = 1
Audit = 1
Idempotency COMPLETED
```

---

# 83. Teste com restrição

Intercurrence configurada/policy gera:

```text
ClinicalRestriction ACTIVE
```

Outbox:

```text
ClinicalRestrictionActivated PENDING
```

---

# 84. Propagação física

Dispatcher:

```text
Clinical
↓
Operations Service Binding
↓
ApplyClinicalRestriction
```

Resultado:

```text
Operations projection ACTIVE
```

---

# 85. AppointmentEligibility E2E

Depois:

```text
POST CreateAppointment
```

para Customer restrito.

Resultado:

```text
BLOCKED
CUSTOMER_RESTRICTED
```

Sem Appointment criado.

Esse é o teste mais importante do PR-19.

---

# 86. Resolver restrição

```text
ResolveIntercurrence
↓
ClinicalRestriction RESOLVED
↓
Outbox ClinicalRestrictionResolved
↓
Operations projection RESOLVED
```

---

# 87. AppointmentEligibility após resolução

Se não houver outra restrição ativa:

```text
CUSTOMER_RESTRICTED = false
```

e demais gates válidos:

```text
AppointmentEligibility READY
```

---

# 88. Duas restrições simultâneas

Teste crítico:

```text
Restriction A ACTIVE
Restriction B ACTIVE
```

Resolve A.

Resultado:

```text
Customer remains restricted
```

Resolve B.

Agora:

```text
Customer unrestricted
```

Isso prova que não usamos boolean incorretamente.

---

# 89. Replay de evento

`ClinicalRestrictionActivated` entregue duas vezes.

Operations:

```text
one projection
one logical effect
```

Usar:

```text
eventId
```

na idempotência.

---

# 90. ACK loss

Como PR-14:

```text
Operations applies restriction
↓
Clinical mark SENT fails
↓
redelivery
↓
Operations REPLAY
↓
event SENT
```

Sem duplication.

---

# 91. Cross-tenant

Tenant A não pode:

```text
report Intercurrence Session B
resolve Intercurrence B
read Intercurrence B
apply Restriction B
```

---

# 92. Cross-session

Intercurrence precisa pertencer à Session informada.

Equipment/power reference também deve pertencer à mesma Session.

---

# 93. Referência de Equipment inválida

Se:

```text
equipmentUsageId
```

é da Session B:

```text
BLOCKED
```

Não confiar só na existência global.

---

# 94. Referência de Power inválida

Mesma regra.

---

# 95. Session não `IN_PROGRESS`

Report em Session incompatível:

```text
BLOCKED
INTERCURRENCE_REPORT_NOT_ALLOWED
```

salvo regra futura de registro tardio.

---

# 96. Registro tardio

Não inventar agora.

Se produto quiser registrar intercorrência após sessão concluída, será outro fluxo auditável.

---

# 97. Concorrência duplicate report

Mesmo Idempotency-Key:

```text
one row
```

---

# 98. Chaves diferentes com mesma descrição

São duas intenções distintas; não tente deduplicar heuristicamente.

Idempotência é por command identity.

---

# 99. Concorrência resolve × resolve

CAS:

```text
ACTIVE → RESOLVED
```

`changes=1`.

Uma transição lógica.

---

# 100. CAS no repository

Evitar:

```text
SELECT status
UPDATE
```

sem proteção.

Use update condicional e `changes`.

---

# 101. Reliability local

Report:

```text
Intercurrence
+
ClinicalRestriction if generated
+
Audit
+
Outbox if generated
+
Idempotency
```

na mesma UnitOfWork Clinical.

---

# 102. Falha de Outbox

Se uma restriction precisa ser propagada, não é aceitável persistir restriction sem Outbox.

Logo:

```text
Intercurrence/restriction/outbox
```

devem ser consistentes localmente.

---

# 103. Intercurrence sem restriction

Nesse caso:

```text
Intercurrence + Audit + Idempotency
```

pode concluir sem Outbox cross-worker.

---

# 104. Operations mutation

`ApplyClinicalRestriction` deve também ser reliability-safe:

```text
projection mutation
+
Audit
+
eventId idempotency
```

Outbox só se houver consumidor adicional real.

---

# 105. Migration testing

Banco vazio:

```text
0001
...
0013
```

PASS.

Depois:

```text
No migrations to apply
```

---

# 106. Query plan

Verificar:

```text
active restrictions by customer
intercurrences by session
```

com `EXPLAIN QUERY PLAN` quando possível.

---

# 107. Free-tier impact

Novo Appointment admission não deve fazer:

```text
scan all intercurrences
```

Ele consulta apenas projection:

```text
tenant + customer + active blocking restriction LIMIT 1
```

Excelente para Free-first.

---

# 108. Não consultar Clinical em todo Appointment por padrão

Eu manteria Operations projection como fast path no MVP, recuperada via Outbox.

Isso evita acrescentar:

```text
+1 Clinical RPC
```

a cada agendamento.

Documentar a pequena janela de eventual consistency e a mitigação:

```text
best-effort immediate propagation
+
Outbox retry
```

---

# 109. Se a regra exigir zero janela clínica

Aí será necessário mudar a estratégia futuramente para authority RPC.

Não inventar agora sem requisito explícito.

---

# 110. Worker tests sugeridos

```text
test/workers/intercurrence.spec.ts
test/workers/clinical-restriction-propagation.spec.ts
```

Talvez integrar ao existing Clinical suite se permanecer legível.

---

# 111. Unit tests

Cobrir:

```text
Intercurrence invariants
status
severity/type validation

ClinicalRestrictionPolicy

resolution rules
```

---

# 112. E2E principal

Fluxo completo:

```text
CreateAppointment
↓
Confirm
↓
CheckIn
↓
StartSession
↓
Record technical data
↓
Record Equipment
↓
Report Intercurrence
↓
ClinicalRestriction ACTIVE
↓
Outbox
↓
Operations projection
↓
attempt new Appointment
↓
CUSTOMER_RESTRICTED
```

Não precisa completar Session.

---

# 113. E2E resolução

Depois:

```text
ResolveIntercurrence
↓
Restriction RESOLVED
↓
Operations convergence
↓
new Appointment eligibility READY
```

se não houver outras restrições.

---

# 114. Gate `pr19`

Criar:

```bash
npm run gate:pr19
```

Idealmente:

```text
gate:pr18
+
intercurrence unit tests
+
intercurrence worker tests
+
restriction propagation
+
AppointmentEligibility regression
+
dry-runs
```

---

# 115. Não repetir todos os gates desnecessariamente

Se `gate:pr18` já engloba PRs anteriores:

```text
gate:pr19
→ gate:pr18
+ PR19-specific
```

é suficiente.

---

# 116. Definition of Done — Intercurrence

```text
[ ] aggregate Clinical
[ ] tenant-owned
[ ] Session linkage
[ ] Customer linkage
[ ] Service linkage
[ ] Professional linkage
[ ] type
[ ] severity
[ ] description
[ ] conduct
[ ] occurredAt
[ ] reportedAt
[ ] follow-up flag
[ ] reassessment flag
[ ] optional Equipment/Power reference
```

---

# 117. Definition of Done — lifecycle

```text
[ ] ACTIVE/OPEN
[ ] RESOLVED

[ ] ReportIntercurrence
[ ] ResolveIntercurrence

[ ] resolution CAS
[ ] replay safe
```

---

# 118. Definition of Done — Clinical restrictions

```text
[ ] ClinicalRestriction domain/projection model

[ ] restriction linked to Intercurrence

[ ] blocking semantics explicit

[ ] reassessment semantics explicit

[ ] multiple active restrictions supported

[ ] resolving one does not clear others
```

---

# 119. Definition of Done — Operations integration

```text
[ ] ClinicalRestrictionActivated event

[ ] ClinicalRestrictionResolved event

[ ] PR-14 dispatcher route

[ ] Operations Service Binding consumer

[ ] eventId idempotency

[ ] customer restriction projection

[ ] CustomerRestrictionPort uses projection
```

---

# 120. Definition of Done — AppointmentEligibility

```text
[ ] active blocking restriction
    → CUSTOMER_RESTRICTED

[ ] no active blocking restriction
    → restriction gate passes

[ ] projection query bounded

[ ] tenant-aware

[ ] no Clinical RPC added to every eligibility call
```

---

# 121. Definition of Done — Reliability

```text
[ ] Intercurrence mutation atomic

[ ] restriction creation atomic

[ ] Audit atomic

[ ] Outbox atomic when required

[ ] Idempotency atomic

[ ] propagation retryable

[ ] ACK-loss safe
```

---

# 122. Definition of Done — security

```text
[ ] authentication
[ ] tenancy
[ ] professional authorization

[ ] cross-tenant Session blocked
[ ] cross-tenant Intercurrence blocked
[ ] cross-session Equipment reference blocked
[ ] cross-session Power reference blocked

[ ] reportedBy trusted
[ ] resolvedBy trusted

[ ] clinical descriptions absent from logs
```

---

# 123. Definition of Done — regressions

```text
[ ] PR-15 PASS
[ ] PR-16 PASS
[ ] PR-17 PASS
[ ] PR-18 PASS

[ ] StartSession unaffected
[ ] Technical Forms unaffected
[ ] Power unaffected
[ ] Equipment unaffected
[ ] Variation Alerts unaffected
[ ] CreateAppointment eligibility still works
```

---

# 124. Qualidade final

Executar:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers

npm run gate:pr18
npm run gate:pr19

npm run workers:dry-run
git diff --check
```

Resultado:

```text
PASS
```

---

# 125. O que NÃO entra no PR-19

Deixar explicitamente fora:

```text
Photos
R2

photo evidence for Intercurrence

CompleteSession

automatic Session cancellation

automatic diagnosis

Payment
Refund

WhatsApp
Email

inventory

complex follow-up scheduler

automatic Assessment creation
```

---

# 126. Relatório pós-implementação esperado

O Codex deve fechar aproximadamente assim:

```text
PR-19 — Intercurrence Foundation + Clinical Restrictions Propagation

Baseline
PR18 gate:

Intercurrence
domain:
types:
severity:
status:
Session linkage:
technical references:

Persistence
migration:
repository:
indexes:

ReportIntercurrence
HTTP:
permission:
idempotency:
Audit:
restriction outcome:

ResolveIntercurrence
transition:
CAS:
replay:
Audit:

Clinical Restriction
creation:
scope:
blocksAppointments:
requiresReassessment:
multiple restrictions:
resolution:

Outbox
Activated:
Resolved:
dispatcher:
retry:
ACK-loss:

Operations Projection
consumer:
eventId:
customer restriction:
tenant isolation:

AppointmentEligibility
blocked:
resolved:
multiple active restrictions:

Security
professional:
tenant:
session:
equipment reference:
power reference:
PII/logs:

E2E
intercurrence:
restriction propagation:
appointment blocked:
restriction resolution:
appointment released:

Regression
PR15:
PR16:
PR17:
PR18:

Quality
unit:
workers:
lint:
typecheck:
dry-run:
PR19 gate:

Remaining blockers:

Next PR:
```

---

# Próximo PR depois do PR-19

Com isso, o Clinical terá:

```text
Session IN_PROGRESS
    │
    ├── Technical Form
    ├── Technical Values
    ├── Power
    ├── Equipment Usage
    ├── Variation Alerts
    └── Intercurrences
            ↓
       Clinical Restrictions
```

O próximo PR deve então ser:

# PR-20 — Session Photos + Cloudflare R2 Storage Foundation

O PR-20 deve implementar fotos de antes/durante/depois e fotos vinculadas a intercorrências usando R2, mantendo apenas metadados no D1 e preservando URLs privadas/assinadas em vez de blobs na base.

Depois:

```text
PR-21
CompleteSession Authoritative Flow
```

poderá finalmente avaliar:

```text
required technical fields
equipment requirement
photos requirement
open intercurrences
return recommendation
```

e concluir a sessão de forma segura.

Portanto, o **PR-19 deve ser Intercurrence Foundation + Clinical Restrictions Propagation**, com foco especial em não tratar intercorrência apenas como uma anotação: o PR deve conectar o fato clínico à admissão futura de novos agendamentos por meio de uma restrição tenant-aware, auditável, idempotente e reconciliável.
