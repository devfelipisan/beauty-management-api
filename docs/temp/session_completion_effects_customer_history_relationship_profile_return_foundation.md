Com o **PR-21 concluído**, o ciclo técnico do atendimento está fechado:

```text
Appointment COMPLETED
Session COMPLETED
Technical data congelado
Equipment registrado
Intercurrences registradas
Photos/R2 disponíveis
```

O próximo PR deve tratar os **efeitos pós-atendimento que pertencem à Fase 5 do MVP**: histórico consolidado, evolução do perfil do cliente e retorno recomendado. A própria priorização coloca `conclusão → histórico → retorno` antes do financeiro básico.  Além disso, a linha do tempo deve consolidar dados operacionais, técnicos, comerciais e financeiros sem perder referências históricas, e o retorno recomendado não pode criar um horário automaticamente. 

# PR-22 — Session Completion Effects + Customer History + Relationship Profile + Return Foundation

O fluxo alvo é:

```text
SessionCompleted
      │
      ├───────────────┐
      │               │
      ▼               ▼
Customer History   Relationship Profile
      │               │
      │               └── NEW → OLD / ASSIDUOUS...
      │
      ▼
Return Recommendation
      │
      ├── NOT_REQUIRED
      └── PENDING
             │
             └── futuramente vinculado a Appointment
```

O PR **não deve ainda implementar Payment nem Package Consumption**. Porém existe um ponto importante: `RN-CONC-002` prevê que conclusão também envolva perfil, pacote, saldo financeiro e retorno em uma única operação lógica. Como Package/Payment ainda não existem, o PR-22 deve registrar explicitamente essa discrepância e **não declarar `RN-CONC-002` totalmente atendida** até os PRs financeiros. 

---

## 1. Baseline obrigatória

Antes de alterar qualquer código:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr19
npm run gate:pr20
npm run gate:pr21
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

Tudo precisa permanecer:

```text
PASS
```

O `SessionCompleted` do PR-21 passa a ser a entrada autoritativa deste PR. Não reabrir o fluxo técnico da Session.

---

# 2. Criar o documento normativo

Criar:

```text
docs/plans/PR-22-session-completion-effects-history-return.md
```

Congelar:

```text
Objective
Current state
SessionCompleted ownership
Completion effects model
Customer history
Relationship profile
Profile policy
Return recommendation
Return lifecycle
Outbox routing
Idempotent projections
Eventual consistency
Authorization
Tenant isolation
Historical integrity
Free-tier strategy
Tests
Definition of Done
Known RN-CONC-002 gap
Out of scope
```

---

# 3. Registrar explicitamente a decomposição de `RN-CONC-002`

A especificação diz que concluir sessão deve atualizar logicamente:

```text
session
appointment
history
customer profile
package consumption
financial balance
recommended return
audit
```

e que falha não deve produzir confirmação parcial. 

Porém, após PR-21 temos Workers separados e consistência eventual:

```text
Clinical
  SessionCompleted
       ↓
Outbox
       ↓
Operations
  Appointment COMPLETED
```

Logo documentar:

```text
Clinical completion fact
        ↓
authoritative and immutable

Completion effects
        ↓
idempotent projections / commands

Package + financial effects
        ↓
PENDING CAPABILITY
```

Não afirmar que uma transação D1 distribuída existe.

---

# 4. Não tentar criar transação distribuída agora

Proibido:

```text
Clinical D1
BEGIN

→ Operations
→ Billing
→ package
→ payment

COMMIT
```

Isso não é atomicidade real.

A arquitetura já consolidou:

```text
local atomicity
+
Outbox
+
at-least-once delivery
+
idempotent consumers
+
reconciliation
```

Preservar esse modelo.

---

# 5. Definir ownership dos novos conceitos

Minha recomendação:

```text
Operations Worker
├── Customer
├── Relationship Profile
├── Customer History projection
└── Return Recommendation
```

Clinical continua proprietário do dado técnico detalhado.

Isso é importante porque:

```text
History
```

não deve signific copiar toda ficha clínica para Operations.

Operations mantém uma **timeline segura e autorizável**, enquanto detalhes clínicos continuam no Clinical.

---

# 6. Não criar um “History aggregate” monolítico

A documentação define histórico como uma linha do tempo consolidada. 

Não significa:

```text
customer_history {
   everything_json
}
```

Evitar esse modelo.

Preferir:

```text
CustomerTimelineEvent
```

como projection leve, apontando para recursos autoritativos.

---

# 7. Criar `CustomerTimelineEvent`

Se não existir:

```bash
nest g class \
  customer-history/domain/customer-timeline-event \
  --project operations-worker \
  --no-spec
```

Conceitualmente:

```text
id
tenantId
customerId

eventType
occurredAt

sourceWorker
sourceAggregateType
sourceAggregateId
sourceEventId

serviceId?
professionalId?

status?
summaryCode?

createdAt
```

Não armazenar ficha técnica completa.

---

# 8. O histórico é uma projection, não a autoridade

Exemplo:

```text
SessionCompleted
```

gera timeline:

```text
type = SESSION_COMPLETED
sourceAggregateId = sessionId
```

Mas detalhes permanecem:

```text
Clinical Session
Technical Form
Power
Photos
Intercurrences
```

---

# 9. Não duplicar fotos ou parâmetros no History

Proibido:

```text
timeline.payload = {
  allTechnicalValues,
  photoKeys,
  intercurrenceDescription
}
```

Além de custo, isso aumenta exposição de dados sensíveis.

A proposta técnica explicitamente evita fichas e fotos completas em auditoria e estruturas de evidência. 

Aplicar a mesma prudência à projection da timeline.

---

# 10. Eventos que a timeline deverá suportar gradualmente

A regra define:

```text
cadastro
perfil
avaliações
agendamentos
sinais
confirmações
reagendamentos
cancelamentos
faltas
sessões
parâmetros
potência
equipamentos
fotos
intercorrências
pacotes
pagamentos
descontos
créditos
retornos
```



Mas PR-22 não precisa reconstruir tudo retroativamente de uma vez.

---

# 11. Escopo inicial da timeline

Materializar primeiro eventos já disponíveis:

```text
AppointmentCreated
AppointmentConfirmed
AppointmentCheckedIn
SessionStarted
SessionCompleted

DepositConfirmed
DepositExpired

ClinicalRestrictionActivated
ClinicalRestrictionResolved

IntercurrenceReported/Resolved
quando houver contrato seguro

ReturnRecommended
RelationshipProfileChanged
```

Somente os que possuem fonte real.

---

# 12. Não inventar histórico de Payment/Package

Ainda não existem.

Timeline simplesmente não terá esses eventos até seus PRs.

Isso é melhor que placeholders falsos.

---

# 13. Criar migration `0016`

Se `0015` é a última real:

```text
database/d1/migrations/
0016_customer_history_profile_return.sql
```

Tabelas provavelmente:

```text
customer_timeline_events

return_recommendations

relationship_profile_policies
relationship_profile_history
```

ou estrutura equivalente às regras reais.

---

# 14. `customer_timeline_events`

Sugestão:

```text
id
tenant_id
customer_id

event_type
occurred_at

source_event_id
source_aggregate_type
source_aggregate_id

service_id
professional_id

summary_code

created_at
```

Constraint importante:

```text
UNIQUE (
  tenant_id,
  source_event_id
)
```

para consumo idempotente de Outbox.

---

# 15. Não guardar `event_type` completamente livre

Criar catálogo compartilhado de eventos reconhecidos.

Mas não transformar o core em um mega-enum acoplado a todos os Workers.

Pode existir um contrato de integration events.

---

# 16. Criar `CustomerTimelineRepository`

```bash
nest g interface \
  customer-history/ports/customer-timeline-repository \
  --project operations-worker
```

Operações:

```text
append
findByCustomer
```

e query paginada/filtrada.

Não permitir update/delete normal.

---

# 17. Timeline deve ser append-only

Histórico não deve perder referências quando cadastros forem inativados. 

Logo:

```text
timeline event
```

não é reescrito porque:

```text
Service INACTIVE
Professional INACTIVE
Customer profile changed
```

---

# 18. D1 adapter

```bash
nest g provider \
  customer-history/adapters/d1-customer-timeline-repository \
  --project operations-worker
```

Queries sempre:

```text
tenant + customer
```

---

# 19. Ordenação

`RN-HIS-002`:

```text
date/time
```



Consulta:

```text
ORDER BY occurred_at DESC, id DESC
```

ou direção escolhida pelo contrato.

Não ordenar por insertion id como única referência temporal.

---

# 20. Paginação obrigatória

Nunca:

```text
GET customer history
→ entire lifetime
```

Usar:

```text
limit
cursor
```

ou paginação padrão atual.

Isso importa para D1 Free.

---

# 21. Filtros

A regra exige filtro por:

```text
period
service
professional
event type
status
unit
```



Neste PR implementar aqueles cujos campos realmente existem.

Se `unit` ainda não está materializado:

```text
UNIT_FILTER_NOT_AVAILABLE
```

não inventar coluna sem contexto.

---

# 22. Criar endpoint

Algo como:

```http
GET /tenants/:tenantId/customers/:customerId/history
```

Query:

```text
from
to
serviceId
professionalId
eventType
cursor
limit
```

---

# 23. Permissões distintas

`RN-HIS-004` exige permissões diferentes para dados:

```text
technical
financial
personal
```



Portanto não fazer:

```text
customer.history.read
→ sees everything
```

sem filtragem.

---

# 24. Timeline deve devolver referências, não detalhes sensíveis

Recepção pode receber:

```text
SessionCompleted
date
professional
service
```

mas não:

```text
technical values
intercurrence description
photo
```

Profissional autorizado pode abrir o detalhe no Clinical.

---

# 25. Criar URLs/links internos?

O Backend pode retornar:

```text
resourceType
resourceId
```

Não precisa fabricar URL pública.

Frontend/BFF decide navegação.

---

# 26. Agora o Relationship Profile

O produto define inicialmente:

```text
NEW
OLD
ASSIDUOUS
INACTIVE
RECURRENT_NO_SHOW
```

equivalentes a:

```text
Novo
Antigo
Assíduo
Inativo
Com faltas recorrentes
```



Use os nomes canônicos já existentes no projeto.

Não criar enum duplicada.

---

# 27. Perfil atual não deve ser calculado no Billing

Operations é authority.

Billing apenas recebe snapshot no cálculo comercial, como já consolidado.

---

# 28. Perfil precisa de política explícita

Os critérios devem poder evoluir e ser configurados. O documento dá exemplos como:

```text
Novo:
  0 atendimentos concluídos

Antigo:
  >= 1 atendimento concluído

Assíduo:
  recorrência suficiente
```

mas valores de frequência/período são configuráveis. 

Logo não hardcode:

```text
3 sessions / 6 months
```

como regra eterna apenas porque aparece como exemplo.

---

# 29. Criar `RelationshipProfilePolicy`

Policy pura:

```text
CustomerRelationshipFacts
+
TenantRelationshipPolicy
        ↓
RelationshipProfile
```

---

# 30. Facts necessários

Por exemplo:

```text
completedSessionsCount
lastCompletedSessionAt

noShowCountInConfiguredWindow
cancellationCountInConfiguredWindow
```

Não consultar tabela inteira.

---

# 31. Primeiro efeito obrigatório do `SessionCompleted`

Mesmo antes das políticas avançadas:

```text
NEW
+
first completed session
        ↓
OLD
```

Essa transição é claramente sustentada pelo produto: `Novo` é quem ainda não possui atendimento concluído; `Antigo` já possui pelo menos um. 

---

# 32. Não transformar todo cliente antigo em ASSIDUOUS

Só se a policy configurada determinar.

Fail-closed para policy sofisticada inexistente.

---

# 33. Perfil `INACTIVE`

Não deve ser calculado imediatamente por `SessionCompleted`.

Inatividade depende de:

```text
tempo sem retornar
```

Logo será eventualmente um job diário, como a proposta técnica sugere para classificação de inatividade. 

PR-22 pode preparar a policy, mas não criar Cron.

---

# 34. `RECURRENT_NO_SHOW`

Também depende do fluxo de falta/cancelamento, ainda incompleto.

Não force essa classificação a partir de SessionCompleted.

---

# 35. Portanto, PR-22 precisa ser incremental

No `SessionCompleted`:

```text
NEW → OLD
```

é efeito mínimo seguro.

Demais transições:

```text
OLD ↔ ASSIDUOUS
INACTIVE
RECURRENT_NO_SHOW
```

só quando os fatos e políticas necessários existirem.

---

# 36. Criar histórico do perfil

Não sobrescrever apenas:

```text
customers.relationship_profile
```

sem histórico.

Criar:

```text
relationship_profile_history
```

com:

```text
tenantId
customerId

previousProfile
newProfile

reasonCode
sourceEventId

changedAt
```

---

# 37. `CustomerProfileChanged` deve ser auditável

A documentação já lista alteração/reclassificação entre eventos auditáveis. 

Audit:

```text
customer.profile.changed
```

Metadata segura:

```text
customerId
previousProfile
newProfile
reasonCode
sourceEventId
```

---

# 38. Não gerar audit se perfil não mudou

Se:

```text
OLD → OLD
```

nenhum `CustomerProfileChanged`.

---

# 39. Consumer de `SessionCompleted`

Hoje o mesmo evento já vai para Operations para:

```text
Appointment IN_PROGRESS → COMPLETED
```

Não criar um segundo delivery do mesmo evento desnecessariamente.

Evoluir o consumer Operations.

---

# 40. Mas cuidado com atomicidade interna Operations

Ao consumir `SessionCompleted`, Operations agora precisa aplicar:

```text
Appointment COMPLETED
Customer timeline SessionCompleted
profile recalculation
```

Possivelmente:

```text
return foundation
```

se retorno vier no evento.

Esses efeitos podem ser agrupados na UnitOfWork Operations.

---

# 41. Isso é uma melhoria importante

O consumer pode executar:

```text
BEGIN logical D1 batch

Appointment transition
Timeline append
Profile projection/history
Audit(s)
event idempotency

COMMIT
```

Isso fornece atomicidade local no bounded context.

---

# 42. Não duplicar Appointment completion

O `ApplySessionCompleted` do PR-21 já existe.

Não criar:

```text
ApplySessionCompletedV2
```

Evoluir o application service ou criar um coordinator:

```text
ApplySessionCompletedEffects
```

que reutilize a transição existente.

---

# 43. Preferência arquitetural

Eu criaria:

```text
HandleSessionCompleted
```

como application coordinator Operations.

Ele chama capacidades internas:

```text
AppointmentCompletionProjection
CustomerTimelineWriter
RelationshipProfileRecalculator
```

Tudo via ports/contexto transacional.

---

# 44. Não colocar tudo dentro de `AppointmentService`

Preservar SRP.

---

# 45. Replay do `SessionCompleted`

O mesmo `eventId` entregue novamente:

```text
Appointment stays COMPLETED
Timeline event count stays 1
Profile transition count stays 1
```

Essa prova é obrigatória.

---

# 46. ACK-loss continua seguro

PR-14 já cobre redelivery.

Agora provar que **todos os novos completion effects** também são idempotentes.

---

# 47. Return Recommendation

A documentação é explícita:

```text
professional may define:
- need for return
- interval
- suggested date
- reason
- observation
```

e a recomendação **não cria automaticamente um Appointment**. Enquanto não houver agendamento, fica pendente. A data originalmente recomendada deve permanecer no histórico. 

---

# 48. Ownership do retorno

Eu colocaria:

```text
Operations Worker
```

porque Return é:

```text
post-session commercial/operational follow-up
```

e posteriormente será convertido em Appointment.

Clinical pode ser a origem da recomendação, porque é o profissional quem decide.

---

# 49. Como transportar a recomendação

Há duas opções:

### A — definir retorno antes de completar a Session

Clinical persiste recomendação junto à Session.

### B — comando separado pós-completion

Eu recomendo **B neste PR**, porque PR-21 já está concluído e não devemos reabrir seu body sem necessidade.

---

# 50. Criar `RecommendReturn`

Pode ficar no Clinical como intenção profissional que produz evento, ou diretamente Operations via authenticated endpoint.

Minha preferência:

```text
Clinical
  professional context
        ↓
RecommendReturn
        ↓
Outbox ReturnRecommended
        ↓
Operations
ReturnRecommendation projection/domain
```

Isso preserva que a recomendação é um fato técnico do profissional.

---

# 51. Porém existe uma alternativa mais simples

Como Return não possui dado clínico sensível por natureza, também pode existir diretamente no Operations endpoint:

```http
POST /tenants/:tenantId/sessions/:sessionId/return-recommendation
```

mas Operations não é owner da Session.

Isso exigiria RPC para Clinical validar Session/profissional.

Mais acoplamento.

Logo **Clinical origin + Operations projection** é mais consistente com a arquitetura atual.

---

# 52. Criar domínio `ReturnRecommendation` em Operations

```bash
nest g class \
  returns/domain/return-recommendation \
  --project operations-worker \
  --no-spec
```

Campos:

```text
id
tenantId

customerId
sessionId
serviceId
professionalId

status

recommendedAt
recommendedFor

intervalValue?
intervalUnit?

reason?
observation?

appointmentId?

createdAt
convertedAt?
```

---

# 53. Estados mínimos

```text
PENDING
CONVERTED
CANCELED
```

somente se cancelamento estiver normativamente necessário.

O indispensável é:

```text
PENDING
CONVERTED
```

---

# 54. `recommendedFor` é histórico

Quando a recepção agendar em outra data:

```text
recommendedFor
```

não muda.

RN-RET-005 exige preservar a data original. 

---

# 55. Não criar Appointment automaticamente

Proibido:

```text
ReturnRecommended
→ CreateAppointment
```

O cliente precisa escolher horário. 

---

# 56. Intervalo e data sugerida

Se profissional fornecer:

```text
interval = 30 days
```

e não `recommendedFor`, o sistema pode calcular data sugerida se essa semântica estiver definida.

Não aceite valores ambíguos como:

```text
"1 month"
```

sem normalização.

---

# 57. Talvez armazenar ambos

```text
intervalDays
recommendedFor
```

é simples para MVP, se a regra trabalha em dias.

Mas não hardcode dias se o contrato atual prevê semanas/meses.

Use representação explícita.

---

# 58. `recommendedAt`

Server-side.

---

# 59. Endpoint Clinical para recomendação

Algo como:

```http
POST /tenants/:tenantId/sessions/:sessionId/return-recommendation
```

Com:

```json
{
  "required": true,
  "interval": {
    "value": 30,
    "unit": "DAY"
  },
  "recommendedFor": "...",
  "reason": "...",
  "observation": "..."
}
```

A forma final deve seguir os contratos existentes.

---

# 60. E quando retorno não é necessário?

Pode registrar explicitamente:

```text
RETURN_NOT_REQUIRED
```

ou simplesmente não criar recomendação.

A regra fala que o profissional “poderá definir necessidade de retorno”.

Eu prefiro que o comando permita:

```text
required=false
```

para registrar a decisão clínica quando necessário, sem criar `PENDING`.

---

# 61. Não exigir Return para concluir Session retroativamente

PR-21 já está operacional.

Não modificar agora:

```text
CompleteSession
→ return recommendation required
```

salvo se a regra normativa atual exigia e houve gap explícito.

---

# 62. Mas registrar discrepância

`RN-CONC-001` inclui retorno entre as verificações antes da conclusão. 

O relatório do PR-21 não mencionou retorno como blocker.

Logo PR-22 precisa documentar:

```text
CURRENT GAP:
RN-CONC-001 return requirement not fully modeled
```

e decidir a semântica correta antes de declarar a conclusão totalmente normativa.

---

# 63. Minha recomendação para resolver sem quebrar PR-21

Adicionar ao snapshot/configuração da Session:

```text
requiresReturnDecision?
```

somente se existir configuração normativa.

Se não existir, interpretar “retorno” como campo profissional opcional:

```text
decision optional
```

Não bloquear todas as conclusões.

---

# 64. Evento `ReturnRecommended`

Clinical Outbox:

```text
ReturnRecommended
```

Payload mínimo:

```text
eventId
tenantId
sessionId
customerId
serviceId
professionalId
recommendedFor
interval
correlationId
```

Não enviar observação clínica completa se não for necessária no Operations.

---

# 65. Reason/observation

Se Operations precisa mostrar a informação à recepção, pode carregar uma versão permitida.

Mas trate como dado potencialmente sensível.

Preferível:

```text
reasonCode
```

e Clinical detail por RPC quando necessário, se houver dados clínicos.

---

# 66. PR-14 dispatcher ganha route

```text
ReturnRecommended
→ Operations
```

Reutilizando:

```text
claim
lease
retry
eventId
ACK-loss
```

---

# 67. Consumer Operations

Criar:

```bash
nest g service \
  returns/application/apply-return-recommended \
  --project operations-worker
```

Idempotente por:

```text
eventId
```

---

# 68. Um Session pode ter mais de uma recomendação?

Normalmente deve existir uma recomendação atual autoritativa por Session.

Usar proteção:

```text
UNIQUE (tenant_id, session_id)
```

se o contrato não prevê múltiplas revisões.

---

# 69. Alteração de recomendação

Se profissional corrigir a recomendação, precisamos preservar original.

Não sobrescrever silenciosamente.

Para MVP, pode haver:

```text
revision
```

ou histórico append-only.

Mas se update não está no escopo, simplesmente não criar endpoint de edição ainda.

---

# 70. Conversão em Appointment

`RN-RET-004` exige associação quando Appointment for criado. 

Não precisa implementar criação automática.

Mas PR-22 deve preparar:

```text
returnRecommendationId?
```

no `CreateAppointmentCommand`.

---

# 71. Eu implementaria a conversão no mesmo PR

Quando recepção decide criar agendamento a partir de retorno:

```text
POST /tenants/:tenantId/returns/:returnId/appointments
```

poderia chamar o mesmo `CreateAppointment`.

Mas isso aumenta escopo.

---

# 72. Melhor fatiamento

Neste PR:

```text
ReturnRecommendation PENDING
```

e port/campo para conversão futuro.

No PR de agenda avançada:

```text
ConvertReturnToAppointment
```

fica implementado.

---

# 73. Endpoint de returns pendentes

Para recepção:

```http
GET /tenants/:tenantId/returns?status=PENDING
```

Com filtros:

```text
dueFrom
dueTo
customerId
professionalId
serviceId
```

Bounded/paginado.

Isso habilita a futura tela “retornos próximos/atrasados”.

---

# 74. Retorno atrasado

Não precisa criar scheduler ainda.

Pode derivar na query:

```text
PENDING
AND recommendedFor < now
→ overdue=true
```

Sem mutation.

---

# 75. Isso economiza writes

Para Free Tier:

```text
overdue
```

pode ser projeção temporal na leitura.

O job diário de notificações virá depois.

---

# 76. Customer History deve incluir ReturnRecommended

Quando ReturnRecommendation for criada:

```text
timeline event
RETURN_RECOMMENDED
```

com:

```text
recommendedFor
```

permitido como metadata operacional.

---

# 77. Quando for convertida futuramente

Timeline terá:

```text
RETURN_CONVERTED_TO_APPOINTMENT
```

sem alterar o evento original.

---

# 78. Relationship Profile + History devem usar `SessionCompleted`

O principal consumer deve ser determinístico:

```text
SessionCompleted eventId X
```

gera no máximo:

```text
1 Appointment completion projection
1 Session timeline event
0..1 profile transition
```

---

# 79. Não contar Session duas vezes

O replay do Outbox não pode incrementar:

```text
completedSessionsCount
```

novamente.

Esse é um teste crítico.

---

# 80. Como calcular contagem

Evite contador mutável sem garantia.

Opções:

```text
COUNT timeline/session completed events
```

ou projection counter com sourceEvent uniqueness.

Para volume MVP, uma query indexada pode bastar.

---

# 81. Mas Profile calculation frequente pode ficar caro

Uma `customer_relationship_stats` projection é razoável:

```text
completed_sessions_count
last_completed_at
no_show_count_window...
```

Atualizada idempotentemente por eventos.

---

# 82. Criar projection somente se necessária

Não materializar dezenas de métricas.

Para este PR:

```text
completedSessionsCount
lastCompletedSessionAt
```

são suficientes para `NEW → OLD`.

---

# 83. Migration pode conter

```text
customer_relationship_stats
```

com:

```text
tenant_id
customer_id
completed_sessions_count
last_completed_session_at
updated_at
```

---

# 84. Proteger contador contra replay

Nunca:

```sql
UPDATE stats
SET completed_sessions_count = completed_sessions_count + 1
```

antes de garantir evento não consumido.

O `eventId`/idempotency e UnitOfWork devem assegurar:

```text
one event → one increment
```

---

# 85. Melhor ainda

Dentro da UnitOfWork:

```text
consume event idempotency
timeline insert UNIQUE source_event_id
stats increment
profile evaluation
```

Tudo local.

---

# 86. CAS de Profile

Se duas SessionCompleted do mesmo Customer chegam concorrentemente, evitar lost update.

Pode usar:

```text
conditional update
```

ou serialização natural do D1 transaction/batch strategy.

Precisa de teste físico.

---

# 87. Concurrency importante

Duas sessions do mesmo Customer concluídas quase simultaneamente.

Expected:

```text
completedSessionsCount = 2
not 1
not 3
```

---

# 88. Perfil após duas sessões

Depende da policy.

Se apenas NEW/OLD está habilitado:

```text
NEW → OLD
OLD → OLD
```

Sem eventos redundantes.

---

# 89. Tenant isolation

Customer A/Tenant A nunca recebe:

```text
SessionCompleted Tenant B
Return Tenant B
Timeline Tenant B
Profile facts Tenant B
```

Todos os repositories:

```text
tenant + entity
```

---

# 90. Timeline permissions — recepção

Recepção pode ver:

```text
appointment
confirmation
return
basic session occurrence
commercial events
```

Não necessariamente:

```text
technical parameter values
clinical descriptions
private photos
```

---

# 91. Timeline permissions — profissional

Profissional autorizado pode acessar:

```text
technical event links
```

e então abrir detalhes no Clinical.

---

# 92. Financeiro ainda não existe

Timeline architecture precisa aceitar futuros:

```text
PaymentRegistered
Refund
Credit
PackageConsumed
```

mas nenhum deve ser fake neste PR.

---

# 93. Não criar integração financeira vazia

Sem:

```text
ledger balance = 0
```

como “feito”.

Isso esconderia capabilities ausentes.

---

# 94. Criar explicitamente `CompletionEffectsStatus`?

Pode ser útil para readiness global:

```text
HISTORY_APPLIED
PROFILE_APPLIED
RETURN_DECISION...
PACKAGE_PENDING_CAPABILITY
FINANCIAL_PENDING_CAPABILITY
```

Mas não crie state machine excessiva.

Uma documentação/gate pode ser suficiente por enquanto.

---

# 95. `RN-CONC-002` permanece parcialmente atendida

Ao final do PR-22:

```text
session                 PASS
appointment             PASS
history                 PASS
customer profile        PASS
return recommendation   PASS/foundation

package consumption     PENDING
financial balance       PENDING
audit                   PASS
```

Documentar isso claramente.

---

# 96. Teste principal: first completion updates profile

Fixture:

```text
Customer profile = NEW
completedSessionsCount = 0
```

Deliver:

```text
SessionCompleted
```

Esperado:

```text
completedSessionsCount = 1
profile = OLD
timeline contains SESSION_COMPLETED
Audit contains CustomerProfileChanged
```

---

# 97. Replay do mesmo event

Entregar novamente.

Esperado:

```text
completedSessionsCount = 1
timeline events = 1
profile history = 1
```

---

# 98. Second different SessionCompleted

Esperado:

```text
count = 2
profile remains OLD
```

salvo policy configurada que determine ASSIDUOUS.

---

# 99. Profile policy configured

Se a empresa define critério de assiduidade compatível e dados suficientes:

```text
OLD → ASSIDUOUS
```

Pode ser testado.

Mas não hardcode threshold global.

---

# 100. Primeiro histórico

Consultar:

```http
GET /tenants/:tenantId/customers/:customerId/history
```

Esperado:

```text
SESSION_COMPLETED
```

com:

```text
occurredAt
serviceId
professionalId
resource/session reference
```

Sem conteúdo técnico.

---

# 101. Timeline ordering test

Inserir eventos em tempos diferentes.

Resultado deve respeitar:

```text
occurredAt
```

não insertion order.

---

# 102. Timeline pagination test

Exemplo:

```text
25 events
limit=10
```

Pages:

```text
10
10
5
```

Sem duplicação/skip.

---

# 103. Filter test

```text
eventType=SESSION_COMPLETED
```

retorna somente sessões concluídas.

---

# 104. Cross-tenant history test

Manipular customerId/path.

Resultado:

```text
403/404
```

conforme contrato, nunca dados de outro tenant.

---

# 105. Permission test

Recepção consulta history.

Evento técnico deve estar sanitizado.

Profissional autorizado consegue obter referência técnica.

---

# 106. Return recommendation test

Session COMPLETED.

Professional autorizado executa:

```text
RecommendReturn
```

Resultado Clinical:

```text
ReturnRecommended Outbox
```

Operations:

```text
ReturnRecommendation PENDING
```

---

# 107. Não criar Appointment

Após recomendação:

```text
appointments count unchanged
```

Prova explícita de `RN-RET-002`. 

---

# 108. Suggested date remains original

Mesmo se:

```text
today changes
```

ou policy muda, `recommendedFor` persistida não muda.

---

# 109. Return appears in history

Timeline:

```text
RETURN_RECOMMENDED
```

ordenado corretamente.

---

# 110. Return pending query

```text
GET /returns?status=PENDING
```

retorna recomendação.

Se:

```text
recommendedFor < now
```

pode retornar:

```text
overdue=true
```

sem alterar status.

---

# 111. Replay ReturnRecommended

Mesmo `eventId`:

```text
one ReturnRecommendation
one timeline event
```

---

# 112. Idempotência do comando Clinical

Mesma:

```text
Idempotency-Key
same Session
```

→ mesmo fato lógico.

---

# 113. Different hash

Conflito.

---

# 114. Professional mismatch

Outro profissional não recomenda retorno sobre Session alheia sem permission adequada.

---

# 115. Return recommendation só após conclusão?

O fluxo de documentação diz “profissional conclui a sessão, define necessidade de retorno”. 

Logo neste PR exigir:

```text
Session = COMPLETED
```

para o comando pós-sessão.

Isso é coerente com PR-21.

---

# 116. Não reabrir Session para recomendar retorno

Return é entidade separada.

---

# 117. Eventual consistency

Clinical cria ReturnRecommended.

Operations indisponível:

```text
Outbox PENDING
```

Recommendation projection ainda ausente.

Dispatcher posterior converge.

Não rollback da decisão profissional.

---

# 118. ACK-loss do retorno

Mesmo padrão:

```text
Operations creates ReturnRecommendation
mark SENT fails
redelivery
Operations REPLAY
```

um único registro.

---

# 119. History source event identity

Use sempre:

```text
sourceEventId
```

e não apenas:

```text
sourceAggregateId
```

porque a mesma aggregate gera múltiplos eventos.

---

# 120. Não transformar Audit em Timeline

Audit e History são diferentes:

```text
Audit
→ evidência de quem fez o quê

Customer Timeline
→ visão funcional da jornada
```

Não consultar tabela de Audit e expor isso como histórico do cliente.

---

# 121. Não transformar Timeline em Audit

Timeline pode ser uma projection reconstruível.

Audit continua append-only authoritative evidence.

---

# 122. Observabilidade

Consumer `SessionCompleted`:

```text
operation=HandleSessionCompletedEffects
tenantId
customerId
eventId
timelineResult
profileResult
duration
correlationId
```

Não logar:

```text
technical values
photos
clinical content
```

---

# 123. Metrics

Low-cardinality:

```text
customer.history.event.applied
customer.profile.changed
customer.profile.unchanged

return.recommended
return.propagation.retry
```

---

# 124. Free Tier

History list:

```text
D1 indexed pagination
```

Não construir timeline chamando:

```text
Operations
→ Clinical
→ Billing
→ multiple tables
```

a cada GET.

A projection existe justamente para isso.

---

# 125. Isso é especialmente importante

Sem projection, um histórico completo poderia gerar:

```text
many D1 reads
multiple RPCs
R2 lookups
```

e prejudicar o plano Free.

Com:

```text
customer_timeline_events
```

a tela inicial usa uma única query bounded.

Detalhes são lazy-loaded.

---

# 126. R2 continua lazy

Timeline de Photo:

```text
PHOTO_ADDED
```

não carrega imagem.

Usuário abre detalhe:

```text
Clinical private R2 endpoint
```

---

# 127. Migration indexes

Provavelmente:

```text
customer_timeline_events(
  tenant_id,
  customer_id,
  occurred_at DESC
)

customer_timeline_events(
  tenant_id,
  customer_id,
  event_type,
  occurred_at DESC
)

return_recommendations(
  tenant_id,
  status,
  recommended_for
)

customer_relationship_stats(
  tenant_id,
  customer_id
)
```

Não adicionar todos sem verificar query plan.

---

# 128. `EXPLAIN QUERY PLAN`

Testar:

```text
history main query
history event filter
pending returns
```

quando possível.

---

# 129. Nenhum R2 write novo

PR-22:

```text
R2 operations = 0
```

---

# 130. Nenhum KV

Não necessário.

---

# 131. Nenhuma Queue

Reutilizar Outbox dispatcher PR-14.

---

# 132. Nenhum Cron

Inactivity/overdue notification virão futuramente.

Retorno atrasado pode ser derivado na leitura.

---

# 133. Gate `pr22`

Criar:

```bash
npm run gate:pr22
```

Preferencialmente:

```text
gate:pr21
+
history tests
+
profile tests
+
return tests
+
SessionCompleted effects concurrency
+
outbox reconciliation
+
dry-runs
```

---

# 134. Definition of Done — History

```text
[ ] CustomerTimelineEvent model

[ ] append-only projection

[ ] sourceEventId idempotency

[ ] tenant-owned

[ ] customer-owned

[ ] occurredAt ordering

[ ] pagination

[ ] filters supported where capabilities exist

[ ] inactive resources do not erase history

[ ] technical/financial/personal permission separation

[ ] no full clinical payload duplication
```

---

# 135. Definition of Done — SessionCompleted effects

```text
[ ] existing ApplySessionCompleted preserved/evolved

[ ] Appointment completion still applied

[ ] SESSION_COMPLETED timeline event

[ ] relationship stats updated

[ ] profile policy evaluated

[ ] customer profile history created only on change

[ ] all local Operations effects idempotent

[ ] same event replay causes zero duplicate effects
```

---

# 136. Definition of Done — Relationship Profile

```text
[ ] existing profile enum reused

[ ] NEW = no completed session semantics preserved

[ ] first completed session can produce NEW → OLD

[ ] no hardcoded ASSIDUOUS threshold without config

[ ] INACTIVE not recalculated synchronously without temporal policy

[ ] RECURRENT_NO_SHOW not inferred from completion

[ ] profile change audited

[ ] profile history preserved
```

---

# 137. Definition of Done — Return

```text
[ ] ReturnRecommendation domain

[ ] recommendation originates from authorized professional

[ ] Session COMPLETED required

[ ] need-for-return supported

[ ] interval supported

[ ] suggested date supported

[ ] reason/observation handled safely

[ ] PENDING status

[ ] no automatic Appointment

[ ] original recommended date immutable

[ ] ReturnRecommended event

[ ] Operations idempotent consumer

[ ] return appears in customer history
```

---

# 138. Definition of Done — Eventual consistency

```text
[ ] SessionCompleted redelivery safe

[ ] ReturnRecommended redelivery safe

[ ] Operations outage leaves Outbox recoverable

[ ] ACK-loss safe

[ ] no distributed transaction claims

[ ] eventual convergence proven
```

---

# 139. Definition of Done — Concurrency

```text
[ ] concurrent SessionCompleted effects for same customer tested

[ ] completed session count correct

[ ] no lost profile update

[ ] no duplicate timeline events

[ ] no duplicate profile history

[ ] no in-memory mutex
```

---

# 140. Definition of Done — Security

```text
[ ] history endpoint authenticated

[ ] tenant membership checked

[ ] customer tenant ownership checked

[ ] history fields filtered by permission

[ ] return recommendation professional-authorized

[ ] cross-tenant returns blocked

[ ] clinical details absent from logs/timeline projection
```

---

# 141. Definition of Done — Free-first

```text
[ ] history is read from bounded D1 projection

[ ] pagination mandatory

[ ] no runtime aggregation across all Workers

[ ] no R2 access for history list

[ ] no KV

[ ] no Queue

[ ] no Cron required

[ ] return pending query indexed
```

---

# 142. Definition of Done — normative-gap documentation

O relatório deve incluir explicitamente:

```text
RN-CONC-002

Session                  PASS
Appointment              PASS
History                  PASS
Customer profile         PASS
Return recommendation    PASS / FOUNDATION

Package consumption      NOT IMPLEMENTED
Financial balance        NOT IMPLEMENTED

RN-CONC-002 FULL         NOT YET
```

Isso é importante porque a documentação normativa exige pacote e saldo financeiro como parte dos efeitos da conclusão. 

---

# 143. Regressões

```text
[ ] PR-17 technical data PASS
[ ] PR-18 equipment/variation PASS
[ ] PR-19 intercurrence/restrictions PASS
[ ] PR-20 photos/R2 PASS
[ ] PR-21 CompleteSession PASS

[ ] Session still COMPLETED once
[ ] Appointment still converges to COMPLETED
[ ] no technical mutation after completion
```

---

# 144. Qualidade final

Executar:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers

npm run gate:pr21
npm run gate:pr22

npm run workers:dry-run
git diff --check
```

Tudo:

```text
PASS
```

---

# 145. Relatório esperado do Codex

```text
PR-22 — Session Completion Effects + Customer History + Relationship Profile + Return Foundation

Baseline
PR21:

SessionCompleted Effects
appointment:
history:
relationship stats:
profile:
idempotency:

Customer History
projection:
ordering:
pagination:
filters:
permissions:
historical references:

Relationship Profile
current:
completed session facts:
NEW → OLD:
assiduous policy:
inactive:
recurrent no-show:
profile history:
audit:

Return Recommendation
Clinical command:
Session completed check:
professional authorization:
interval:
recommended date:
pending state:
automatic appointment:
outbox:
Operations projection:
history:

Reliability
eventId:
replay:
ACK-loss:
concurrency:
eventual consistency:

Security
tenant:
history visibility:
technical data:
PII/logging:

Free Tier
D1 reads:
pagination:
RPCs per history list:
R2:
KV:
Queue:
Cron:

RN-CONC-002
session:
appointment:
history:
profile:
return:
package:
financial balance:
full compliance:

Regression
PR17:
PR18:
PR19:
PR20:
PR21:

Quality
unit:
workers:
lint:
typecheck:
dry-runs:
PR22 gate:

Remaining blockers:

Next PR:
```

---

# O que explicitamente NÃO entra no PR-22

Não implementar:

```text
Package purchase
Package consumption
Package expiration

Payment
Partial payment
Refund
Credit
Ledger

No-show
Cancellation
Rescheduling

Return → automatic appointment

Return notifications

WhatsApp
Email

customer inactivity Cron
```

---

# Próximo PR depois do PR-22

Aqui eu ajustaria o roadmap anterior com base na documentação normativa.

Após histórico/perfil/retorno, a próxima lacuna importante não deveria ser Payment diretamente. A especificação exige que a conclusão possa consumir pacote e que duplo clique não consuma duas unidades.  A proposta técnica também modela `SESSION → PACKAGE_MOVEMENT` e cita bloqueio do pacote durante conclusão.

Portanto:

# PR-23 — Packages + Credits Foundation + Idempotent Session Consumption

Depois:

```text
PR-24 — Payment + Ledger + Partial Payment Foundation
```

e então será possível fechar de maneira muito mais fiel:

```text
RN-CONC-002
```

A sequência recomendada passa a ser:

```text
PR-21
CompleteSession
      ↓
PR-22
History
+ Relationship Profile
+ Return
      ↓
PR-23
Packages
+ Package Movements
+ Session Consumption
      ↓
PR-24
Payment
+ Ledger
+ Partial Payment
+ Refund/Credit
      ↓
RN-CONC-002
full post-session effects qualification
```

Esse PR-22 é importante porque **“histórico do cliente” não deve ser uma consulta cara que reconstrói todo o domínio em tempo real**. Para o desenho Cloudflare Free-first, ele deve ser uma projection D1 leve, paginada e permission-aware, construída idempotentemente pelos integration events já existentes. Ao mesmo tempo, `SessionCompleted` passa a ser o fato que alimenta a evolução comercial do cliente, enquanto a recomendação de retorno permanece uma intenção profissional separada e nunca cria horário automaticamente.
