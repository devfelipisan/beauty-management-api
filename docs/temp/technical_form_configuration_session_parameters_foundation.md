Com o **PR-16 concluído e `gate:pr16 = PASS`**, o próximo PR deve começar a materializar o registro técnico da sessão. A documentação é explícita: após iniciar o atendimento, o profissional deve preencher ficha técnica e registrar potência/unidade; além disso, os campos são configuráveis por serviço, devem ser versionados historicamente e valores numéricos precisam respeitar tipo, faixa, precisão e unidade.  

Portanto, o próximo PR deve ser:

# PR-17 — Technical Form Configuration + Session Parameters Foundation

Ele deve transformar:

```text
Session
IN_PROGRESS
    ↓
    X
sem ficha técnica persistida
```

em:

```text
Service
    ↓
Technical Form Definition
    ↓
immutable version
    ↓
Session IN_PROGRESS
    ↓
Technical Form Snapshot
    ↓
Technical Values
    ├── texto
    ├── número
    ├── percentual
    ├── seleção
    ├── booleano
    ├── data/hora
    └── unidade
    ↓
Power / technical parameter
```

O PR deve **parar antes de Equipment, Photos, Intercurrence e CompleteSession**.

A sequência normativa já está definida no produto:

```text
RF-031 iniciar atendimento
→ RF-032 registrar parâmetros
→ RF-033 registrar potência
→ RF-034 comparar sessão anterior
→ RF-035 emitir alerta
→ RF-036 fotos
→ RF-037 intercorrência
→ RF-038 conclusão
```



---

# 1. Baseline obrigatório

Começar sem alterar nada:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr14
npm run gate:pr15
npm run gate:pr16
```

Depois:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers
```

Esperado:

```text
PR-14 PASS
PR-15 PASS
PR-16 PASS
lint PASS
typecheck PASS
unit PASS
workers PASS
```

Qualquer regressão anterior deve ser resolvida antes do PR-17.

---

# 2. Criar o plano formal

Criar:

```text
docs/plans/PR-17-technical-form-session-parameters.md
```

O documento deve congelar:

```text
Objective
Ownership
Technical field types
Technical form versioning
Service association
Session snapshot
Technical value validation
Power representation
Idempotency
Audit
Outbox
Tenant isolation
Historical immutability
Concurrency
Queries/history
Free-tier impact
Tests
Definition of Done
Out of Scope
```

---

# 3. Base normativa do PR

Há quatro regras centrais.

Primeiro, o serviço pode configurar:

```text
exige equipamento
exige fotografia
possui ficha técnica
parâmetros técnicos obrigatórios
```



Segundo, os campos permitidos incluem:

```text
texto curto
texto longo
inteiro
decimal
percentual
seleção única
múltipla seleção
booleano
data
hora
unidade de medida
```

Terceiro, cada campo pode definir:

```text
nome
descrição
tipo
ordem
obrigatoriedade
mínimo
máximo
unidade
opções
status
```

Quarto, alterações posteriores na configuração **não podem modificar sessões anteriores**; cada sessão deve preservar uma cópia da definição usada. 

Essa última regra deve ser tratada como invariante arquitetural, não como detalhe de UI.

---

# 4. Ownership

Minha recomendação para o projeto atual:

```text
Operations Worker
    owns Service identity/basic operational config

Clinical Worker
    owns:
      TechnicalFormDefinition
      TechnicalFieldDefinition
      TechnicalFormVersion
      SessionTechnicalFormSnapshot
      SessionTechnicalValue
      AppliedPower
```

Isso mantém:

```text
Service
→ Operations authority

Technical execution
→ Clinical authority
```

Não coloque os valores técnicos da sessão em Operations.

---

# 5. Como associar a ficha ao Service

Clinical pode armazenar:

```text
tenantId
serviceId
```

como referência lógica.

Não deve consultar diretamente:

```sql
SELECT * FROM services
```

para validar ownership.

Quando necessário:

```text
Clinical
    ↓
Operations Service Binding
    ↓
Service technical context
```

---

# 6. Não compartilhar `Service` como entidade

Criar contratos pequenos em:

```text
libs/contracts/src/technical-forms/
```

Por exemplo:

```text
GetServiceTechnicalContextRequest
GetServiceTechnicalContextResponse
```

Resultado conceitual:

```text
tenantId
serviceId
active
hasTechnicalForm
technicalRequirements
```

Sem importar:

```text
operations-worker/src/services/domain/service.ts
```

no Clinical.

---

# 7. Primeiro inspecionar se algo já existe

Antes de gerar código:

```bash
find apps/clinical-worker/src -maxdepth 8 -type f | sort

grep -R "TechnicalField" apps libs -n || true
grep -R "TechnicalForm" apps libs -n || true
grep -R "Power" apps libs -n || true
```

Não criar uma segunda modelagem caso o projeto já contenha contratos preparatórios.

---

# 8. Criar módulo de technical forms

Se ausente:

```bash
nest g module technical-forms \
  --project clinical-worker
```

Estrutura recomendada:

```text
technical-forms/
├── domain/
├── application/
├── ports/
└── adapters/
```

---

# 9. Criar `TechnicalFieldDefinition`

```bash
nest g class \
  technical-forms/domain/technical-field-definition \
  --project clinical-worker \
  --no-spec
```

Esse objeto representa **a definição**, não o valor preenchido.

---

# 10. Tipos canônicos

Congelar enum equivalente a:

```text
SHORT_TEXT
LONG_TEXT
INTEGER
DECIMAL
PERCENTAGE
SINGLE_SELECT
MULTI_SELECT
BOOLEAN
DATE
TIME
MEASUREMENT
```

Não criar tipos segmentados como:

```text
LASER_POWER
TATTOO_NEEDLE
MICROPIGMENTATION_PIGMENT
```

O produto é propositalmente generalizado. 

---

# 11. Configuração mínima de campo

Conceitualmente:

```text
id
tenantId

key
name
description?

type
order

required

minimum?
maximum?
precision?

unit?

options?

status
```

`key` deve ser estável para permitir identificação lógica entre versões.

---

# 12. Não usar float arbitrário

Para valores que exigem precisão:

```text
decimal
percentage
measurement
```

defina representação determinística.

Dependendo do contrato:

```text
value + scale
```

ou decimal textual validado.

Evite:

```ts
0.1 + 0.2
```

como autoridade de domínio.

---

# 13. `options`

Somente faz sentido para:

```text
SINGLE_SELECT
MULTI_SELECT
```

Um campo:

```text
INTEGER
```

com `options` configuradas deve ser inválido.

---

# 14. Unidade

A regra permite unidade configurada. 

Exemplos podem ser:

```text
J/cm²
W
ms
mm
%
```

mas **não devem virar enum fechado global**.

O produto precisa suportar segmentos diferentes.

Modelar unidade como código/string validada ou catálogo futuro.

---

# 15. Criar `TechnicalFormDefinition`

```bash
nest g class \
  technical-forms/domain/technical-form-definition \
  --project clinical-worker \
  --no-spec
```

Conceitualmente:

```text
id
tenantId
serviceId
version
status
fields[]
createdAt
createdBy
```

---

# 16. Versionamento é obrigatório

A regra:

```text
alterar ficha futura
≠
alterar sessão passada
```

é explícita. 

Portanto não implementar:

```text
UPDATE technical_fields
```

destrutivo como única estratégia.

Preferir:

```text
Form v1
        ↓ configuração alterada
Form v2
```

As sessões antigas continuam:

```text
Session A → v1 snapshot
Session B → v2 snapshot
```

---

# 17. Não editar versão publicada

Defina lifecycle simples:

```text
DRAFT
ACTIVE
INACTIVE
```

se isso estiver alinhado ao contrato.

A principal regra:

```text
ACTIVE version used by Session
→ immutable
```

Mudança exige nova versão.

Não precisa implementar workflow sofisticado de publicação.

---

# 18. Uma versão ativa por Service

Criar proteção lógica/física:

```text
tenant + service + active form
```

deve possuir somente uma definição autoritativa.

SQLite/D1 pode exigir estratégia específica para essa constraint.

Se partial index for viável, use-o; senão imponha via repository/CAS.

---

# 19. Criar casos de uso de configuração mínimos

Precisamos viabilizar `RF-011 — Configurar ficha técnica`. 

Sugestão:

```bash
nest g service \
  technical-forms/application/create-technical-form \
  --project clinical-worker

nest g service \
  technical-forms/application/publish-technical-form \
  --project clinical-worker
```

Evite CRUD genérico.

---

# 20. Alteração de ficha

Não implementar:

```text
UpdateActiveTechnicalForm
```

modificando campos em uso.

O fluxo deve ser conceitualmente:

```text
ACTIVE v1
    ↓
create DRAFT v2 based on v1
    ↓
modify
    ↓
publish
    ↓
v1 INACTIVE
v2 ACTIVE
```

Pode-se simplificar o comando neste PR, mas preservar o princípio.

---

# 21. Permissões

Configuração de ficha é responsabilidade administrativa.

Usar permissões explícitas existentes ou criar, se normativamente ausentes:

```text
technical-form.create
technical-form.publish
technical-form.read
```

Não usar:

```text
session.start
```

para configuração.

---

# 22. Session precisa congelar a ficha

Quando:

```text
Session IN_PROGRESS
```

for registrar parâmetros pela primeira vez, o sistema precisa associar uma definição imutável.

Há duas estratégias.

### Estratégia A — congelar no StartSession

```text
Session created
→ resolve active form
→ snapshot
```

### Estratégia B — lazy snapshot no primeiro TechnicalEntry

Recomendo **A**, mas sem reabrir o PR-16 de forma destrutiva.

Podemos introduzir no PR-17 uma operação:

```text
EnsureSessionTechnicalFormSnapshot
```

executada antes do primeiro preenchimento e idempotente.

---

# 23. Por que não referenciar apenas `technical_form_version_id`

Porque RN-CAM-003 exige que a sessão preserve uma cópia da definição utilizada. 

Se a linha original for alterada/corrompida no futuro, o histórico técnico não deve mudar.

Portanto:

```text
SessionTechnicalFormSnapshot
```

deve materializar:

```text
field key
name
type
required
limits
precision
unit
options
order
```

como estavam naquele momento.

---

# 24. Não usar JSON sem critério para tudo

D1 suporta texto JSON, mas não transforme o domínio inteiro em:

```text
session.form_json
```

sem estrutura.

Uma modelagem melhor para consultas/auditoria:

```text
session_technical_form_snapshots
session_technical_field_snapshots
session_technical_values
```

Isso facilita:

```text
history
validation
comparison
required-field verification
```

---

# 25. Migration `0011`

Criar:

```text
database/d1/migrations/
0011_technical_form_session_parameters.sql
```

ajustando à sequência real.

---

# 26. Schema de definições

Conceitualmente:

```text
technical_forms
technical_form_fields
```

Com:

```text
tenant_id
service_id
version
status
```

e campos filhos.

---

# 27. Schema de snapshot

Criar:

```text
session_technical_form_snapshots
session_technical_field_snapshots
```

Ligados por:

```text
tenant_id
session_id
```

---

# 28. Schema de valores

Criar:

```text
session_technical_values
```

Conceitualmente:

```text
id
tenant_id
session_id
field_snapshot_id

value_type

text_value?
integer_value?
decimal_value?
boolean_value?
date_value?
time_value?
json_value?

recorded_at
recorded_by
updated_at
```

Mas não adicione colunas indiscriminadamente sem analisar a estratégia de persistência escolhida.

---

# 29. Não persistir tudo como string sem tipo

Isto:

```text
value = "abc"
```

para qualquer coisa elimina validação e dificulta comparação.

Preservar tipo lógico.

---

# 30. Criar `TechnicalValue`

Objeto de domínio responsável por:

```text
type validation
required validation
range
precision
unit
option membership
```

Não espalhar:

```ts
if (field.type === ...)
```

por controller/repository.

---

# 31. Regras numéricas

RN-CAM-005 exige:

```text
tipo
mínimo
máximo
precisão
unidade
```



Testes obrigatórios:

```text
value < minimum → reject
value > maximum → reject
precision invalid → reject
wrong type → reject
wrong unit → reject
```

---

# 32. Seleção única

Valor deve estar entre:

```text
configured options
```

Não aceitar opção antiga que não faça parte do snapshot da sessão.

---

# 33. Multi-select

Validar:

```text
cada elemento permitido
sem duplicação quando aplicável
```

---

# 34. Campo obrigatório

Neste PR, permitir que uma Session `IN_PROGRESS` tenha parcialmente preenchida a ficha.

Importante:

```text
required field missing
```

**não bloqueia salvar o progresso**.

Ele bloqueará:

```text
CompleteSession
```

futuramente.

RN-CAM-004 diz que a sessão não pode ser **concluída** com obrigatórios faltantes, não que todos devam ser preenchidos no primeiro save. 

---

# 35. Isso implica autosave/progressivo

O backend deve permitir:

```text
field A
save

field B
save
```

sem exigir ficha completa.

Muito importante para mobile e conexões instáveis.

---

# 36. Criar `RecordSessionTechnicalValues`

```bash
nest g service \
  sessions/application/record-session-technical-values \
  --project clinical-worker
```

Ou dentro de módulo técnico, conforme composição existente.

Entrada:

```text
tenantId
sessionId
values[]
executionContext
idempotencyKey
```

---

# 37. Session precisa estar `IN_PROGRESS`

Não permitir editar ficha de:

```text
COMPLETED
CANCELED
```

quando esses estados existirem.

Neste momento:

```text
Session.status != IN_PROGRESS
→ TECHNICAL_EDIT_NOT_ALLOWED
```

---

# 38. Profissional autorizado

Somente o profissional da Session ou usuário explicitamente autorizado pode alterar dados técnicos.

A documentação restringe profissionais de alterar sessões de outros profissionais sem permissão. 

Não confiar apenas em `sessionId`.

---

# 39. Endpoint

Sugestão:

```http
PUT /tenants/:tenantId/sessions/:sessionId/technical-values
```

`PUT` funciona bem se representar atualização idempotente do conjunto informado.

Ou:

```http
PATCH ...
```

se já for padrão do projeto.

Não criar:

```http
POST /session-data
```

genérico.

---

# 40. Permissão

Algo equivalente a:

```text
session.technical.update
```

ou permissão canônica existente.

Não reutilizar `session.start` como autorização de edição.

---

# 41. Idempotency-Key

Ainda é útil porque gravação técnica pode sofrer duplo clique/retry.

Dependendo da semântica de `PUT`, natural idempotence já ajuda, mas a foundation atual permite proteção adicional para Audit/Outbox.

Use o padrão consolidado.

---

# 42. Não criar um Audit para cada tecla

Muito importante para Free Tier.

Não faça:

```text
input change
→ HTTP
→ Audit
→ Outbox
```

a cada caractere.

O frontend deve enviar uma operação coerente de save.

---

# 43. Audit de alteração técnica

Evento conceitual:

```text
SessionTechnicalValuesRecorded
```

ou action audit equivalente.

Registrar:

```text
tenantId
sessionId
actorId
field keys changed
correlationId
```

Não necessariamente os valores sensíveis completos.

---

# 44. Outbox

Pergunta importante: todo save técnico precisa gerar evento externo?

Neste momento:

```text
não
```

a menos que exista consumer real.

Audit é obrigatório para rastreabilidade.

Outbox só deve existir quando houver fato que outro bounded context precise consumir.

Não introduza write amplification só por simetria.

---

# 45. Histórico de alterações técnicas

Como sessões em andamento podem ser editadas, decidir se:

```text
overwrite current value
```

é suficiente até a conclusão.

A rastreabilidade exige preservar operações críticas e parâmetros aplicados. 

Minha recomendação:

```text
current technical value
+
Audit append-only
```

para MVP.

Não precisa criar event sourcing.

---

# 46. Potência precisa ser conceito explícito

RF-033 exige registrar:

```text
potência
+
unidade
```



Não esconda isso em:

```text
generic field named "potência"
```

quando potência é uma entidade/registro explicitamente relevante para histórico e comparação.

---

# 47. Criar `AppliedPower`

Por exemplo:

```bash
nest g class \
  sessions/domain/applied-power \
  --project clinical-worker \
  --no-spec
```

Campos mínimos:

```text
value
unit
```

Talvez:

```text
area?
```

somente se já normativo para aplicação.

---

# 48. Não limitar unidade a um tipo de equipamento

Evitar enum:

```text
JOULE
JOULE_PER_CM2
```

como único universo.

Serviços diferentes podem usar unidades diferentes.

---

# 49. Criar `RecordSessionPower`

```bash
nest g service \
  sessions/application/record-session-power \
  --project clinical-worker
```

Entrada:

```text
tenantId
sessionId
value
unit
executionContext
idempotencyKey
```

---

# 50. Endpoint de potência

Sugestão:

```http
PUT /tenants/:tenantId/sessions/:sessionId/power
```

ou integrar potência à ficha somente se a especificação e UI realmente a tratam como um campo técnico comum.

Como `RF-033` a destaca separadamente, manteria conceito explícito.

---

# 51. Várias potências em uma sessão?

Não assuma imediatamente:

```text
Session has exactly one power
```

Em procedimentos reais pode haver múltiplas áreas/aplicações.

Mas a documentação atual apenas exige registrar potência/unidade.

Para este PR, escolha representação que não impeça extensão futura.

Uma boa base:

```text
session_power_records
```

com múltiplas rows, em vez de:

```text
sessions.power = ...
```

---

# 52. Porém não criar `area` inventada

Se múltiplos records forem permitidos:

```text
id
sessionId
value
unit
recordedAt
recordedBy
```

Basta.

A associação a região/etapa pode surgir futuramente.

---

# 53. Histórico não pode desaparecer

Mesmo que uma potência seja corrigida, tenha cuidado com update destrutivo.

Podemos adotar:

```text
append record
```

para potência.

Isso favorece rastreabilidade.

---

# 54. Comparação com sessão anterior ainda não entra

`RF-034` é o próximo estágio. 

PR-17 deve apenas garantir que os dados possam ser consultados de forma que PR-18 implemente:

```text
current vs previous
```

---

# 55. Portanto criar queries adequadas

Repository deve conseguir:

```text
findValuesBySession
findPowerRecordsBySession
```

e talvez:

```text
findLatestCompletedSessionForCustomerAndService
```

**somente se necessário agora**.

Eu deixaria a query comparativa para PR-18.

---

# 56. Não buscar histórico inteiro para editar sessão

Editar atual:

```text
tenant + session
```

bounded query.

Não carregar:

```text
all customer sessions
```

em cada save.

---

# 57. Configuration endpoints

Para Admin, podem ser necessários:

```http
POST /tenants/:tenantId/services/:serviceId/technical-forms
POST /tenants/:tenantId/services/:serviceId/technical-forms/:id/publish
GET  /tenants/:tenantId/services/:serviceId/technical-form
```

Não exponha CRUD completo desnecessário.

---

# 58. Service técnico sem ficha

Se:

```text
Service.hasTechnicalForm = false
```

não criar snapshot vazio desnecessariamente.

`RecordSessionTechnicalValues` deve:

```text
BLOCKED / NOT_APPLICABLE
```

se chamado indevidamente.

---

# 59. Serviço com ficha

Quando:

```text
hasTechnicalForm = true
```

mas nenhuma versão ativa existe:

```text
BLOCKED
TECHNICAL_FORM_NOT_CONFIGURED
```

Fail-closed.

Não inventar ficha vazia.

---

# 60. Mudança de configuração durante Session

Cenário fundamental:

```text
Session A started
→ snapshot Form v1

Admin publishes Form v2

Session A
→ continues using v1
```

Nunca migrar Session ativa automaticamente para v2.

Esse teste é obrigatório por RN-GER-004/RN-CAM-003. 

---

# 61. Nova Session após mudança

```text
Session B
→ Form v2
```

Isso prova versionamento correto.

---

# 62. Cross-tenant

Tenant A nunca:

```text
reads Form B
uses Field B
writes Session B
```

O isolamento precisa cobrir configurações e sessões. 

---

# 63. Cross-service

Form do:

```text
Service A
```

não pode ser snapshot de:

```text
Service B
```

mesmo tenant.

---

# 64. Cross-session

Field snapshot da:

```text
Session A
```

não pode receber valor em:

```text
Session B
```

Repository precisa validar:

```text
tenant + session + field snapshot
```

---

# 65. Atomicidade de snapshot

A primeira materialização:

```text
SessionTechnicalFormSnapshot
+
all field snapshots
```

deve ser atômica.

Não deixar:

```text
form snapshot created
fields partially created
```

---

# 66. Idempotência do snapshot

Duas requests simultâneas tentando abrir ficha da mesma Session:

```text
one snapshot
one set of field snapshots
```

Criar constraint:

```text
UNIQUE (tenant_id, session_id)
```

para o form snapshot.

---

# 67. Concorrência de saves

Duas operações atualizando campos **diferentes** podem coexistir.

Duas atualizando o **mesmo field** exigem semântica explícita.

Para MVP, podemos usar:

```text
last committed update wins
```

desde que:

* ambos sejam autorizados;
* Audit preserve alterações;
* não haja perda silenciosa de estrutura.

Se isso não for aceitável, introduzir revision/CAS.

---

# 68. Eu recomendaria revision

Adicionar:

```text
revision
```

ao conjunto de valores ou por valor técnico pode ajudar optimistic concurrency.

Mas não introduza complexidade sem necessidade atual.

No mínimo, testar requests concorrentes.

---

# 69. Security

O profissional possui permissão para:

```text
preencher fichas
registrar potência
```

e não deve alterar sessões de outro profissional sem permissão explícita. 

Portanto testar:

```text
Professional A
→ Session A
PASS
```

```text
Professional B
→ Session A
BLOCKED
```

---

# 70. Não aceitar `recordedBy` do body

Sempre derivado da identidade confiável.

---

# 71. Não aceitar tenant do body

Vem do path/context confiável.

---

# 72. Não aceitar field definition do frontend

Frontend envia:

```text
fieldId
value
```

Não:

```json
{
  "field": {
    "type": "INTEGER",
    "minimum": 0
  }
}
```

O backend usa o snapshot autoritativo.

---

# 73. Não confiar na unidade enviada arbitrariamente

Se field snapshot define:

```text
unit = J/cm²
```

caller não pode substituir por:

```text
W
```

sem regra.

---

# 74. D1 migration constraints

Incluir constraints úteis para:

```text
tenant ownership
version > 0
order >= 0
unique form/version
unique field key per version
unique snapshot per session
unique field value per session-field quando modelo for single-value
```

---

# 75. Indexar pelas queries reais

No mínimo provavelmente:

```text
technical_forms(tenant_id, service_id, status)
technical_form_fields(tenant_id, form_id, order)
session_technical_form_snapshots(tenant_id, session_id)
session_technical_values(tenant_id, session_id)
session_power_records(tenant_id, session_id)
```

Sem índices especulativos em todas as colunas.

---

# 76. Free Tier

Evitar explosão de writes.

Um save com dez campos não deveria necessariamente gerar:

```text
10 Audit
10 Outbox
```

Uma operação:

```text
RecordSessionTechnicalValues
```

pode gravar os dez valores em batch e um Audit resumido.

Isso preserva D1 Free.

---

# 77. Não usar KV

Configuração da ficha influencia diretamente validação e histórico.

D1 primeiro.

---

# 78. Não usar R2

Fotos ficam fora deste PR.

---

# 79. Não usar Queue

Não há evento cross-worker necessário para cada alteração técnica.

---

# 80. Observabilidade

Operação:

```text
RecordSessionTechnicalValues
```

Logar apenas metadata:

```text
tenantId
sessionId
professionalId
fieldCount
result
correlationId
duration
```

Não logar:

```text
field values
observations
clinical text
```

especialmente porque dados técnicos podem ser sensíveis.

---

# 81. Potência

Logs:

```text
operation=RecordSessionPower
tenantId
sessionId
unit?
result
```

Eu evitaria logar o valor se não houver necessidade operacional.

---

# 82. Audit ≠ log

Audit poderá registrar quais campos foram alterados:

```text
fieldKeys
```

mas evite payload integral, salvo requisito claro.

---

# 83. Worker tests

Sugestão:

```text
test/workers/technical-form-configuration.spec.ts
test/workers/session-technical-values.spec.ts
test/workers/session-power.spec.ts
```

---

# 84. Unit tests — TechnicalFieldDefinition

Cobrir:

```text
valid type
invalid type
required
range
precision
unit
options
order
```

---

# 85. Unit tests — versioning

```text
published version immutable
new version allowed
```

---

# 86. Worker test — snapshot histórico

Cenário:

```text
Form v1:
  powerLevel required
  min=1
  max=10

Session A
→ snapshot v1

Publish v2:
  max=20

Session A
→ still max=10

Session B
→ max=20
```

Este é provavelmente o teste mais importante do PR-17.

---

# 87. Worker test — numeric validation

Snapshot:

```text
min=1
max=10
```

Enviar:

```text
0 → 400/422
11 → 400/422
5 → PASS
```

conforme error mapping atual.

---

# 88. Worker test — select

Options:

```text
LOW
MEDIUM
HIGH
```

Enviar:

```text
INVALID
→ reject
```

---

# 89. Worker test — partial form

Campos:

```text
A required
B required
C optional
```

Durante `IN_PROGRESS`:

```text
save only A
→ PASS
```

A conclusão futura é quem bloqueará B ausente.

---

# 90. Worker test — completed/incompatible session

Quando Session não está mais editável:

```text
technical values update
→ BLOCKED
```

Mesmo que `CompleteSession` ainda não exista, unit test pode proteger FSM/status future-proof quando aplicável.

---

# 91. Worker test — power

```text
Session IN_PROGRESS
value valid
unit valid
→ persisted
```

Repetição idempotente:

```text
same key
→ no duplicate logical effect
```

---

# 92. Physical isolation

Testar:

```text
Tenant A form
Tenant B session
→ blocked
```

```text
Tenant A session
Tenant B field
→ blocked
```

---

# 93. Architecture tests

Proibir:

```text
TechnicalForm Domain
→ D1
```

```text
TechnicalForm Domain
→ Nest
```

```text
TechnicalForm Domain
→ Operations Domain
```

```text
SessionTechnicalValue
→ Cloudflare bindings
```

---

# 94. Não alterar Appointment no PR

O Appointment já está:

```text
IN_PROGRESS
```

PR-17 só atua no Clinical.

Nenhum RPC Clinical→Operations é necessário para cada preenchimento.

---

# 95. Não concluir a Session

Ao final do PR:

```text
Session
IN_PROGRESS

technical form snapshot ✓
technical values ✓
power records ✓
```

Mas:

```text
Session COMPLETED
```

continua indisponível.

---

# 96. Criar readiness futuro para conclusão

Pode haver um serviço puramente consultivo:

```text
EvaluateSessionTechnicalCompleteness
```

que retorna:

```text
COMPLETE
INCOMPLETE
```

baseado em campos obrigatórios.

Mas **não executa conclusão**.

Isso é muito útil para PR-21.

---

# 97. `EvaluateSessionTechnicalCompleteness`

Regras:

```text
all required fields filled
values valid
```

Neste PR ainda não inclui:

```text
equipment
photos
intercurrence
```

porque esses módulos ainda não existem.

O resultado pode ser:

```text
TECHNICAL_FIELDS_COMPLETE
```

e não `SESSION_READY_TO_COMPLETE`, evitando afirmar mais do que sabemos.

---

# 98. Gate novo

Criar:

```bash
npm run gate:pr17
```

Idealmente:

```text
gate:pr16
+
technical form unit tests
+
technical form workers tests
+
snapshot/versioning proofs
+
technical values proofs
+
power proofs
+
dry-runs
```

---

# 99. Gates obrigatórios

Ao final:

```text
npm run lint
npx tsc --build --force
npm run test
npm run test:workers
npm run gate:pr16
npm run gate:pr17
npm run workers:dry-run
git diff --check
```

Tudo:

```text
PASS
```

---

# 100. Definition of Done — Technical Form

```text
[ ] TechnicalFormDefinition criado
[ ] TechnicalFieldDefinition criado
[ ] tipos canônicos implementados
[ ] required
[ ] min/max
[ ] precision
[ ] unit
[ ] options
[ ] order
[ ] status
[ ] service-owned reference
[ ] tenant isolation
```

---

# 101. Definition of Done — Versioning

```text
[ ] version explícita
[ ] versão ativa não sofre alteração histórica
[ ] mudança gera nova versão
[ ] uma versão ativa autoritativa por Service
[ ] Session A mantém v1
[ ] Session B utiliza v2
```

A preservação histórica dos campos e configurações técnicas é requisito explícito. 

---

# 102. Definition of Done — Session Snapshot

```text
[ ] Session possui snapshot próprio
[ ] field definitions são copiadas
[ ] snapshot é tenant-aware
[ ] snapshot é idempotente
[ ] dois requests concorrentes não criam snapshots duplicados
[ ] configuração posterior não altera snapshot
```

---

# 103. Definition of Done — Technical Values

```text
[ ] Session IN_PROGRESS obrigatória
[ ] backend valida definição autoritativa
[ ] tipos validados
[ ] range validado
[ ] precision validada
[ ] unit validada
[ ] options validadas
[ ] preenchimento parcial permitido
[ ] professional authorization validada
[ ] recordedBy server-side
[ ] cross-tenant bloqueado
```

---

# 104. Definition of Done — Power

```text
[ ] potência é conceito explícito
[ ] value validado
[ ] unit preservada
[ ] tenant-aware
[ ] ligada à Session
[ ] registrada pelo profissional confiável
[ ] histórico não depende da configuração futura
```

---

# 105. Definition of Done — Persistence

```text
[ ] migration 0011
[ ] migrations 0001→0011 PASS
[ ] second apply sem pending migrations
[ ] repositories D1
[ ] consultas bounded
[ ] índices coerentes
[ ] nenhum acesso direto a tabelas Operations
```

---

# 106. Definition of Done — Reliability

```text
[ ] snapshot creation atomic
[ ] technical values write atomic por comando
[ ] idempotency onde aplicável
[ ] Audit append-only
[ ] nenhuma write parcial proibida
```

---

# 107. Definition of Done — Security

```text
[ ] Authentication
[ ] tenancy
[ ] permission de configuração
[ ] permission de edição técnica
[ ] profissional não altera sessão alheia sem permissão
[ ] caller não forja recordedBy
[ ] valores técnicos não aparecem nos logs
```

---

# 108. Definition of Done — regressões

```text
[ ] PR-12 CreateAppointment PASS
[ ] PR-13 Deposit PASS
[ ] PR-14 Outbox PASS
[ ] PR-15 Confirm/CheckIn PASS
[ ] PR-16 StartSession PASS
[ ] full flow chega a Session IN_PROGRESS
[ ] nova ficha não afeta Appointment
```

---

# 109. O que explicitamente fica fora do PR-17

Não implementar:

```text
Equipment catalog
Equipment selection/use

Compare previous session
Variation alerts

Photos
R2

Intercurrence

CompleteSession

Package consumption

Payment

Return recommendation
```

Isso evita transformar PR-17 em todo o módulo Clinical de uma vez.

---

# 110. Relatório pós-implementação

Eu exigiria que o Codex finalize assim:

```text
PR-17 — Technical Form Configuration + Session Parameters Foundation

Baseline
PR16:

Technical Form
types:
field validation:
service association:

Versioning
v1:
v2:
active version:
immutability:

Session Snapshot
creation:
idempotency:
concurrency:
historical preservation:

Technical Values
text:
integer:
decimal:
percentage:
select:
multi-select:
boolean:
date/time:
measurement:

Validation
required:
minimum:
maximum:
precision:
unit:
options:

Partial Save
result:

Power
records:
unit:
idempotency:

Persistence
migration:
repositories:
indexes:

Tenant Isolation
form:
snapshot:
value:
power:

Security
permission:
professional ownership:
recordedBy:

Reliability
atomicity:
audit:
idempotency:

E2E
Session IN_PROGRESS:
snapshot:
technical values:
power:

Regression
PR12:
PR13:
PR14:
PR15:
PR16:

Quality
unit:
workers:
lint:
typecheck:
dry-runs:
PR17 gate:

Remaining blockers:

Next PR:
```

---

# Próximo PR depois do PR-17

Se esse PR fechar com `gate:pr17 = PASS`, eu seguiria com:

# PR-18 — Equipment Usage + Previous Session Comparison + Variation Alerts

Porque a especificação determina que o profissional possa registrar equipamento, consultar parâmetros anteriores e receber alertas sobre variações relevantes; equipamentos só podem ser selecionados quando disponíveis e compatíveis com o serviço, e seu uso deve permanecer historicamente ligado à sessão mesmo após futura inativação.

A sequência fica:

```text
PR-16
StartSession
     ↓
PR-17
Technical Form
+ Parameters
+ Power
     ↓
PR-18
Equipment Usage
+ Previous Session Comparison
+ Variation Alerts
     ↓
PR-19
Intercurrence
     ↓
PR-20
Photos / R2
     ↓
PR-21
CompleteSession
```

Essa ordem é importante porque **`CompleteSession` só deve aparecer depois que todas as pré-condições técnicas que podem bloqueá-lo estiverem materializadas**. A especificação já exige que campos técnicos obrigatórios estejam preenchidos antes da conclusão e que histórico/configuração anteriores não sejam retroativamente alterados. 

Portanto, o próximo PR correto é **PR-17 — Technical Form Configuration + Session Parameters Foundation**, encerrando com `Session = IN_PROGRESS`, ficha técnica versionada/snapshotada, parâmetros registrados e potência persistida — mas ainda sem equipamento, foto, intercorrência ou conclusão.
