Com o **PR-15 concluído e `gate:pr15 = PASS`**, o próximo PR deve iniciar a **Fase 5 — Atendimento** do MVP. A documentação coloca explicitamente a sequência `check-in → iniciar sessão → registrar parâmetros/equipamento/potência → concluir sessão`, e também exige que duplo clique não crie duas sessões.  

Portanto, o próximo PR deve ser:

# PR-16 — Session Foundation + StartSession Authoritative Flow

O objetivo deste PR deve ser **materializar a Session como agregado autoritativo no `clinical-worker` e implementar somente o início da sessão**, partindo de um Appointment em `CHECKED_IN`.

O fluxo alvo será:

```text
Appointment
CHECKED_IN
   │
   │ Operations authority
   ▼
StartSession qualification
   │
   ▼
Clinical Worker
   │
   ├── create Session
   ├── Audit
   ├── Outbox SessionStarted
   └── Idempotency
   │
   ▼
Session
IN_PROGRESS
   │
   │ propagation / reconciliation
   ▼
Operations
Appointment
IN_PROGRESS
```

O PR deve **parar aqui**. Registro de parâmetros, equipamentos, potência, fotos, intercorrências e conclusão ficam para os PRs seguintes. Isso mantém a decomposição coerente com os requisitos `RF-031` a `RF-038`. 

---

## 1. Congelar a baseline

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
npm run gate:pr15
```

Tudo deve continuar:

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

Qualquer regressão deve ser resolvida antes do novo domínio.

---

# 2. Criar o plano do PR

Criar:

```text
docs/plans/PR-16-session-foundation-start-session.md
```

O documento deve congelar:

```text
Objective
Session ownership
Appointment ↔ Session coordination
Session lifecycle
Start eligibility
Historical snapshots
Idempotency
Atomicity
Audit
Outbox
Cross-worker propagation
Concurrency
Tenant isolation
Cloudflare Free impact
Tests
Definition of Done
Out of scope
```

---

# 3. Ownership: Session pertence ao Clinical Worker

A documentação trata sessão, ficha técnica, potência, equipamentos e intercorrências como parte do atendimento técnico. 

Portanto:

```text
operations-worker
    owns Appointment

clinical-worker
    owns Assessment
    owns Session
    owns future Technical Entries
```

Não criar:

```text
apps/operations-worker/src/sessions
```

como domínio principal.

---

# 4. Appointment continua Operations-owned

O Clinical não deve executar:

```sql
UPDATE appointments
```

mesmo se o D1 físico for compartilhado.

Coordenação sempre:

```text
Clinical
   ↓ Service Binding / Outbox
Operations
```

Essa separação segue a arquitetura já consolidada nos PRs 13 e 14.

---

# 5. Inspecionar qualquer Session existente

Antes de gerar classes:

```bash
find apps/clinical-worker/src \
  -maxdepth 7 \
  -type f | sort

grep -R "Session" apps/clinical-worker/src libs -n || true
```

O plano histórico menciona Session FSM como conceito arquitetural, então pode já existir algum contrato ou scaffold. Não criar duplicado. 

---

# 6. Criar módulo somente se ausente

Usando Nest CLI:

```bash
nest g module sessions \
  --project clinical-worker
```

Estrutura esperada:

```text
apps/clinical-worker/src/sessions/
├── domain/
├── application/
├── ports/
└── adapters/
```

---

# 7. Criar o agregado `Session`

Se ainda não existir:

```bash
nest g class \
  sessions/domain/session \
  --project clinical-worker \
  --no-spec
```

O domínio não importa:

```text
NestJS
D1
Cloudflare
Wrangler
```

---

# 8. Campos mínimos da Session

Neste PR, a Session deve possuir apenas fatos necessários para representar o início do atendimento:

```text
id
tenantId

appointmentId
customerId
serviceId
professionalId

status

startedAt
startedBy

createdAt
updatedAt
```

Talvez:

```text
assessmentId?
```

somente se o contrato atual exigir vínculo histórico explícito.

Não adicionar dezenas de campos técnicos antes do PR de ficha.

---

# 9. Congelar referências históricas

A regra geral exige preservar informações utilizadas nas operações técnicas como estavam naquele momento, inclusive profissional responsável, equipamento e campos técnicos. 

Para o PR-16, ao menos:

```text
professionalId
serviceId
customerId
appointmentId
```

devem ficar associados à Session.

Se o nome do profissional também precisa sobreviver a alterações futuras, decidir snapshot somente se já houver padrão consolidado para isso.

Não copiar toda entidade Professional.

---

# 10. Estados mínimos da Session

Para este PR, eu manteria:

```text
IN_PROGRESS
COMPLETED
```

e talvez:

```text
CANCELED
```

somente se já estiver definido na FSM canônica.

Mas **StartSession cria apenas `IN_PROGRESS`**.

Não implementar ainda transições de conclusão.

---

# 11. Não inventar `DRAFT`

Uma Session só deve existir quando o profissional realmente inicia o atendimento.

Não criar:

```text
DRAFT
CREATED
OPENING
READY
```

sem regra normativa.

---

# 12. Criar/qualificar `SessionStateMachine`

Se não existir:

```bash
nest g class \
  sessions/domain/session-state-machine \
  --project clinical-worker \
  --no-spec
```

Neste PR, no mínimo:

```text
start
    → IN_PROGRESS
```

e estrutura preparada para:

```text
IN_PROGRESS → COMPLETED
```

futuramente.

---

# 13. Não concluir sessão neste PR

Apesar de o estado `COMPLETED` poder existir no Domain/FSM, o comando:

```text
CompleteSession
```

fica fora.

A conclusão possui regras muito mais pesadas: campos obrigatórios, equipamento, parâmetros, resultado, reação, orientações, retorno, fotos quando obrigatórias e intercorrências não tratadas. 

---

# 14. Session só nasce de Appointment

`RF-031` é explícito: o profissional inicia uma sessão **a partir do agendamento**. 

Portanto não expor:

```http
POST /sessions
```

solto.

O comando deve carregar:

```text
appointmentId
```

como origem obrigatória.

---

# 15. Pré-condição principal: Appointment `CHECKED_IN`

O Clinical precisa saber se o Appointment está apto a iniciar sessão.

Não deve confiar em input do cliente:

```json
{
  "appointmentStatus": "CHECKED_IN"
}
```

Operations é a autoridade.

---

# 16. Criar RPC Operations para qualificação

Operations deve expor algo como:

```text
getSessionStartContext()
```

ou:

```text
checkSessionStartEligibility()
```

A nomenclatura deve seguir os contracts atuais.

Esse RPC deve fornecer somente fatos autorizados necessários.

---

# 17. Criar contrato compartilhado

Em `libs/contracts`, algo conceitualmente semelhante:

```text
session-start/
├── check-session-start.request
├── check-session-start.response
├── start-session.request
└── start-session.response
```

Não compartilhar `Appointment` nem `Session` entities.

---

# 18. Request do Start Context

Algo como:

```ts
interface GetSessionStartContextRequest {
  tenantId: string;
  appointmentId: string;
  actorId: string;
  correlationId: string;
}
```

Não enviar JWT inteiro.

---

# 19. Response Operations → Clinical

No estado elegível:

```text
READY

appointmentId
customerId
serviceId
professionalId
appointmentStatus=CHECKED_IN
```

Talvez outros snapshots estritamente necessários.

No bloqueado:

```text
BLOCKED
reason
```

---

# 20. Validar profissional executor

Esse ponto é importante.

O Appointment já possui um `professionalId`.

O profissional iniciando a Session deve estar autorizado a executar aquele atendimento.

Não permita:

```text
Appointment Professional A
Session startedBy Professional B
```

automaticamente.

---

# 21. Não confundir actor com professional

O usuário autenticado pode ser uma conta vinculada ao Professional.

Portanto o sistema precisa resolver:

```text
actorId
    ↓
Professional identity
```

conforme fundação existente.

Não simplesmente assumir:

```text
actorId === professionalId
```

se IDs são domínios diferentes.

---

# 22. Se essa resolução ainda não existir

Criar um port específico, por exemplo:

```text
ProfessionalExecutionEligibilityPort
```

no Clinical, com adapter Operations RPC.

Não duplicar membership/Professional rules.

---

# 23. Permissão para iniciar sessão

Usar uma permissão explícita, conceitualmente:

```text
session.start
```

somente se o modelo atual não possuir uma equivalente.

A documentação atribui ao profissional a execução do atendimento, enquanto recepção é operacional/comercial. 

Não autorizar recepção implicitamente.

---

# 24. Endpoint público deve estar no Clinical Worker

Recomendação:

```http
POST /tenants/:tenantId/appointments/:appointmentId/sessions/start
```

ou:

```http
POST /tenants/:tenantId/appointments/:appointmentId/session
```

Escolher uma convenção e documentar.

Eu prefiro comando explícito:

```http
POST /tenants/:tenantId/appointments/:appointmentId/session/start
```

porque representa uma transição de negócio.

---

# 25. Não criar endpoint genérico de status

Não:

```http
PATCH /sessions/:id
{
  "status": "IN_PROGRESS"
}
```

---

# 26. Clinical HTTP bridge

Até aqui, o bridge HTTP real foi desenvolvido principalmente no Operations.

PR-16 provavelmente será o primeiro endpoint funcional público relevante no Clinical Worker.

Portanto aplicar as mesmas garantias:

```text
Request
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
StartSession
```

---

# 27. Reutilizar runtime helpers

Não copiar manualmente:

```text
auth parsing
tenant checks
request IDs
error mapping
```

para `clinical-worker`.

Extrair/reutilizar `libs/cloudflare-runtime` quando já disponível.

---

# 28. Não criar uma segunda implementação de autenticação

Operations e Clinical devem usar as mesmas foundations.

---

# 29. `Idempotency-Key` obrigatório

A especificação é explícita: duplo clique não pode criar duas sessões. 

Logo:

```http
Idempotency-Key: ...
```

é obrigatório no StartSession.

---

# 30. Operation name

Algo estável:

```text
START_SESSION
```

Não incluir IDs na operation string.

---

# 31. Hash canônico

Incluir:

```text
tenantId
appointmentId
```

e qualquer outra intenção efetivamente fornecida.

Não incluir:

```text
requestId
correlationId
startedAt
```

porque são valores gerados pelo servidor.

---

# 32. `startedAt` server-side

Não aceitar:

```json
{
  "startedAt": "..."
}
```

como autoridade padrão.

O backend define:

```text
startedAt = now
```

---

# 33. `startedBy` vem da identidade confiável

Também não vem do body.

---

# 34. Criar `StartSession`

Via CLI:

```bash
nest g service \
  sessions/application/start-session \
  --project clinical-worker
```

Fluxo conceitual:

```text
Idempotency pre-check
↓
GetSessionStartContextPort
↓
Operations RPC
↓
validate READY
↓
Session.create(...)
↓
Clinical UnitOfWork
    ├── Session insert
    ├── Audit
    ├── Outbox SessionStarted
    └── Idempotency complete
↓
best-effort Operations propagation
↓
response
```

---

# 35. Não manter transação aberta durante RPC

A ordem precisa ser cuidadosa.

Primeiro obter contexto Operations:

```text
Operations read RPC
```

Depois fazer commit local Clinical.

Não abrir UnitOfWork Clinical e chamar Operations dentro dele.

---

# 36. Unicidade Session por Appointment

A regra de confiabilidade exige que duplo clique não crie duas sessões. 

Além de Idempotency-Key, crie proteção física:

```text
UNIQUE (tenant_id, appointment_id)
```

se apenas uma Session pode nascer daquele Appointment.

Essa é uma garantia muito importante.

---

# 37. Migration

Criar:

```text
0010_session_foundation.sql
```

ajustando à sequência real.

Tabela conceitual:

```text
sessions

id
tenant_id
appointment_id

customer_id
service_id
professional_id

status

started_at
started_by

completed_at NULL
completed_by NULL

created_at
updated_at
```

Não adicionar todos os campos futuros agora.

---

# 38. Chave única

```text
UNIQUE (tenant_id, appointment_id)
```

para impedir duas Sessions.

---

# 39. Índices

Provavelmente:

```text
tenant_id, id
tenant_id, appointment_id
tenant_id, professional_id, status
```

Somente se houver queries reais.

Evitar over-indexing para o plano Free.

---

# 40. `SessionRepository`

Criar:

```bash
nest g interface \
  sessions/ports/session-repository \
  --project clinical-worker
```

Métodos mínimos:

```text
findById
findByAppointment
create
```

e futuro CAS de status se necessário.

---

# 41. Adapter D1

```bash
nest g provider \
  sessions/adapters/d1-session-repository \
  --project clinical-worker
```

Tenant-aware sempre.

---

# 42. Não acessar `appointments` pelo D1 Clinical

Mesmo que estejam no mesmo banco físico:

```text
Clinical D1 adapter
X
SELECT appointments
```

O Appointment pertence ao Operations.

---

# 43. Audit

Na mesma UnitOfWork do Clinical:

```text
SessionStarted
```

Audit deve registrar a ação de início da sessão; esse evento é explicitamente obrigatório na especificação. 

Metadata segura:

```text
tenantId
actorId
sessionId
appointmentId
professionalId
serviceId
correlationId
startedAt
```

---

# 44. Não registrar dados clínicos ainda

Não colocar:

```text
assessment payload
allergies
parameters
notes
customer document
```

no Audit.

---

# 45. Outbox

Criar:

```text
SessionStarted
```

com:

```text
status=PENDING
```

Payload mínimo:

```text
tenantId
sessionId
appointmentId
professionalId
eventId
correlationId
```

---

# 46. PR-14 dispatcher

O novo event type precisa ser roteado para Operations.

O dispatcher já suporta delivery cross-worker.

Adicionar rota:

```text
SessionStarted
→ Operations
```

sem criar novo delivery engine.

---

# 47. Operations recebe `SessionStarted`

Criar use case:

```bash
nest g service \
  appointments/application/apply-session-started \
  --project operations-worker
```

Responsabilidade:

```text
load tenant-owned Appointment
↓
validate CHECKED_IN
↓
transition to IN_PROGRESS
↓
persist with CAS
↓
Audit
↓
Outbox if required
↓
Idempotency by eventId
```

---

# 48. Appointment precisa de `IN_PROGRESS`

Se ainda não existe status equivalente, revisar a FSM oficial.

A proposta técnica usa explicitamente `appointment.status = in_progress` durante conclusão de sessão. 

Logo a transição:

```text
CHECKED_IN
→ IN_PROGRESS
```

é coerente com o modelo técnico.

---

# 49. Não deixar Clinical alterar Appointment

A propagação continua:

```text
Clinical Outbox
↓
PR-14 dispatcher
↓
Operations RPC
↓
ApplySessionStarted
```

---

# 50. Pode haver best-effort imediato

Assim como Deposit:

```text
Session commit
↓
best-effort Operations RPC
```

pode reduzir janela de inconsistência.

Mas o Outbox continua a garantia de convergência.

---

# 51. Não tentar rollback da Session se Operations falhar

Se Clinical criou:

```text
Session IN_PROGRESS
```

mas Operations ficou indisponível:

```text
Appointment CHECKED_IN
```

temporariamente.

Esse é um estado eventual recuperável.

Não deletar Session.

---

# 52. Outbox resolve convergência

Depois:

```text
SessionStarted PENDING
↓
dispatcher
↓
Operations
↓
Appointment IN_PROGRESS
```

---

# 53. Idempotência consumer-side

Operations deve usar:

```text
eventId
```

como identidade da aplicação do evento.

Redelivery:

```text
SessionStarted event X
```

não transiciona novamente.

---

# 54. ACK-loss test

Obrigatório.

Cenário:

```text
Clinical Session created
↓
Operations applies SessionStarted
↓
Clinical/Billing-side outbox not marked SENT
↓
redelivery
```

Operations:

```text
REPLAY
```

sem duplicação.

---

# 55. Uma Session por Appointment

Além de unique constraint, `StartSession` deve detectar:

```text
existing Session
```

e lidar adequadamente.

### Same idempotency

Replay.

### Different key

Pode retornar a Session existente ou conflito `SESSION_ALREADY_STARTED`, conforme contrato.

Eu prefiro resultado semântico estável:

```text
SESSION_ALREADY_STARTED
```

para nova intenção duplicada, enquanto replay exato devolve o recurso.

---

# 56. Concurrency Start × Start

Teste físico:

```text
two different keys
same Appointment
```

simultaneamente.

Esperado:

```text
session rows = 1
```

Nunca duas.

---

# 57. CHECKED_IN obrigatório

Cenários inválidos:

```text
AWAITING_DEPOSIT
AWAITING_CONFIRMATION
CONFIRMED
CANCELED
EXPIRED
```

não iniciam Session.

O fluxo documental é confirmação → check-in → iniciar sessão. 

---

# 58. Appointment já `IN_PROGRESS`

Nova tentativa de StartSession deve ser:

```text
replay if same session/event
```

ou:

```text
already started
```

não criar outra.

---

# 59. Appointment `COMPLETED`

Não inicia nova Session.

Se houver retorno, precisa existir outro Appointment/Session.

---

# 60. Assessment ainda precisa estar válida?

Aqui é importante não duplicar toda `AppointmentEligibility`.

A avaliação obrigatória já foi validada no momento da criação do Appointment.

Mas entre agendamento e sessão ela pode expirar ou surgir contraindicação.

A documentação sugere que novo atendimento deve respeitar restrições/intercorrências ativas. 

Neste PR, eu não reexecutaria toda eligibility automaticamente sem regra explícita.

---

# 61. StartSession Admission Policy

Crie uma policy pequena somente para condições atuais de início:

```text
Appointment CHECKED_IN
Professional authorized
Session does not exist
Tenant active/access valid
```

Qualquer revalidação clínica adicional deve ser normativa e entrar explicitamente.

---

# 62. License no início da Session

A regra anterior de licença suspensa bloqueia novas operações. Dependendo da política congelada, iniciar uma sessão pode ser considerado nova operação.

Não inventar.

Use a política vigente de licença já documentada.

Se `LicenseEligibilityPort` for reutilizável:

```text
StartSession
→ operational license check
```

somente se o contrato disser que início de atendimento é bloqueado por suspensão.

---

# 63. Não misturar Appointment admission com Session admission

Não reutilizar `CheckAppointmentEligibility` inteiro.

Criar uma policy específica:

```text
CheckSessionStartEligibility
```

se necessário.

---

# 64. Equipment ainda NÃO entra

Embora equipamento seja parte da sessão técnica, ele deve ser selecionado no PR de Technical Entries/Equipment.

Não bloquear StartSession apenas porque nenhum equipamento foi escolhido ainda, salvo se o contrato exigir seleção antes do início.

---

# 65. Technical fields ainda NÃO entram

Não exigir preenchimento para iniciar.

RN-CAM-004 só proíbe **concluir** com campos obrigatórios faltando. 

Portanto:

```text
StartSession
```

pode existir antes de parâmetros completos.

---

# 66. Mas prepare o vínculo

Session deve ser a raiz para:

```text
TechnicalEntry
EquipmentUsage
PowerApplication
Intercurrence
Photo
```

futuros.

---

# 67. Não guardar parâmetros como JSON genérico na Session

Não faça:

```text
session.data = { ...everything }
```

Isso prejudicará validação/versionamento.

O PR seguinte tratará modelo técnico.

---

# 68. HTTP response

Algo enxuto:

```json
{
  "id": "...",
  "appointmentId": "...",
  "status": "IN_PROGRESS",
  "startedAt": "...",
  "professionalId": "..."
}
```

Sem dados sensíveis.

---

# 69. Status HTTP

Primeira criação:

```text
201 Created
```

Replay:

resposta lógica estável conforme foundation.

---

# 70. Erros

Códigos estáveis:

```text
SESSION_START_NOT_ALLOWED
SESSION_ALREADY_STARTED
APPOINTMENT_NOT_CHECKED_IN
PROFESSIONAL_NOT_AUTHORIZED
IDEMPOTENCY_KEY_CONFLICT
```

Somente se não houver equivalentes existentes.

---

# 71. Cross-tenant

Tenant A não inicia sessão de Appointment B.

Mesmo manipulando:

```text
appointmentId
```

na URL.

Esse isolamento é requisito geral obrigatório. 

---

# 72. Professional mismatch

Professional A não pode iniciar Session do Appointment de Professional B sem regra explícita de substituição.

Substituição de profissional deve ser outro comando.

---

# 73. Actor sem vínculo Professional

Mesmo com permissão genérica, se o comando exige profissional executor, deve bloquear.

---

# 74. Reliability local Clinical

StartSession é mutação crítica:

```text
Session insert
+
Audit
+
Outbox
+
Idempotency
```

na mesma UnitOfWork Clinical.

---

# 75. Falha de Audit

Resultado:

```text
Session row = 0
```

conforme garantia física atual.

---

# 76. Falha de Outbox

Mesmo:

```text
Session row = 0
```

Não criar Session sem fato de integração.

---

# 77. Propagação fora da transação

Como PR-13/14:

```text
Clinical commit
↓
best-effort Operations
```

Nunca:

```text
Clinical transaction
↓
Operations RPC
↓
commit
```

---

# 78. Outbox `SessionStarted`

PR-14 deve ser atualizado para reconhecer esse evento como roteável.

Não permitir que seja marcado `DEAD` apenas porque ainda não havia route.

---

# 79. Teste do dispatcher

```text
SessionStarted PENDING
↓
DispatchOutboxBatch
↓
Operations
↓
Appointment IN_PROGRESS
↓
Outbox SENT
```

---

# 80. Teste de Operations indisponível

Após Session commit:

```text
Session IN_PROGRESS
Outbox PENDING
Appointment CHECKED_IN
```

Estado temporário válido.

Depois recovery:

```text
dispatcher
→ Appointment IN_PROGRESS
→ SENT
```

---

# 81. Não criar nova Session durante inconsistência

Este é um ponto importante.

Se Session já existe, ainda que Appointment continue temporariamente `CHECKED_IN`, outra request StartSession deve encontrar a unique Session e não criar outra.

A unicidade física é o verdadeiro guard.

---

# 82. Audit Operations

Quando `ApplySessionStarted` muda Appointment:

```text
appointment.session-started-applied
```

ou ação equivalente.

Não duplicar o Audit do Clinical.

São dois fatos distintos:

```text
Clinical: SessionStarted
Operations: Appointment transitioned
```

---

# 83. Outbox Operations?

Avalie se a transição Appointment→IN_PROGRESS precisa gerar outro evento.

Se não houver consumidor atual:

```text
não é necessário
```

Evite eventos só por simetria.

Se o padrão atual exige outbox para toda mutação crítica, use o padrão existente.

---

# 84. Concurrency física

Criar Worker test específico:

```text
test/workers/session-start.spec.ts
```

Cobrir pelo menos:

```text
20 iterations
2 concurrent start requests
```

Esperado:

```text
sessions = 20
duplicates = 0
```

---

# 85. Replay físico

Primeiro:

```text
key X
→ Session S
```

Segundo:

```text
same key X
same payload
→ Session S
```

Contagens:

```text
sessions = 1
audit SessionStarted = 1
outbox SessionStarted = 1
```

---

# 86. Hash conflict

Mesma key usada para outro Appointment:

```text
IDEMPOTENCY_KEY_CONFLICT
```

---

# 87. Cross-tenant idempotency

Tenant A/key X e Tenant B/key X continuam independentes.

---

# 88. Teste full-flow PR-12–16

Esse será o principal E2E:

```text
CreateAppointment
↓
Confirm / deposit when required
↓
ConfirmAppointment
↓
CheckIn
↓
StartSession
↓
Session IN_PROGRESS
↓
Appointment IN_PROGRESS
```

Parar aqui.

---

# 89. Caminho sem depósito

Mais simples:

```text
Create
→ AWAITING_CONFIRMATION
→ Confirm
→ CHECK? no
→ CheckIn
→ StartSession
```

Resultado final:

```text
Appointment IN_PROGRESS
Session IN_PROGRESS
```

---

# 90. Caminho com depósito

Também:

```text
Create
→ AWAITING_DEPOSIT
→ Deposit confirmed
→ reconciliation
→ AWAITING_CONFIRMATION
→ Confirm
→ CHECKED_IN
→ StartSession
```

Tudo PASS.

---

# 91. Não registrar parâmetros neste E2E

O teste termina assim que Session inicia.

---

# 92. Migration test

Banco vazio:

```text
0001
...
0009
0010
```

PASS.

Reaplicação:

```text
No migrations to apply
```

---

# 93. D1 Free-first

Uma nova Session gera poucos writes:

```text
session
idempotency
audit
outbox
```

mais a eventual transição Appointment.

Isso continua compatível com a estratégia Free-first desde que não haja polling excessivo.

---

# 94. Nenhum KV

Não necessário.

---

# 95. Nenhum R2

Fotos entram depois.

---

# 96. Nenhuma Queue nova

Reutilizar dispatcher do PR-14.

---

# 97. Observabilidade

Clinical:

```text
operation=StartSession
tenantId
sessionId
appointmentId
professionalId
serviceId
result
correlationId
duration
```

Operations:

```text
operation=ApplySessionStarted
appointmentId
sessionId
result
correlationId
```

---

# 98. Não logar dados técnicos

Ainda não existem.

Continuar sem PII.

---

# 99. Métricas

Se foundation permite:

```text
session.start.success
session.start.replay
session.start.blocked
session.start.conflict

session.start.propagation.success
session.start.propagation.pending
```

Sem IDs como label.

---

# 100. Health regression

Clinical `/health` continua:

```text
0 D1 reads
0 D1 writes
0 Operations RPC
```

Operations/Billing idem.

---

# 101. Architecture tests

Proibir:

```text
Session Domain
→ Operations Domain
```

```text
Session Domain
→ Cloudflare
```

```text
Session Domain
→ D1
```

Permitido:

```text
StartSession
→ SessionStartContextPort
```

Adapter conhece Service Binding.

---

# 102. Definition of Done — Session Domain

```text
[ ] Session aggregate exists

[ ] tenant-owned

[ ] linked to Appointment

[ ] linked to Customer

[ ] linked to Service

[ ] linked to Professional

[ ] initial status IN_PROGRESS

[ ] startedAt server-side

[ ] startedBy trusted

[ ] no technical payload mixed into aggregate
```

---

# 103. Definition of Done — Operations qualification

```text
[ ] Operations exposes SessionStartContext RPC

[ ] only CHECKED_IN Appointment qualifies

[ ] tenant validated

[ ] professional relationship validated

[ ] no Appointment entity shared
```

---

# 104. Definition of Done — StartSession

```text
[ ] StartSession application service

[ ] Clinical endpoint

[ ] Authentication

[ ] Tenant membership

[ ] permission

[ ] Idempotency-Key

[ ] request validation

[ ] Operations qualification

[ ] Session created through Domain
```

---

# 105. Definition of Done — Persistence

```text
[ ] migration 0010

[ ] sessions table

[ ] unique tenant+appointment

[ ] SessionRepository

[ ] D1 adapter

[ ] tenant-aware queries

[ ] no direct Appointment SQL in Clinical
```

---

# 106. Definition of Done — Reliability

```text
[ ] Session + Audit + Outbox + Idempotency atomic locally

[ ] SessionStarted audit

[ ] SessionStarted outbox

[ ] failure injection PASS

[ ] no partial Session
```

---

# 107. Definition of Done — Idempotency

```text
[ ] replay same key/hash returns same Session

[ ] one Session row

[ ] one business Audit

[ ] one SessionStarted event

[ ] same key/different hash conflicts

[ ] cross-tenant key isolation
```

---

# 108. Definition of Done — Concurrency

```text
[ ] concurrent StartSession tested

[ ] at most one Session per Appointment

[ ] unique constraint physically proved

[ ] no process-local mutex

[ ] temporary Appointment propagation lag cannot create duplicate Session
```

---

# 109. Definition of Done — Appointment propagation

```text
[ ] SessionStarted routing added to PR-14 dispatcher

[ ] ApplySessionStarted exists

[ ] CHECKED_IN → IN_PROGRESS

[ ] CAS tenant-aware

[ ] eventId idempotency

[ ] redelivery safe

[ ] ACK-loss test PASS
```

---

# 110. Definition of Done — Eventual consistency

```text
[ ] Clinical commits first

[ ] Operations RPC outside Clinical transaction

[ ] Operations outage does not delete Session

[ ] SessionStarted remains PENDING

[ ] dispatcher reconciles later

[ ] final state converges
```

---

# 111. Definition of Done — Security

```text
[ ] cross-tenant Appointment blocked

[ ] unauthorized professional blocked

[ ] actor cannot forge startedBy

[ ] caller cannot forge professionalId

[ ] no sensitive clinical data in Audit/Outbox/logs
```

---

# 112. Definition of Done — regressions

```text
[ ] gate:pr12 PASS

[ ] gate:pr13 PASS

[ ] gate:pr14 PASS

[ ] gate:pr15 PASS

[ ] CreateAppointment unaffected

[ ] Deposit unaffected

[ ] Outbox dispatcher unaffected

[ ] Confirm/CheckIn unaffected
```

---

# 113. Criar `gate:pr16`

```bash
npm run gate:pr16
```

Idealmente:

```text
gate:pr15
+
Session unit tests
+
Session Workers tests
+
Session concurrency
+
SessionStarted reconciliation
+
dry-runs
```

---

# 114. Gates de qualidade

```text
[ ] npm run lint PASS

[ ] tsc --build --force PASS

[ ] npm run test PASS

[ ] npm run test:workers PASS

[ ] npm run gate:pr15 PASS

[ ] npm run gate:pr16 PASS

[ ] Operations dry-run PASS

[ ] Clinical dry-run PASS

[ ] Billing dry-run PASS

[ ] migrations PASS

[ ] git diff --check PASS
```

---

# 115. O que NÃO entra no PR-16

Esse limite é importante:

```text
TechnicalField configuration

TechnicalEntry

Power / potência

Equipment usage

Photos

R2

Intercurrence

CompleteSession

Package consumption

Payment

Return recommendation

Customer profile recalculation
```

O PR termina em:

```text
Session = IN_PROGRESS
Appointment = IN_PROGRESS
```

---

# 116. Relatório pós-implementação

O relatório final deveria seguir algo próximo de:

```text
PR-16 — Session Foundation + StartSession Authoritative Flow

Baseline
PR15 gate:

Session Domain
aggregate:
status:
invariants:

Persistence
migration:
repository:
unique appointment/session:
tenant isolation:

Session Start Context
Operations RPC:
appointment status:
professional validation:

StartSession
HTTP:
auth:
permission:
idempotency:
startedAt:
startedBy:

Reliability
UnitOfWork:
Audit:
Outbox:
failure proof:

Concurrency
iterations:
attempts:
sessions:
duplicates:

Idempotency
replay:
hash conflict:
crossTenant:

Appointment Propagation
SessionStarted:
ApplySessionStarted:
CAS:
ACK-loss:
reconciliation:

Eventual Consistency
Clinical committed:
Operations unavailable:
outbox pending:
recovered:
final convergence:

Security
crossTenant:
professional mismatch:
actor forging:

E2E
no-deposit flow:
deposit flow:
final Appointment:
final Session:

Regression
PR12:
PR13:
PR14:
PR15:

Quality
unit:
workers:
lint:
typecheck:
dry-runs:
PR16 gate:

Remaining blockers:

Next PR:
```

---

# Próximo PR depois do PR-16

Com `Session IN_PROGRESS`, o próximo PR mais correto será:

> **PR-17 — Technical Form + Session Parameters Foundation**

Porque a documentação exige que, depois de iniciar a sessão, o profissional registre ficha técnica, parâmetros, potência e possa consultar parâmetros anteriores. `RF-032`, `RF-033`, `RF-034` e `RN-CAM-003/004/005` tornam essa etapa o próximo dependency obrigatório antes de qualquer `CompleteSession`.

A sequência passa a ser:

```text
PR-15
Confirmation + Check-in
        ↓
PR-16
Session Start
        ↓
PR-17
Technical Form
+ Parameters
+ Power
        ↓
PR-18
Equipment Usage
+ Parameter Comparison / Alerts
        ↓
PR-19
Intercurrence Foundation
        ↓
PR-20
Photos / R2
        ↓
PR-21
CompleteSession
+ Package/History/Return integration
```

Essa decomposição é importante porque **`CompleteSession` não pode ser implementado cedo demais**. A especificação exige que a conclusão valide campos obrigatórios, equipamento quando necessário, parâmetros, reação, orientações, retorno, fotos obrigatórias e intercorrências pendentes, além de ser única e atomicamente consistente. 

Portanto, o próximo PR correto é **PR-16 — Session Foundation + StartSession Authoritative Flow**, terminando deliberadamente com `Session = IN_PROGRESS` e deixando o registro técnico para o PR seguinte.
