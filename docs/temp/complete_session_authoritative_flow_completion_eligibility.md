Com o **PR-20 concluído**, a fundação técnica necessária para encerrar uma sessão já está praticamente completa. O próximo PR deve consolidar todas essas capacidades e implementar a transição autoritativa de encerramento.

# PR-21 — CompleteSession Authoritative Flow + Completion Eligibility

O objetivo é sair de:

```text
Session IN_PROGRESS
    │
    ├── Technical Form Snapshot
    ├── Technical Values
    ├── Power
    ├── Equipment Usage
    ├── Variation Alerts
    ├── Intercurrences
    └── Photos / R2
```

para:

```text
Session IN_PROGRESS
        │
        ▼
EvaluateSessionCompletionEligibility
        │
        ├── technical fields
        ├── equipment requirement
        ├── photo requirement
        ├── clinical/intercurrence state
        ├── technical invariants
        └── authorization
        │
        ▼
      READY
        │
        ▼
CompleteSession
        │
        ├── Session COMPLETED
        ├── Audit
        ├── Outbox SessionCompleted
        └── Idempotency
        │
        ▼
Clinical → Operations
        │
        ▼
Appointment
IN_PROGRESS → COMPLETED
```

Esse PR deve encerrar o ciclo técnico da sessão, mas ainda **não deve implementar pagamento, pacote, retorno agendado ou notificações**.

---

## 1. Baseline obrigatória

Antes de qualquer alteração:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr18
npm run gate:pr19
npm run gate:pr20
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

Tudo deve permanecer:

```text
PASS
```

Se o PR-20 ainda depende de:

```text
MAX_CLINICAL_PHOTO_BYTES
```

garantir que o harness de testes possua um valor explícito e determinístico.

Não usar configuração implícita para deixar testes passarem.

---

# 2. Criar o plano formal

Criar:

```text
docs/plans/PR-21-complete-session-authoritative-flow.md
```

Deve conter:

```text
Objective
Scope
Session completion authority
Completion eligibility
Technical requirements
Equipment requirements
Photo requirements
Intercurrence rules
Variation alert handling
Completion snapshots
FSM
Idempotency
Atomicity
Audit
Outbox
Appointment propagation
Eventual consistency
Concurrency
Tenant isolation
Observability
Tests
Definition of Done
Out of scope
```

---

# 3. Não criar um novo domínio de Session

O agregado já existe desde o PR-16.

Primeiro inspecionar:

```bash
find apps/clinical-worker/src/sessions \
  -maxdepth 8 \
  -type f | sort
```

Revisar especialmente:

```text
session.ts
session-state-machine.ts
start-session.ts
repositories
technical values
power
equipment
photos
```

PR-21 deve **compor** essas capabilities.

Não criar:

```text
CompletedSession
SessionV2
SessionFinalization
```

como agregados paralelos.

---

# 4. Congelar a transição principal

A única transição nova de domínio deste PR deve ser:

```text
IN_PROGRESS
    ↓ complete
COMPLETED
```

`COMPLETED` deve ser terminal para edição técnica normal.

Depois disso:

```text
technical values update → BLOCKED
power record → BLOCKED
equipment usage → BLOCKED
photo upload → BLOCKED
new intercurrence → BLOCKED
```

salvo futuros workflows explícitos de correção administrativa.

---

# 5. Atualizar `SessionStateMachine`

A FSM deve continuar pura.

Exemplo conceitual:

```text
IN_PROGRESS
   └── complete → COMPLETED

COMPLETED
   └── no normal transitions
```

Não colocar:

```text
D1
Audit
R2
Cloudflare
```

na FSM.

---

# 6. Criar a policy central do PR

Criar algo como:

```bash
nest g class \
  sessions/domain/session-completion-eligibility-policy \
  --project clinical-worker \
  --no-spec
```

ou service/domain policy de acordo com a convenção atual.

Resultado deve ser explícito:

```text
READY
BLOCKED
```

com reasons estruturados.

Não retornar apenas:

```text
true
false
```

---

# 7. Resultado de eligibility deve suportar múltiplos motivos

Ao contrário da criação de Appointment, para encerramento faz sentido poder informar todas as pendências da sessão.

Exemplo:

```text
BLOCKED

reasons:
- REQUIRED_TECHNICAL_FIELD_MISSING
- REQUIRED_EQUIPMENT_MISSING
- REQUIRED_PHOTO_MISSING
```

Isso é útil para frontend e reduz ciclo de tentativa/erro.

Mas a decisão final continua server-side.

---

# 8. Criar `CheckSessionCompletionEligibility`

Via CLI:

```bash
nest g service \
  sessions/application/check-session-completion-eligibility \
  --project clinical-worker
```

Fluxo:

```text
Session
↓
Technical completeness
↓
Equipment requirement
↓
Photo requirement
↓
Intercurrence state
↓
Variation state
↓
other technical invariants
↓
READY/BLOCKED
```

---

# 9. Session precisa estar `IN_PROGRESS`

Primeiro gate:

```text
status != IN_PROGRESS
→ BLOCKED
```

Reason:

```text
SESSION_NOT_IN_PROGRESS
```

ou código equivalente existente.

---

# 10. Reutilizar completeness do PR-17

O PR-17 já materializou validação de ficha técnica.

Não reconstruir:

```text
for each field...
```

dentro de CompleteSession.

Use:

```text
EvaluateSessionTechnicalCompleteness
```

ou capability equivalente existente.

---

# 11. Campos obrigatórios precisam estar preenchidos

O gate deve verificar:

```text
required field
+
snapshot field definition
+
current valid value
```

Se faltar:

```text
REQUIRED_TECHNICAL_FIELD_MISSING
```

---

# 12. Não validar contra a configuração atual do Service

Extremamente importante.

A sessão deve ser validada contra:

```text
SessionTechnicalFormSnapshot
```

e não contra:

```text
current active TechnicalFormDefinition
```

Se o administrador publicou `v2` durante o atendimento iniciado com `v1`, a Session continua obedecendo `v1`.

---

# 13. Valores precisam continuar válidos

Mesmo que tenham sido validados no momento do save, a completion policy pode fazer uma verificação defensiva sobre:

```text
type
range
precision
unit
options
```

a partir do snapshot.

Mas não recalcular valores nem corrigir automaticamente.

---

# 14. Potência

Se a Session/Service exige registro de potência, verificar a capability correspondente.

Não inventar:

```text
power required for every Service
```

O requisito precisa vir de configuração técnica já existente.

Resultado:

```text
POWER_REQUIRED_MISSING
```

quando aplicável.

---

# 15. Equipment requirement

O PR-18 já possui:

```text
requiresEquipment
EquipmentUsage
```

Use a avaliação existente.

Estados:

```text
NOT_REQUIRED
SATISFIED
MISSING
```

Completion:

```text
MISSING
→ BLOCKED
```

---

# 16. Equipment usado continua válido historicamente

Não faça:

```text
Equipment.status must still be AVAILABLE at completion
```

se ele estava disponível no momento da utilização.

O histórico usa snapshot.

Exemplo:

```text
Equipment AVAILABLE
↓
used
↓
later MAINTENANCE
```

A sessão não deve se tornar inválida retroativamente.

---

# 17. Photo requirement

Reutilizar PR-20:

```text
EvaluateSessionPhotoRequirement
```

Estados:

```text
NOT_REQUIRED
REQUIRED_MISSING
REQUIRED_SATISFIED
```

Completion:

```text
REQUIRED_MISSING
→ BLOCKED
```

---

# 18. Apenas fotos `AVAILABLE` contam

Não considerar:

```text
PENDING_UPLOAD
FAILED
```

como requisito satisfeito.

Isso precisa virar regression test.

---

# 19. Não consultar R2 durante `CompleteSession`

Esse ponto é importante para Free Tier e consistência.

Se metadata diz:

```text
PhotoAttachment.status = AVAILABLE
```

essa é a projection autoritativa para completion.

Não faça:

```text
CompleteSession
→ R2 HEAD para cada foto
```

Isso criaria custo e latência desnecessários.

Integridade R2 é responsabilidade do mecanismo de reconciliation do PR-20.

---

# 20. Intercurrences

O PR-19 materializou:

```text
OPEN
RESOLVED
```

e:

```text
requiresFollowUp
requiresReassessment
```

Agora a policy de completion precisa decidir quais estados bloqueiam.

Não inventar:

```text
any OPEN intercurrence
→ always BLOCK
```

sem contrato.

---

# 21. Congelar regra de Intercurrence para completion

Se a documentação já define que intercorrências precisam estar tratadas antes da conclusão, usar essa regra.

Caso contrário, separar:

```text
OPEN
but documented/handled
```

de:

```text
OPEN + required conduct missing
```

Se não houver informação normativa suficiente, manter o gate limitado a requisitos expressamente implementados.

---

# 22. Não resolver Intercurrence automaticamente

CompleteSession nunca deve executar:

```text
OPEN → RESOLVED
```

por conveniência.

São operações distintas.

---

# 23. ClinicalRestriction não deve ser automaticamente removida

Mesma regra.

Concluir sessão:

```text
Session → COMPLETED
```

não significa:

```text
Customer unrestricted
```

A restrição clínica possui lifecycle próprio.

---

# 24. Variation Alerts

O PR-18 congelou:

```text
OPEN
JUSTIFIED
```

e explicitamente determinou que alertas não bloqueiam a sessão no MVP.

Portanto PR-21 **não deve transformar `OPEN` automaticamente em blocker**, a menos que a documentação normativa tenha mudado.

Pode retornar informação:

```text
openVariationAlertsCount
```

mas completion permanece permitida se essa é a política atual.

---

# 25. Justificativa de variação continua recomendável

Se já houver regra explícita exigindo justificativa antes da conclusão, então:

```text
OPEN without justification
→ BLOCKED
```

Mas apenas se isso estiver documentado.

Não inferir a partir de “solicitar justificativa”.

---

# 26. Criar resultado estruturado

Exemplo conceitual:

```text
SessionCompletionEligibility {
  status: READY | BLOCKED

  technicalFields:
    COMPLETE | INCOMPLETE

  power:
    SATISFIED | MISSING | NOT_REQUIRED

  equipment:
    SATISFIED | MISSING | NOT_REQUIRED

  photos:
    SATISFIED | MISSING | NOT_REQUIRED

  intercurrences:
    OK | BLOCKED

  variationAlerts:
    OPEN | RESOLVED | NOT_APPLICABLE

  reasons[]
}
```

Não precisa ser exatamente esse DTO, mas preservar separação de concerns.

---

# 27. Criar endpoint consultivo

Antes do comando de conclusão, pode ser útil expor:

```http
GET /tenants/:tenantId/sessions/:sessionId/completion-eligibility
```

Ou endpoint semelhante.

Ele é apenas consultivo.

Frontend pode usar para exibir:

```text
"2 campos obrigatórios pendentes"
"foto obrigatória ausente"
```

Mas o `POST complete` sempre reexecuta a policy.

---

# 28. Não confiar no GET anterior

Fluxo incorreto:

```text
GET readiness
→ READY

10 seconds later
POST complete
→ trust previous READY
```

Fluxo correto:

```text
POST complete
→ recompute eligibility authoritatively
```

---

# 29. Criar `CompleteSession`

```bash
nest g service \
  sessions/application/complete-session \
  --project clinical-worker
```

Pipeline conceitual:

```text
Idempotency precheck
↓
load Session
↓
professional authorization
↓
CheckSessionCompletionEligibility
↓
READY?
↓
Session.complete()
↓
Clinical UnitOfWork
    ├── Session CAS
    ├── completion metadata
    ├── Audit
    ├── Outbox SessionCompleted
    └── Idempotency complete
↓
best-effort Operations propagation
↓
response
```

---

# 30. Endpoint

Sugestão:

```http
POST /tenants/:tenantId/sessions/:sessionId/complete
```

Headers:

```http
Authorization: Bearer ...
Idempotency-Key: ...
```

Body idealmente mínimo.

---

# 31. Não receber status no body

Proibido:

```json
{
  "status": "COMPLETED"
}
```

---

# 32. Não receber `completedAt`

Server-side:

```text
completedAt = now
```

---

# 33. Não receber `completedBy`

Derivado do contexto autenticado.

---

# 34. Session domain deve realizar a transição

Application:

```text
eligibility READY
↓
Session.complete(...)
```

Não:

```text
repository.updateStatus('COMPLETED')
```

diretamente.

---

# 35. Professional authorization

O profissional executor da Session é a autoridade natural para completion.

Outro profissional:

```text
BLOCKED
```

salvo permissão explícita de substituição/supervisão já existente.

---

# 36. Permissão

Usar algo como:

```text
session.complete
```

se ainda não existir.

Não reutilizar:

```text
session.technical.update
```

automaticamente.

---

# 37. Idempotency-Key obrigatório

`CompleteSession` é mutação crítica.

Operation:

```text
COMPLETE_SESSION
```

Hash baseado em:

```text
tenantId
sessionId
```

e qualquer input normativo do comando.

Não incluir:

```text
completedAt
requestId
correlationId
```

---

# 38. Replay

Primeira execução:

```text
IN_PROGRESS → COMPLETED
```

Replay com mesma key/hash:

```text
same Session
same completedAt
same logical response
```

Sem:

```text
new Audit
new Outbox
new propagation event
```

---

# 39. Nova key contra Session já concluída

Deve retornar comportamento explícito:

```text
SESSION_ALREADY_COMPLETED
```

ou resultado idempotente normativamente escolhido.

Não repetir os efeitos.

---

# 40. CAS obrigatório

Repository deve suportar transição física:

```sql
UPDATE sessions
SET
  status = 'COMPLETED',
  completed_at = ?,
  completed_by = ?
WHERE tenant_id = ?
  AND id = ?
  AND status = 'IN_PROGRESS'
```

Então:

```text
changes = 1
```

define transição vencedora.

---

# 41. Não usar somente read + save

Dois requests concorrentes podem:

```text
read IN_PROGRESS
read IN_PROGRESS
```

FSM sozinha não protege persistência distribuída.

Use CAS.

---

# 42. Concurrency Complete × Complete

Teste físico obrigatório:

```text
2 different Idempotency-Key
same Session
```

Resultado:

```text
1 transition
1 Session COMPLETED
1 business completion event
```

---

# 43. Complete × technical update concorrente

Este é um cenário importante.

Imagine:

```text
Request A → update technical value
Request B → complete
```

concorrentes.

Não pode ocorrer:

```text
Session COMPLETED
+
technical update committed after completion
```

sem regra.

---

# 44. Como proteger isso

Technical writes do PR-17/18/20 precisam continuar condicionadas a:

```text
Session.status = IN_PROGRESS
```

no momento autoritativo da mutation.

Não apenas em pre-read.

Se hoje fazem:

```text
load Session → check IN_PROGRESS → write child row
```

há TOCTOU.

PR-21 deve revisar isso.

---

# 45. Esse é um ponto crítico do PR

O completion CAS bloqueia a Session, mas child writes em tabelas diferentes podem não enxergar a mudança atomicamente se não compartilharem a transação/guard apropriado.

Precisamos definir uma estratégia consistente.

---

# 46. Criar `SessionMutationGuard`

Uma opção arquitetural:

```text
SessionMutationGuardPort
```

que adiciona à UnitOfWork uma verificação:

```sql
SELECT/guard session status = IN_PROGRESS
```

ou mutation CAS/revision adequada.

Não criar lock em memória.

---

# 47. Melhor estratégia se suportada

Usar uma `revision` no Session.

Exemplo:

```text
Session
revision = N
```

Technical update verifica:

```text
status=IN_PROGRESS
AND revision=N
```

Completion incrementa:

```text
revision=N+1
```

Mas isso pode ser uma refatoração maior.

Não introduzir revision sem avaliar o repository atual.

---

# 48. Estratégia mínima

Se D1 `batch()`/UnitOfWork atual permite, o write técnico deve incluir um statement que falha se Session não estiver `IN_PROGRESS`.

Por exemplo:

```text
assertSessionWritable(sessionId)
+
technical mutation
```

na mesma unidade local.

A implementação exata precisa respeitar a semântica já fisicamente qualificada.

---

# 49. PR-21 deve provar a corrida

Teste:

```text
CompleteSession
vs
RecordSessionTechnicalValues
```

Em múltiplas iterações.

Invariante:

```text
if completion wins:
  later technical mutation = blocked

if technical mutation wins:
  completion sees/finalizes latest valid data

never:
  technical mutation commits after completion
```

---

# 50. Repetir para Power

```text
CompleteSession
vs
RecordSessionPower
```

---

# 51. Repetir para EquipmentUsage

```text
CompleteSession
vs
RecordSessionEquipmentUsage
```

---

# 52. Repetir para Photo upload finalize

Esse é mais difícil porque R2 é externo.

Se upload começou enquanto Session estava `IN_PROGRESS` e finaliza depois da Session completar, precisamos decidir.

---

# 53. Photo upload race

Sugestão normativa:

```text
upload intent created while IN_PROGRESS
```

pode finalizar depois, porque o fato de captura/upload já foi admitido antes da completion.

Mas uma **nova** photo intent após `COMPLETED` deve ser bloqueada.

Documentar essa semântica.

Não tente cancelar R2 upload já em andamento por race.

---

# 54. Completion precisa olhar somente fotos AVAILABLE no momento da decisão

Se requisito de foto:

```text
PENDING_UPLOAD
```

durante completion:

```text
BLOCKED
```

Mesmo que o upload finalize 100 ms depois.

Caller pode repetir completion.

---

# 55. Isso é seguro e simples

```text
PENDING photo
→ completion BLOCKED

photo becomes AVAILABLE
→ retry CompleteSession
→ READY
```

---

# 56. Intercurrence report race

Se uma nova Intercurrence é reportada enquanto completion ocorre, também precisamos evitar:

```text
Session COMPLETED
+
Intercurrence created afterward
```

sem regra.

ReportIntercurrence precisa usar o mesmo Session writable guard.

---

# 57. Portanto revisar todas as mutations Clinical ligadas à Session

No mínimo:

```text
technical values
power
equipment usage
variation justification
intercurrence report
photo upload intent
```

para garantir que `COMPLETED` realmente encerra a Session.

---

# 58. Não bloquear resolução pós-session necessariamente

`ResolveIntercurrence` pode ser legitimamente executado após Session completion, porque é follow-up clínico.

Então não aplicar guard indiscriminadamente a toda operação.

Separar:

```text
new technical facts during execution
```

de:

```text
post-session follow-up actions
```

---

# 59. Final snapshot?

A Session já possui dados historicamente congelados nos próprios subdomínios.

Não criar um JSON monolítico:

```text
final_session_snapshot
```

sem necessidade.

Completion deve apenas congelar:

```text
status
completedAt
completedBy
```

e usar as linhas históricas existentes.

---

# 60. Audit `SessionCompleted`

Na mesma UnitOfWork:

```text
SessionCompleted
```

Audit metadata:

```text
tenantId
sessionId
appointmentId
professionalId
serviceId
completedAt
correlationId
```

Sem copiar:

```text
technical values
photos
intercurrence descriptions
```

---

# 61. Outbox `SessionCompleted`

Criar fato:

```text
SessionCompleted
```

Payload mínimo:

```text
eventId
tenantId
sessionId
appointmentId
professionalId
serviceId
completedAt
correlationId
```

---

# 62. Não incluir ficha completa no Outbox

Outbox é para integração, não espelho clínico.

---

# 63. Propagação para Operations

PR-16 já estabeleceu:

```text
SessionStarted
→ Appointment IN_PROGRESS
```

Agora adicionar:

```text
SessionCompleted
→ Appointment COMPLETED
```

---

# 64. Criar rota no dispatcher PR-14

Clinical dispatcher:

```text
SessionCompleted
→ Operations Service Binding
```

Reutilizar o mesmo mecanismo de:

```text
claim
lease
retry
ACK-loss
idempotency
```

---

# 65. Operations RPC

Adicionar:

```text
applySessionCompleted(...)
```

ao WorkerEntrypoint Operations.

Contrato em `libs/contracts`.

---

# 66. Criar `ApplySessionCompleted`

Via CLI:

```bash
nest g service \
  appointments/application/apply-session-completed \
  --project operations-worker
```

Responsabilidade:

```text
load Appointment
↓
must be IN_PROGRESS
↓
CAS → COMPLETED
↓
Audit
↓
eventId idempotency
```

---

# 67. Appointment state machine

Adicionar/preservar:

```text
IN_PROGRESS
    ↓ sessionCompleted
COMPLETED
```

Não concluir Appointment diretamente pelo Clinical SQL.

---

# 68. Eventual consistency

Se Clinical concluir Session e Operations estiver indisponível:

```text
Clinical:
  Session COMPLETED
  Outbox SessionCompleted PENDING

Operations:
  Appointment IN_PROGRESS
```

Esse estado temporário é válido.

Depois:

```text
dispatcher
→ ApplySessionCompleted
→ Appointment COMPLETED
→ Outbox SENT
```

---

# 69. Não rollback Session

Se Operations falhar:

```text
Session remains COMPLETED
```

Não volte para `IN_PROGRESS`.

O fato clínico autoritativo já aconteceu.

---

# 70. ACK-loss

Obrigatório testar:

```text
Operations applies SessionCompleted
↓
Clinical markSent fails
↓
redelivery
↓
Operations REPLAY
↓
event SENT
```

Uma única transição lógica.

---

# 71. Event ordering

Pode acontecer redelivery tardia de:

```text
SessionStarted
```

depois de:

```text
SessionCompleted
```

Operations FSM/idempotency precisa impedir retrocesso:

```text
COMPLETED
→ IN_PROGRESS
```

Nunca.

---

# 72. `SessionCompleted` antes de `SessionStarted`?

Em condições normais não deveria ocorrer, mas at-least-once delivery não garante ordering global perfeito.

Operations consumer deve ser robusto.

Opções:

```text
Appointment CHECKED_IN + SessionCompleted
→ reject/retry until SessionStarted
```

ou policy equivalente.

Não pular invariantes silenciosamente.

---

# 73. Classificar erro como retryable quando ordering estiver atrasado

Se:

```text
Appointment CHECKED_IN
```

e chega `SessionCompleted`, pode ser:

```text
TEMPORARY_DEPENDENCY_STATE
```

para retry, caso `SessionStarted` ainda esteja pendente.

Isso é melhor que `DEAD` imediato.

---

# 74. Mas não retry infinito em estado terminal incompatível

Se Appointment:

```text
CANCELED
```

e recebe SessionCompleted:

```text
PERMANENT_REJECTION
```

ou estado de reconciliação manual.

Não ficar repetindo eternamente.

---

# 75. Completion endpoint

Sugestão:

```http
POST /tenants/:tenantId/sessions/:sessionId/complete
```

Response:

```json
{
  "id": "...",
  "status": "COMPLETED",
  "completedAt": "..."
}
```

Sem dados técnicos completos.

---

# 76. Eligibility endpoint

Sugestão:

```http
GET /tenants/:tenantId/sessions/:sessionId/completion-eligibility
```

Response conceitual:

```json
{
  "status": "BLOCKED",
  "reasons": [
    "REQUIRED_PHOTO_MISSING"
  ]
}
```

Não incluir dados clínicos sensíveis desnecessários.

---

# 77. Error mapping

No `POST complete`:

```text
missing technical data → 409
missing equipment → 409
missing photos → 409
invalid Session state → 409
auth → 401
permission → 403
not found → 404
idempotency conflict → 409
unknown → 500 sanitized
```

Seguir a convenção real existente.

---

# 78. Não usar `422` arbitrariamente

Se o projeto consolidou business conflicts como `409`, preservar.

Consistency > preferência pessoal.

---

# 79. Migration `0015`

Talvez seja necessária:

```text
0015_session_completion.sql
```

se `sessions` ainda não possui:

```text
completed_at
completed_by
```

ou algum campo necessário.

Antes de criar:

```bash
grep -n "completed" \
  database/d1/migrations/0010_session_foundation.sql
```

Se já existirem:

```text
sem migration
```

Não criar migration vazia.

---

# 80. Se houver migration

Adicionar somente:

```text
completed_at
completed_by
```

e constraints/índices realmente necessários.

Não adicionar dezenas de summary fields.

---

# 81. Appointment schema

Verificar se Operations já aceita:

```text
COMPLETED
```

no status/constraint.

Se migration anterior tiver CHECK limitado, pode precisar evoluir.

Não ignorar constraint D1.

---

# 82. Query completion eligibility deve ser bounded

Evitar:

```text
load complete session history
```

em cada completion.

Use consultas específicas:

```text
required fields missing?
required equipment count?
required photos count?
intercurrence blocker exists?
```

ou repositories já existentes.

---

# 83. Technical completeness

Uma query pode usar:

```text
field snapshots required
LEFT JOIN current values
```

ou application composition.

Não carregar todas as versões de ficha do Service.

Somente o snapshot da Session.

---

# 84. Photo completeness

D1 metadata apenas:

```text
tenant
session
status=AVAILABLE
purpose
```

Sem R2.

---

# 85. Equipment completeness

`session_equipment_usage` snapshot.

Não consultar status atual do Equipment.

---

# 86. Intercurrence completeness

Consulta bounded:

```text
tenant
session
status=OPEN
```

e flags necessárias.

---

# 87. Free Tier

O `POST complete` é uma operação rara por Session.

Mesmo assim, evitar:

```text
N+1 query por technical field
```

Se ficha tiver 30 campos, não faça 30 SELECTs.

Use query/batch.

---

# 88. Criar uma `SessionCompletionReadModelPort`

Uma boa abstração pode ser:

```text
SessionCompletionReadModelPort
```

que retorna:

```text
technical completeness
equipment state
photo state
intercurrence state
variation state
```

a partir de queries eficientes.

Assim Application não precisa conhecer detalhes SQL.

---

# 89. Não criar materialized read model prematuramente

Pode ser apenas um adapter de leitura agregada sobre D1.

Não precisa de tabela duplicada `session_completion_status`.

---

# 90. Completeness consultiva pode ser recalculada

É uma operação baixa frequência.

Evita inconsistência de projection adicional.

---

# 91. Idempotency replay deve evitar recalcular tudo quando possível

Se:

```text
CompleteSession
same key
COMPLETED
```

e IdempotencyService já tem resultado:

```text
return replay
```

antes de reevaluar completeness.

Isso reduz reads.

---

# 92. Completion result precisa ser armazenável na idempotência

Ao menos:

```text
sessionId
status
completedAt
```

suficiente para replay lógico.

---

# 93. Testes unitários da policy

Cobrir combinações:

```text
all requirements satisfied → READY

technical missing → BLOCKED

equipment required missing → BLOCKED

photo required missing → BLOCKED

session not in progress → BLOCKED
```

E as regras de Intercurrence/variation conforme contrato congelado.

---

# 94. Unit test — optional capabilities

```text
equipment not required
photo not required
```

não devem bloquear.

---

# 95. Unit test — historical configuration

Service atual muda:

```text
requiresPhoto=false → true
```

após Session começar.

A completion precisa usar a regra/snapshot apropriado já congelado para aquela Session, se essa requirement foi snapshotada.

Esse ponto precisa ser verificado.

---

# 96. Se requirements de Service ainda não foram snapshotadas

Esse é um potencial gap arquitetural.

Se Session completion consulta:

```text
current Service.requiresPhoto
```

então uma alteração administrativa pode invalidar retroativamente uma Session em andamento.

Isso conflita com a política histórica do projeto.

---

# 97. PR-21 deve corrigir isso se necessário

Criar no Session ou snapshot técnico algo como:

```text
completionRequirementsSnapshot
```

contendo apenas:

```text
requiresTechnicalForm
requiresPower
requiresEquipment
requiresPhoto
```

conforme regras existentes.

Mas **somente se esses requisitos ainda não estão congelados em outro snapshot**.

Não duplicar estado.

---

# 98. Não snapshotar regras novas

Apenas as já normativas.

---

# 99. Teste histórico de requirement

```text
Session A starts when requiresPhoto=false

Service changes to requiresPhoto=true

Session A completion
→ does not suddenly require photo

Session B starts afterward
→ photo required
```

se essa é a semântica histórica do produto.

Esse é um teste muito importante.

---

# 100. Worker test E2E simples

Fluxo:

```text
CreateAppointment
↓
Confirm
↓
CheckIn
↓
StartSession
↓
Technical fields valid
↓
requirements satisfied
↓
CompleteSession
```

Esperado:

```text
Session COMPLETED
Appointment eventually COMPLETED
```

---

# 101. Worker test — missing technical field

```text
Session IN_PROGRESS
required field absent
```

`POST complete`:

```text
409
Session remains IN_PROGRESS
Audit completion = 0
Outbox SessionCompleted = 0
```

---

# 102. Worker test — missing Equipment

Service requires Equipment:

```text
no EquipmentUsage
```

Completion blocked.

After EquipmentUsage:

```text
completion READY
```

---

# 103. Worker test — missing Photo

Service requires photo:

```text
PENDING_UPLOAD
```

completion blocked.

After:

```text
AVAILABLE
```

completion succeeds.

---

# 104. Worker test — failed Photo

```text
FAILED
```

does not satisfy.

---

# 105. Worker test — historical Equipment inactive

Equipment was used and snapshot exists.

Current Equipment becomes:

```text
INACTIVE
```

Completion still succeeds.

---

# 106. Worker test — Variation Alert

If current MVP says non-blocking:

```text
OPEN variation alert
```

completion still succeeds.

This should be a regression test to prevent accidental policy strengthening.

---

# 107. Worker test — Intercurrence

Use the exact normative rule chosen.

If open intercurrence blocks:

```text
OPEN → blocked
RESOLVED → ready
```

If it does not universally block, prove the more precise rule.

---

# 108. Worker test — idempotency replay

First:

```text
POST complete key=K
→ Session S COMPLETED
```

Replay:

```text
POST complete key=K
→ same S
same completedAt
```

Counts:

```text
Session transition = 1
Audit SessionCompleted = 1
Outbox SessionCompleted = 1
```

---

# 109. Worker test — key conflict

Same key:

```text
Session A
```

then:

```text
Session B
```

→ `IDEMPOTENCY_KEY_CONFLICT`.

---

# 110. Worker test — concurrent completion

For example:

```text
20 Sessions
2 concurrent complete requests each
```

Expected:

```text
20 completed Sessions
0 duplicate completion effects
```

---

# 111. Worker test — post-completion technical mutation

After completion:

```text
RecordSessionTechnicalValues
→ BLOCKED
```

```text
RecordSessionPower
→ BLOCKED
```

```text
RecordSessionEquipmentUsage
→ BLOCKED
```

```text
new Session photo intent
→ BLOCKED
```

```text
ReportIntercurrence
→ BLOCKED
```

when applicable.

---

# 112. Worker test — completion versus technical update

Run concurrent requests.

Invariant:

```text
no technical mutation committed after completion
```

This is a new physical safety proof worth adding to the gate.

---

# 113. Worker test — completion versus EquipmentUsage

Same.

---

# 114. Worker test — completion versus photo intent

At least prove new photo intent cannot start after Session reaches COMPLETED.

---

# 115. SessionCompleted Outbox

After successful completion:

```text
event type = SessionCompleted
status = PENDING
```

Then dispatcher:

```text
→ Operations
```

---

# 116. Operations consumer physical proof

Starting from:

```text
Appointment IN_PROGRESS
```

Apply:

```text
SessionCompleted
```

Expected:

```text
Appointment COMPLETED
```

---

# 117. Consumer replay

Same event:

```text
REPLAY
```

No duplicate Audit effect.

---

# 118. ACK-loss

Operations applies event.

Clinical Outbox stays PROCESSING/PENDING due simulated mark failure.

Redelivery:

```text
Operations replay
Outbox SENT
```

---

# 119. Temporary ordering failure

Simulate:

```text
SessionCompleted arrives while Appointment still CHECKED_IN
```

if `SessionStarted` propagation hasn't converged.

Dispatcher/consumer must treat according to documented retry semantics.

Do not silently complete Appointment from CHECKED_IN unless FSM says it can.

---

# 120. Cross-tenant

Tenant A cannot:

```text
check completion eligibility for Session B
complete Session B
```

Operations cannot apply SessionCompleted event from tenant A to Appointment B.

---

# 121. Professional mismatch

Professional B cannot complete Session A unless an explicit permission allows it.

---

# 122. Audit security

`SessionCompleted` Audit should not contain:

```text
technical values
photo keys
intercurrence description
clinical notes
```

Only safe identifiers/metadata.

---

# 123. Logs

Completion log:

```text
operation=CompleteSession
tenantId
sessionId
professionalId
result
reason codes count
correlationId
duration
```

Do not log the full list of clinical values.

---

# 124. Metrics

Low-cardinality:

```text
session.complete.success
session.complete.blocked
session.complete.replay
session.complete.conflict

session.completed.propagation.success
session.completed.propagation.retry
```

Possible blocked reason category:

```text
technical
equipment
photo
intercurrence
state
```

not session IDs.

---

# 125. Health regression

Clinical `/health` continues without:

```text
D1
R2
Operations RPC
completion evaluation
```

---

# 126. R2 regression

PR-21 does not need to read R2.

Run PR-20 tests to ensure no regressions.

---

# 127. Migration

If needed:

```text
0015_session_completion.sql
```

Test:

```text
0001 → 0015
```

on empty D1.

Then:

```text
No migrations to apply
```

on rerun.

---

# 128. Architecture tests

Prohibit:

```text
SessionCompletionPolicy → D1

SessionCompletionPolicy → R2

Session Domain → Operations

CompleteSession → Cloudflare Service Binding directly
```

Allowed:

```text
CompleteSession
→ CompletionReadModelPort
→ UnitOfWork
→ OutboxWriter
```

Propagation belongs to adapter/dispatcher.

---

# 129. Update contracts

In `libs/contracts`, add only transport contracts for:

```text
SessionCompleted
ApplySessionCompleted
CompletionEligibilityResponse
```

if public/shared contract needed.

Do not share Clinical domain objects.

---

# 130. Update PR-14 routing

Add:

```text
SessionCompleted
→ Operations
```

to known routes.

Do not let a valid event become `DEAD` just because the dispatcher hasn't been updated.

---

# 131. Documentation

Update:

```text
docs/architecture/workers.md
docs/reliability/outbox-delivery.md
```

with:

```text
Clinical SessionCompleted
       ↓
Outbox
       ↓
Operations
       ↓
Appointment COMPLETED
```

---

# 132. Create `gate:pr21`

```bash
npm run gate:pr21
```

If `gate:pr20` already includes all prior gates:

```text
gate:pr21
  → gate:pr20
  → completion unit tests
  → completion worker tests
  → concurrency proof
  → SessionCompleted reconciliation
  → dry-runs
```

---

# 133. Definition of Done — Eligibility

```text
[ ] CheckSessionCompletionEligibility exists

[ ] Session must be IN_PROGRESS

[ ] required technical fields evaluated

[ ] power requirement evaluated when applicable

[ ] equipment requirement evaluated

[ ] photo requirement evaluated

[ ] Intercurrence rule evaluated

[ ] Variation Alerts follow MVP non-blocking rule unless contract says otherwise

[ ] reasons are structured

[ ] GET readiness cannot authorize POST by itself
```

---

# 134. Definition of Done — CompleteSession

```text
[ ] CompleteSession application service

[ ] POST /sessions/:id/complete

[ ] auth

[ ] tenancy

[ ] permission session.complete

[ ] Idempotency-Key

[ ] professional authorization

[ ] server-side completedAt

[ ] server-side completedBy

[ ] Domain FSM used
```

---

# 135. Definition of Done — Persistence

```text
[ ] IN_PROGRESS → COMPLETED via CAS

[ ] only one completion transition

[ ] completion metadata persisted

[ ] tenant-aware

[ ] migration only if needed
```

---

# 136. Definition of Done — Local reliability

```text
[ ] Session transition

[ ] Audit SessionCompleted

[ ] Outbox SessionCompleted

[ ] Idempotency completion

[ ] locally atomic

[ ] failure injection does not leave partial completion
```

---

# 137. Definition of Done — Historical safety

```text
[ ] technical form evaluated from Session snapshot

[ ] equipment historical snapshot preserved

[ ] current Equipment status does not rewrite history

[ ] photo requirement uses Session/service snapshot semantics

[ ] current Service changes do not retroactively change old Session when snapshot exists

[ ] no live-policy drift
```

---

# 138. Definition of Done — Post-completion immutability

```text
[ ] technical value writes blocked

[ ] power writes blocked

[ ] new EquipmentUsage blocked

[ ] new photo intent blocked

[ ] new execution-time Intercurrence blocked

[ ] permitted post-session follow-up operations remain possible where applicable
```

---

# 139. Definition of Done — Concurrency

```text
[ ] complete vs complete physically tested

[ ] complete vs technical save tested

[ ] complete vs power tested

[ ] complete vs EquipmentUsage tested

[ ] no business write commits after Session COMPLETED

[ ] no process-local mutex
```

---

# 140. Definition of Done — Operations propagation

```text
[ ] SessionCompleted contract

[ ] dispatcher route

[ ] ApplySessionCompleted

[ ] Appointment IN_PROGRESS → COMPLETED

[ ] tenant-aware CAS

[ ] eventId idempotency

[ ] replay safe

[ ] ACK-loss safe

[ ] eventual reconciliation
```

---

# 141. Definition of Done — Security

```text
[ ] cross-tenant completion blocked

[ ] unauthorized professional blocked

[ ] caller cannot forge completedBy

[ ] caller cannot forge completedAt

[ ] clinical data absent from logs

[ ] Outbox contains minimal payload
```

---

# 142. Definition of Done — Free tier

```text
[ ] completion uses bounded D1 reads

[ ] no R2 HEAD/GET during completion

[ ] no N+1 per technical field

[ ] no KV

[ ] no Queue added

[ ] no unnecessary Outbox events

[ ] no recomputation of unrelated historical sessions
```

---

# 143. Definition of Done — regressions

```text
[ ] PR-16 StartSession PASS

[ ] PR-17 Technical Forms PASS

[ ] PR-18 Equipment/Variation PASS

[ ] PR-19 Intercurrence PASS

[ ] PR-20 Photos/R2 PASS

[ ] Session start still yields IN_PROGRESS

[ ] photo upload still works before completion

[ ] Clinical restriction propagation unaffected
```

---

# 144. Qualidade final

Executar:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers

npm run gate:pr20
npm run gate:pr21

npm run workers:dry-run
git diff --check
```

Resultado obrigatório:

```text
PASS
```

---

# 145. O que fica explicitamente fora do PR-21

Não implementar agora:

```text
Payment
Receivables

Package consumption
Credit consumption

automatic customer profile transition

Return appointment creation

Return recommendation scheduler

WhatsApp
Email

No-show

Cancellation/refund rules

Session reopening/edit-after-completion workflow

PDF report

clinical document export
```

O PR termina em:

```text
Session = COMPLETED
Appointment = COMPLETED
```

com convergência garantida pelo Outbox.

---

# 146. Relatório pós-implementação esperado

Eu exigiria algo como:

```text
PR-21 — CompleteSession Authoritative Flow + Completion Eligibility

Baseline
PR20 gate:

Completion Eligibility
Session status:
technical fields:
power:
equipment:
photos:
intercurrences:
variation alerts:
reasons:

Historical Rules
technical form snapshot:
equipment snapshot:
service requirement snapshot:
photo requirement:

CompleteSession
HTTP:
permission:
professional authorization:
idempotency:
completedAt:
completedBy:

Persistence
CAS:
migration:
Session result:

Reliability
Audit:
Outbox:
Idempotency:
failure proof:

Post-completion Protection
technical values:
power:
equipment:
photos:
intercurrence:

Concurrency
complete-vs-complete:
complete-vs-technical:
complete-vs-power:
complete-vs-equipment:
post-completion writes:

SessionCompleted Propagation
dispatcher:
Operations RPC:
Appointment CAS:
replay:
ACK-loss:
eventual convergence:

E2E
simple Session:
equipment-required:
photo-required:
intercurrence:
variation alert:
final Session:
final Appointment:

Free Tier
D1 reads:
R2 operations:
Queue:
KV:

Regression
PR16:
PR17:
PR18:
PR19:
PR20:

Quality
unit:
workers:
lint:
typecheck:
dry-runs:
PR21 gate:

Remaining blockers:

Next PR:
```

---

# Depois do PR-21

Com o PR-21 concluído, o núcleo operacional do atendimento estará fechado:

```text
Appointment
    ↓
Deposit
    ↓
Confirmation
    ↓
Check-in
    ↓
Session
    ↓
Technical Form
    ↓
Power
    ↓
Equipment
    ↓
Intercurrence
    ↓
Photos
    ↓
COMPLETED
```

O próximo PR deve então sair do lifecycle clínico e entrar nos efeitos pós-atendimento.

Minha recomendação é:

# PR-22 — Session Completion Effects + Customer History / Return Foundation

Com responsabilidades como:

```text
SessionCompleted
    │
    ├── history/timeline
    ├── completed-session counters
    ├── return recommendation
    ├── customer relationship evolution
    └── package/credit integration ports
```

sem ainda misturar tudo com Payment.

Depois disso, o roadmap pode seguir para:

```text
PR-23
Packages / Credits

PR-24
Payments / Receivables

PR-25
Notifications / reminders
```

O ponto central do **PR-21** é que ele não deve ser apenas um `UPDATE sessions SET status='COMPLETED'`. Ele precisa transformar todas as capabilities criadas nos PRs 17–20 em **pré-condições autoritativas de conclusão**, garantir que a sessão fique imutável para novas mutações técnicas após o fechamento e propagar `SessionCompleted` de forma idempotente e reconciliável para que o Appointment também converja para `COMPLETED`.
