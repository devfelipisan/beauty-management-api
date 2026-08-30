Com o **PR-17 concluído**, o próximo passo natural é exatamente o que ficou deliberadamente fora dele:

# PR-18 — Equipment Usage + Previous Session Comparison + Variation Alerts

O PR-17 já entregou a base necessária:

```text
Session IN_PROGRESS
    │
    ├── Technical Form Snapshot
    ├── Technical Values
    └── Power History
```

Agora o PR-18 deve acrescentar:

```text
Session IN_PROGRESS
    │
    ├── Equipment Usage
    │
    ├── Previous Session Context
    │       ├── equipment
    │       ├── power
    │       └── technical values
    │
    └── Variation Analysis
            ├── previous value
            ├── current value
            ├── configured threshold
            └── justification when relevant
```

A documentação é bastante clara nesse ponto. Equipamentos têm estados `disponível`, `em manutenção`, `bloqueado` e `inativo`; somente equipamentos disponíveis e compatíveis com o serviço podem ser selecionados; e o equipamento utilizado precisa permanecer historicamente ligado à sessão mesmo se for posteriormente inativado. 

Também está definido que o profissional deve poder consultar sessão anterior, equipamento, potência, parâmetros, reação, observações, fotos e intercorrências. Para potência, a comparação deve considerar cliente, serviço, região e equipamento quando aplicável; uma variação superior ao limite configurado deve gerar alerta, apresentar valor anterior/atual e solicitar justificativa, mas **no MVP esse alerta não precisa bloquear o atendimento**. 

---

## 1. Objetivo do PR-18

Transformar:

```text
Session IN_PROGRESS
    │
    ├── Technical Values
    └── Power Records
```

em:

```text
Session IN_PROGRESS
    │
    ├── Technical Values
    ├── Power Records
    │
    ├── Equipment Usage
    │       ↓
    │   historical snapshot
    │
    ├── Previous Session Context
    │       ↓
    │   previous relevant parameters
    │
    └── Variation Analysis
            ↓
        NONE / ALERT
```

O PR termina com a Session ainda:

```text
IN_PROGRESS
```

Não entra `CompleteSession`.

---

# 2. Baseline obrigatório

Antes de alterar qualquer código:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr14
npm run gate:pr15
npm run gate:pr16
npm run gate:pr17
```

Depois:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers
npm run workers:dry-run
```

Tudo deve continuar:

```text
PASS
```

O PR-18 não pode mascarar regressões de PR-17.

---

# 3. Criar o plano formal

Criar:

```text
docs/plans/PR-18-equipment-session-comparison-variation-alerts.md
```

Conteúdo mínimo:

```text
Objective
Scope
Equipment ownership
Equipment states
Service compatibility
Session Equipment Usage
Historical snapshots
Previous Session Selection
Comparable Parameters
Power Comparison
Variation Policies
Alert lifecycle
Justification
Tenant isolation
Authorization
Idempotency
Audit
Free-tier strategy
Tests
Definition of Done
Out of scope
```

---

# 4. Equipment deve pertencer ao Clinical Worker

Eu manteria:

```text
Clinical Worker
├── Assessment
├── Session
├── Technical Forms
├── Technical Values
├── Power
└── Equipment
```

Isso é coerente porque Equipment participa da execução técnica do atendimento.

Operations continua autoridade de:

```text
Service
Professional
Appointment
Customer
```

Clinical não deve importar entidades do Operations.

---

# 5. Criar módulo Equipment

Se ainda inexistente:

```bash
nest g module equipment \
  --project clinical-worker
```

Estrutura:

```text
apps/clinical-worker/src/equipment/
├── domain/
├── application/
├── ports/
└── adapters/
```

---

# 6. Criar agregado `Equipment`

```bash
nest g class \
  equipment/domain/equipment \
  --project clinical-worker \
  --no-spec
```

Dados normativos mínimos:

```text
id
tenantId

name
model?
manufacturer?
serialNumber?

mainUnit?

status

notes?

createdAt
updatedAt
```

A documentação permite nome, modelo, fabricante, número de série, unidade principal, serviços compatíveis e observações. 

---

# 7. Estados canônicos

Implementar apenas:

```text
AVAILABLE
MAINTENANCE
BLOCKED
INACTIVE
```

Representando os estados normativos:

```text
disponível
em manutenção
bloqueado
inativo
```



Não adicionar:

```text
RESERVED
IN_USE
BROKEN
CLEANING
CALIBRATING
```

sem contrato futuro.

---

# 8. Não criar FSM complexa sem necessidade

Neste momento Equipment precisa principalmente de status.

Se houver transições simples:

```text
AVAILABLE → MAINTENANCE
MAINTENANCE → AVAILABLE
AVAILABLE → BLOCKED
* → INACTIVE
```

só implemente FSM se elas já forem normativas.

A regra indispensável do PR é:

```text
status != AVAILABLE
→ cannot be newly selected
```

---

# 9. Compatibilidade Equipment × Service

Criar vínculo explícito:

```text
equipment_service_compatibility
```

ou nome alinhado ao schema atual.

Relacionamento:

```text
tenantId
equipmentId
serviceId
```

RN-EQP-002 determina que somente equipamento disponível e compatível com o serviço pode ser selecionado. 

---

# 10. Não colocar `serviceIds[]` JSON como única autoridade

Para D1 e filtros eficientes, prefira tabela relacional:

```text
equipment_service_compatibility
```

em vez de:

```json
{
  "compatibleServices": ["A", "B", "C"]
}
```

como única estrutura persistente.

---

# 11. Operations ainda é autoridade do Service

Clinical precisa validar que:

```text
serviceId
```

é válido para o tenant.

Mas não deve fazer:

```sql
SELECT * FROM services
```

diretamente.

Use contrato/RPC existente ou uma extensão pequena de:

```text
ServiceTechnicalContext
```

---

# 12. Limites de plano

A documentação também permite que o plano limite quantidade de equipamentos. 

Porém, se essa capability ainda não está materializada para Equipment, não invente regra.

Faça o port:

```text
EquipmentPlanLimitPort
```

somente se a fundação de Plan existente conseguir responder normativamente.

Caso contrário:

```text
equipment creation
→ BLOCKED when plan capability unavailable
```

em vez de `AlwaysAllow`.

---

# 13. Casos de uso administrativos mínimos

Criar via CLI:

```bash
nest g service \
  equipment/application/create-equipment \
  --project clinical-worker

nest g service \
  equipment/application/update-equipment \
  --project clinical-worker

nest g service \
  equipment/application/change-equipment-status \
  --project clinical-worker
```

Evite CRUD genérico.

---

# 14. Vincular equipamento a serviços

Criar um comando explícito:

```bash
nest g service \
  equipment/application/configure-equipment-services \
  --project clinical-worker
```

Não permita que o frontend altere arbitrariamente tabela de relacionamento.

---

# 15. Permissões administrativas

Usar permissões específicas, por exemplo:

```text
equipment.create
equipment.update
equipment.status.change
equipment.read
```

somente se não houver equivalentes já definidos.

O administrador da empresa é autorizado a cadastrar equipamentos. 

---

# 16. Migration `0012`

Provavelmente:

```text
database/d1/migrations/
0012_equipment_usage_previous-session-comparison.sql
```

Após verificar numeração real.

Tabelas principais:

```text
equipment
equipment_service_compatibility
session_equipment_usage
variation_policies
session_variation_alerts
```

Nem todas necessariamente precisam estar na mesma migration se o desenho real justificar separação, mas um PR único é aceitável.

---

# 17. Equipment não pode ser apagado fisicamente quando usado

A integridade histórica é explícita.

Depois que Equipment aparece numa Session:

```text
DELETE equipment
```

não deve destruir histórico.

Use:

```text
INACTIVE
```

para retirada operacional.

RN-EQP-003 exige manutenção do uso histórico mesmo após inativação. 

---

# 18. Criar `EquipmentRepository`

```bash
nest g interface \
  equipment/ports/equipment-repository \
  --project clinical-worker
```

Métodos orientados ao domínio:

```text
findById
findAvailableCompatibleWithService
save
changeStatus
```

Evite:

```text
findAll()
```

como ferramenta principal.

---

# 19. Criar D1 adapter

```bash
nest g provider \
  equipment/adapters/d1-equipment-repository \
  --project clinical-worker
```

Sempre:

```text
tenant-aware
```

---

# 20. Query de seleção bounded

A seleção de Equipment deve consultar:

```text
tenant
+
service
+
status=AVAILABLE
```

Não:

```text
SELECT all equipment
→ filter in TypeScript
```

Isso é importante para D1 Free.

---

# 21. Registrar Equipment usado na Session

Criar um conceito separado:

```text
SessionEquipmentUsage
```

Não apenas:

```text
Session.equipmentId
```

Isso permite histórico e futuras múltiplas utilizações.

---

# 22. Estrutura mínima

```text
id
tenantId
sessionId

equipmentId

equipmentNameSnapshot
equipmentModelSnapshot?
manufacturerSnapshot?
serialNumberSnapshot?
mainUnitSnapshot?

recordedAt
recordedBy
```

A parte `Snapshot` é importante por RN-GER-004 e RN-EQP-003: alterações futuras no cadastro não devem reescrever o histórico técnico. 

---

# 23. Não copiar observações administrativas desnecessárias

Snapshot deve conter somente dados necessários para explicar qual equipamento foi utilizado.

Não copiar:

```text
all equipment notes
maintenance history
internal metadata
```

sem necessidade.

---

# 24. Criar `RecordSessionEquipmentUsage`

```bash
nest g service \
  sessions/application/record-session-equipment-usage \
  --project clinical-worker
```

Fluxo:

```text
load Session
↓
Session must be IN_PROGRESS
↓
resolve Equipment tenant-aware
↓
Equipment AVAILABLE?
↓
compatible with Session.serviceId?
↓
professional authorized?
↓
create historical snapshot
↓
persist
↓
Audit
```

---

# 25. Endpoint

Sugestão:

```http
PUT /tenants/:tenantId/sessions/:sessionId/equipment
```

ou, se múltiplos equipamentos forem permitidos:

```http
POST /tenants/:tenantId/sessions/:sessionId/equipment-usages
```

Eu prefiro a segunda forma porque não bloqueia o modelo em “um equipamento por sessão”.

---

# 26. Não assumir exatamente um Equipment

A documentação diz que equipamento pode ser registrado na sessão, mas não afirma necessariamente unicidade.

Para suportar segmentos variados:

```text
Session
→ 0..N EquipmentUsage
```

é mais seguro.

---

# 27. Idempotência do registro

Uma repetição acidental não deve criar:

```text
Usage A
Usage B
```

idênticos.

Use:

```text
Idempotency-Key
```

ou identidade estável da operação.

---

# 28. Equipment em manutenção

Cenário:

```text
Equipment.status = MAINTENANCE
```

Tentativa de novo uso:

```text
BLOCKED
EQUIPMENT_NOT_AVAILABLE
```

---

# 29. Equipment bloqueado

Mesmo.

---

# 30. Equipment inativo

Também não pode ser selecionado para uma nova aplicação.

Mas Usage antigo continua consultável.

---

# 31. Equipment fica inativo depois

Teste obrigatório:

```text
Session A
→ uses Equipment E

Equipment E
→ INACTIVE

Session A history
→ still shows E snapshot
```

Isso materializa RN-EQP-003. 

---

# 32. Equipment incompatível

```text
Equipment E
compatible with Service A

Session Service B
→ use E
```

Resultado:

```text
BLOCKED
EQUIPMENT_NOT_COMPATIBLE
```

---

# 33. Service que não exige equipamento

Se:

```text
Service.requiresEquipment = false
```

Equipment permanece opcional.

Não force seleção.

---

# 34. Service que exige equipamento

Se:

```text
Service.requiresEquipment = true
```

a ausência ainda não precisa impedir saves parciais da sessão.

Ela será uma pré-condição de `CompleteSession`.

Mas o sistema pode retornar:

```text
equipmentRequirement = PENDING
```

em uma avaliação de completeness.

---

# 35. Não implementar CompleteSession

Muito importante:

```text
requiresEquipment=true
+
equipment missing
```

não significa encerrar Session automaticamente ou bloquear registro técnico.

Só significa:

```text
future completion = BLOCKED
```

---

# 36. Agora Previous Session Context

A documentação exige consulta a:

```text
sessão anterior
equipamento
potência
parâmetros
reação
observações
fotos
intercorrências
```



Mas nem todos esses módulos existem ainda.

Portanto PR-18 deve retornar apenas as capacidades atualmente materializadas:

```text
previous Session
previous EquipmentUsage
previous Power
previous TechnicalValues
```

e representar o resto como indisponível/não materializado, não inventar.

---

# 37. Criar `GetPreviousSessionContext`

```bash
nest g service \
  sessions/application/get-previous-session-context \
  --project clinical-worker
```

Responsabilidade:

```text
current Session
↓
tenant
customer
service
↓
find previous relevant Session
↓
load previous:
  technical snapshot/values
  power
  equipment
↓
return comparison context
```

---

# 38. Qual Session anterior?

Não basta:

```text
last Session globally
```

A busca deve ser baseada em:

```text
tenant
customer
service
```

e, conforme dado disponível:

```text
region
equipment
```

A regra de potência é mais específica: cliente + serviço + região + equipamento quando aplicável. 

---

# 39. Somente Session anterior válida

Preferir Session tecnicamente concluída/histórica quando o status `COMPLETED` estiver disponível.

Mas `CompleteSession` ainda não foi implementado neste roadmap.

Logo o PR precisa inspecionar o status realmente existente nos dados/testes.

Não invente `COMPLETED` rows artificiais se a modelagem não permite.

Para comparação física, fixtures históricas controladas podem representar Session anteriores conforme schema.

---

# 40. Não comparar com Session atual

Query precisa excluir:

```text
sessionId = currentSessionId
```

---

# 41. Ordenação

Usar:

```text
startedAt DESC
```

ou referência temporal histórica normativa.

Não depender de:

```text
id DESC
```

---

# 42. Não carregar histórico completo

Query:

```text
LIMIT 1
```

para “previous Session”.

Isso é especialmente importante para Free Tier.

---

# 43. Technical field matching

O PR-17 possui campos versionados e snapshotados.

Entre:

```text
Form v1
```

e:

```text
Form v2
```

IDs físicos podem mudar.

A comparação deve preferir um identificador lógico estável:

```text
fieldKey
```

e não necessariamente:

```text
fieldSnapshotId
```

---

# 44. Se field deixou de existir

Exemplo:

```text
previous form has field A
current form no longer has A
```

Não force comparação.

Retorne apenas interseção relevante ou history metadata.

---

# 45. Se field foi adicionado

Sem valor anterior:

```text
previousValue = NOT_AVAILABLE
```

Não `0`.

---

# 46. Tipo mudou entre versões

Exemplo:

```text
v1 field X INTEGER
v2 field X TEXT
```

Isso não é comparável automaticamente.

Resultado:

```text
NOT_COMPARABLE
```

Não tente coerção silenciosa.

---

# 47. Unidade mudou

```text
previous = 10 J
current = 10 W
```

Não calcular variação percentual.

Resultado:

```text
UNIT_MISMATCH
```

a menos que uma conversão normativamente configurada exista.

---

# 48. Potência anterior

Criar query específica:

```text
findPreviousRelevantPower(...)
```

Considerando, quando disponíveis:

```text
tenant
customer
service
region
equipment
```

RN-POT-002 exige exatamente essa correspondência contextual. 

---

# 49. “Região” não deve ser hardcoded

O produto é generalizado.

Região pode estar em:

```text
technical field snapshot
```

e não como coluna fixa universal.

Crie um conceito de comparação configurável ou utilize uma technical field marcada semanticamente se isso já existir.

Se PR-17 não possui semântica de “região”, **não invente automaticamente `region` no Session**.

Nesse caso:

```text
regionMatching = NOT_AVAILABLE
```

e compare por cliente + serviço + equipamento quando permitido pelo contrato.

---

# 50. Não criar lógica específica de laser no core

Mesmo que exemplos envolvam potência e região, RN-GER-001 proíbe tornar laser/tatuagem o conceito central.

Logo não crie:

```text
LaserPreviousSessionComparator
```

como core obrigatório.

Use comparadores genéricos.

---

# 51. Criar `ComparableTechnicalValue`

Conceitualmente:

```text
fieldKey
type
unit

previousValue
currentValue

comparisonStatus
```

---

# 52. Criar `VariationPolicy`

RN-POT-003 fala em “limite configurado”. 

Logo não hardcode:

```text
10%
20%
5 J
```

Crie configuração.

---

# 53. Escopo da VariationPolicy

Pode ser:

```text
tenantId
serviceId

parameterKey / POWER

mode
  ABSOLUTE
  PERCENTAGE

threshold

unit?
status
```

Não precisa servir apenas para potência no futuro.

---

# 54. Configuração por Service

Eu começaria:

```text
tenant + service + parameter
```

Podendo futuramente especializar por equipamento/região.

Não invente complexidade antes da documentação.

---

# 55. Representação percentual determinística

Se threshold percentual:

```text
basisPoints
```

ou representação inteira equivalente.

Evitar float.

---

# 56. Criar casos de uso de configuração

```bash
nest g service \
  variation-policies/application/configure-variation-policy \
  --project clinical-worker
```

Ou manter sob technical-forms caso queira evitar módulo separado.

Eu prefiro:

```text
variation-policies/
```

porque é policy de segurança técnica, não definição de formulário.

---

# 57. Permissão administrativa

Configuração de limite:

```text
variation-policy.configure
```

ou equivalente normativo.

Profissional executor não deveria alterar threshold durante o atendimento sem permissão administrativa.

---

# 58. Criar `EvaluateTechnicalVariation`

Policy pura.

Entrada:

```text
previous
current
policy
```

Saída:

```text
NO_BASELINE
NO_VARIATION
ALERT
NOT_COMPARABLE
```

---

# 59. Não retornar apenas boolean

Precisamos distinguir:

```text
no previous session
no policy
not comparable
within range
above threshold
```

---

# 60. Cálculo absoluto

Exemplo de fixture:

```text
previous = 10
current = 14
threshold = 3
```

```text
difference = 4
→ ALERT
```

A fixture não vira default do produto.

---

# 61. Cálculo percentual

Exemplo:

```text
previous = 100
current = 120
```

Variation:

```text
20%
```

usar aritmética determinística.

---

# 62. Previous zero

Se:

```text
previous = 0
```

não calcular:

```text
(current - previous) / previous
```

de forma inválida.

Definir explicitamente:

```text
PERCENTAGE_NOT_COMPARABLE
```

ou regra matemática equivalente.

---

# 63. Variação para cima e para baixo

A policy deve declarar se interessa:

```text
ABSOLUTE_MAGNITUDE
INCREASE_ONLY
DECREASE_ONLY
```

**somente se o requisito exigir isso**.

No MVP, “variação acima do limite” sugere que a magnitude absoluta pode ser suficiente.

Mas isso deve ser documentado como decisão técnica se não houver regra mais específica.

---

# 64. Alerta não bloqueia no MVP

Esse é um ponto central.

RN-POT-003 afirma que no MVP o alerta não precisa bloquear o atendimento. 

Logo:

```text
variation > threshold
→ ALERT
```

não:

```text
→ reject technical write
```

---

# 65. Justificativa é obrigatória quando há alerta

A mesma regra exige solicitar justificativa. 

Então:

```text
ALERT
```

deve produzir algo como:

```text
JUSTIFICATION_REQUIRED
```

para completar o registro da variação.

---

# 66. Não confundir “não bloqueia atendimento” com “justificativa opcional”

A sessão pode continuar em andamento, mas o alerta deve permanecer pendente até receber justificativa.

Isso será útil no futuro para `CompleteSession`:

```text
unjustified variation alerts
→ completion may be BLOCKED
```

Se essa regra de conclusão não está explicitamente definida ainda, não implemente o bloqueio agora.

Apenas preserve a pendência.

---

# 67. Criar `SessionVariationAlert`

Campos:

```text
id
tenantId
sessionId

parameterKey
previousSessionId?

previousValue
currentValue
unit

policyId
policySnapshot

threshold
variation

status

justification?
justifiedAt?
justifiedBy?

createdAt
```

---

# 68. Status simples

Por exemplo:

```text
OPEN
JUSTIFIED
```

Não crie FSM gigantesca.

---

# 69. Snapshot da policy

Assim como ficha técnica:

```text
threshold futuro mudar
```

não pode reescrever por que o alerta histórico foi criado.

Persistir:

```text
threshold used
mode used
policyId
```

---

# 70. Criar `JustifyVariationAlert`

```bash
nest g service \
  sessions/application/justify-variation-alert \
  --project clinical-worker
```

Input:

```text
tenantId
sessionId
alertId
justification
executionContext
idempotencyKey
```

---

# 71. Justificativa não pode ser vazia

Validar texto não vazio e limite de tamanho apropriado.

Não inventar enorme campo ilimitado.

---

# 72. `justifiedBy` server-side

Nunca do body.

---

# 73. Audit

Registrar:

```text
EquipmentUsageRecorded
TechnicalVariationDetected
TechnicalVariationJustified
```

como ações auditáveis quando apropriado.

Mas cuidado:

```text
TechnicalVariationDetected
```

pode ser um fato gerado pelo sistema, não ação humana.

Use `actorId` apropriado ou `system`.

---

# 74. Não colocar valores clínicos completos no Audit

A proposta técnica já orienta que fichas completas e dados sensíveis não apareçam em auditoria. 

Audit pode registrar:

```text
sessionId
parameterKey
alertId
policyId
result
```

sem conteúdo integral da ficha.

---

# 75. Outbox?

Nesse PR, eu não criaria Outbox para:

```text
every parameter comparison
```

Não há outro Worker que precise disso hoje.

Pode persistir localmente e expor no painel profissional.

---

# 76. Previous Session endpoint

Criar algo como:

```http
GET /tenants/:tenantId/sessions/:sessionId/previous-context
```

Resposta segura:

```text
previousSession
technicalValues
power
equipment
comparison metadata
```

Somente para usuário autorizado.

---

# 77. Não retornar automaticamente fotos/intercorrências ainda

O contrato pode informar:

```text
photosAvailable=false/unimplemented
intercurrencesAvailable=false/unimplemented
```

mas não simular conteúdo.

---

# 78. Endpoint de Equipment Usage

Se múltiplos:

```http
POST /tenants/:tenantId/sessions/:sessionId/equipment-usages
```

---

# 79. Endpoint de alert justification

```http
POST /tenants/:tenantId/sessions/:sessionId/variation-alerts/:alertId/justify
```

---

# 80. Comparação automática no save de potência

Quando `RecordSessionPower` do PR-17 grava nova potência, há duas alternativas:

### A

UseCase chama comparator após persistência.

### B

Criar `RecordSessionPowerWithComparison`.

Prefiro evoluir o application flow:

```text
RecordSessionPower
    ↓
persist power
    ↓
find previous relevant
    ↓
evaluate variation
    ↓
persist alert when required
```

sem alterar o Domain `AppliedPower`.

---

# 81. Atomicidade Power + Alert

Se a comparação é parte determinística da mesma operação:

```text
Power record
+
Variation alert
+
Audit
+
Idempotency
```

devem ser tratados na mesma UnitOfWork local quando possível.

Não criar potência e perder o alerta por falha intermediária.

---

# 82. Previous Session query antes da mutation

A leitura histórica pode ocorrer antes da UnitOfWork.

Depois:

```text
decision
↓
local writes
```

Não manter transação aberta durante grandes consultas desnecessariamente.

---

# 83. Equipamento deve integrar comparação

Se há `EquipmentUsage` atual, a busca de potência anterior deve poder priorizar:

```text
same equipment
```

quando a regra aplicável exigir.

RN-POT-002 cita equipamento “quando aplicável”. 

---

# 84. Equipment diferente

Se:

```text
previous Equipment A
current Equipment B
```

a resposta deve indicar isso.

Não afirmar automaticamente que potências são diretamente comparáveis se a unidade/configuração divergir.

---

# 85. Sem sessão anterior

Resultado:

```text
previousSession = null
comparison = NO_BASELINE
alerts = []
```

Não é erro.

Primeiro atendimento deve funcionar normalmente.

---

# 86. Histórico e inativação

A linha do tempo não pode perder referências históricas quando cadastro é inativado. 

Portanto EquipmentUsage histórico não pode depender de `JOIN equipment WHERE status=AVAILABLE` para ser exibido.

O snapshot resolve isso.

---

# 87. Cross-tenant Previous Context

Tenant A nunca recebe:

```text
previous Session Tenant B
```

mesmo com:

```text
customerId
serviceId
```

coincidentes.

---

# 88. Cross-customer

Session de outro Customer não entra no baseline.

---

# 89. Cross-service

Idem.

---

# 90. Profissional pode consultar histórico autorizado

A documentação autoriza profissional a consultar histórico técnico autorizado, mas não sessões de outros profissionais sem permissão. 

Implemente autorização explícita.

Não confunda:

```text
can view customer's relevant previous technical history
```

com:

```text
can edit another professional's session
```

São permissões diferentes.

---

# 91. Equipment ownership para edição

Profissional pode registrar uso na Session.

Cadastro/status do equipamento é administrativo.

Não deixe o endpoint de Session alterar:

```text
Equipment.status
```

---

# 92. D1 Free — query strategy

Previous Session:

```text
tenant + customer + service
ORDER BY started_at DESC
LIMIT 1
```

Equipment:

```text
tenant + service + AVAILABLE
```

Alerts:

```text
tenant + session + status
```

Tudo bounded.

---

# 93. Índices

Provavelmente:

```text
equipment(tenant_id, status)

equipment_service_compatibility(
  tenant_id,
  service_id,
  equipment_id
)

session_equipment_usage(
  tenant_id,
  session_id
)

sessions(
  tenant_id,
  customer_id,
  service_id,
  started_at
)

variation_policies(
  tenant_id,
  service_id,
  parameter_key,
  status
)

session_variation_alerts(
  tenant_id,
  session_id,
  status
)
```

Só criar após verificar queries reais existentes.

---

# 94. Não utilizar KV

Availability/compatibility de Equipment e variation policy afetam segurança técnica.

D1 continua autoridade.

---

# 95. Não usar R2

Photos permanecem PR futuro.

---

# 96. Não usar Queue

Comparação é síncrona e local ao Clinical.

---

# 97. Observabilidade

Equipment:

```text
operation=RecordSessionEquipmentUsage
tenantId
sessionId
equipmentId
result
correlationId
```

Comparison:

```text
operation=EvaluateTechnicalVariation
tenantId
sessionId
parameterKey
result
policyPresent
```

Evite logar:

```text
previous clinical value
current clinical value
technical observations
```

quando desnecessário.

---

# 98. Testes unitários Equipment

Cobrir:

```text
AVAILABLE → selectable
MAINTENANCE → blocked
BLOCKED → blocked
INACTIVE → blocked
compatible service → allowed
incompatible → rejected
```

---

# 99. Testes unitários Variation

Cobrir:

```text
no baseline
no policy
below threshold
at threshold
above threshold
unit mismatch
type mismatch
percentage previous=0
```

---

# 100. Worker test histórico Equipment

Fluxo:

```text
Equipment AVAILABLE
↓
record usage
↓
Equipment INACTIVE
↓
read Session history
```

Esperado:

```text
original equipment snapshot preserved
```

---

# 101. Worker test Previous Session

Criar:

```text
Session 1
customer A
service S
power 10
Equipment E

Session 2
same customer/service
```

Consulta de Session 2:

```text
previous = Session 1
power = 10
equipment = E
```

---

# 102. Worker test cross-service

```text
Session previous Service A
current Service B
```

Não retornar A como previous relevant Session.

---

# 103. Worker test form versioning + comparison

```text
Session 1 → Form v1
field key POWER_LEVEL

Session 2 → Form v2
same logical field key
```

Comparação deve usar:

```text
fieldKey
```

e preservar as duas definições históricas.

---

# 104. Worker test variation alert

Fixture:

```text
previous value = 10
current value = 15
configured threshold = 3 absolute
```

Resultado:

```text
alert = OPEN
previous = 10
current = 15
```

Valores são apenas fixtures de teste.

---

# 105. Worker test alert não bloqueia

Após criação do alerta:

```text
Session.status = IN_PROGRESS
technical save succeeded
```

Isso prova RN-POT-003 para o MVP. 

---

# 106. Worker test justification

```text
OPEN
↓
justify
↓
JUSTIFIED
```

Persistir:

```text
justification
justifiedAt
justifiedBy
```

Replay não deve criar nova justificativa/audit duplicado.

---

# 107. Concorrência de alerta

Duas requests idênticas de potência não devem gerar alerts duplicados por retry.

Idempotency + constraints.

---

# 108. Não criar alerta duplicado para mesma operação lógica

Pode haver unique identity baseada em:

```text
tenant
session
power record / technical value revision
policy
```

ou idempotency.

Escolher conforme schema real.

---

# 109. Ajustar `EvaluateSessionTechnicalCompleteness`

PR-17 possivelmente criou ou preparou essa avaliação.

PR-18 pode expandir o resultado:

```text
technicalFieldsComplete
equipmentRequirementSatisfied
variationJustificationsSatisfied?
```

Mas cuidado:

A documentação não diz explicitamente que alertas injustificados bloqueiam conclusão.

Portanto não transformar isso em:

```text
SessionReadyToComplete=false
```

sem regra.

Melhor:

```text
equipmentRequirement:
  SATISFIED / MISSING / NOT_REQUIRED

variationAlerts:
  OPEN / RESOLVED
```

e deixar PR de conclusão decidir apenas com base em contrato aprovado.

---

# 110. Equipment obrigatório pode sim integrar completeness

RN-SRV-004 permite serviço exigir equipamento, e RN-EQP-002 define seleção válida. 

Então:

```text
requiresEquipment=true
+
no valid EquipmentUsage
→ EQUIPMENT_MISSING
```

é uma informação legítima de completeness.

---

# 111. Architecture tests

Proibir:

```text
Equipment Domain → D1
Equipment Domain → Nest
Equipment Domain → Operations Entity

VariationPolicy → Cloudflare
PreviousSessionComparator → Operations DB
```

---

# 112. Gate `pr18`

Criar:

```bash
npm run gate:pr18
```

Idealmente:

```text
gate:pr17
+
equipment unit tests
+
equipment worker tests
+
previous-session tests
+
variation tests
+
history snapshot tests
+
dry-runs
```

---

# 113. Definition of Done — Equipment

```text
[ ] Equipment domain
[ ] canonical statuses
[ ] tenant-owned
[ ] service compatibility
[ ] D1 repository
[ ] AVAILABLE required for new usage
[ ] MAINTENANCE blocked
[ ] BLOCKED blocked
[ ] INACTIVE blocked
[ ] administrative permissions
```

---

# 114. Definition of Done — Equipment historical usage

```text
[ ] SessionEquipmentUsage implemented
[ ] equipment snapshot persisted
[ ] session IN_PROGRESS required
[ ] professional authorization
[ ] service compatibility checked
[ ] equipment later inactive does not alter history
[ ] tenant isolation
[ ] idempotent recording
```

---

# 115. Definition of Done — Previous Session

```text
[ ] previous session lookup bounded
[ ] tenant-aware
[ ] customer-aware
[ ] service-aware
[ ] current Session excluded
[ ] previous TechnicalValues available
[ ] previous Power available
[ ] previous Equipment available
[ ] no previous session handled normally
```

---

# 116. Definition of Done — Comparison

```text
[ ] fieldKey used where appropriate
[ ] type mismatch detected
[ ] unit mismatch detected
[ ] missing previous value explicit
[ ] form version changes supported
[ ] no unsafe coercion
```

---

# 117. Definition of Done — Variation Policy

```text
[ ] configurable threshold
[ ] no hardcoded business percentage
[ ] absolute comparison supported when configured
[ ] percentage comparison supported when configured
[ ] tenant-aware
[ ] service-aware
[ ] policy snapshot preserved
```

---

# 118. Definition of Done — Alerts

```text
[ ] above threshold creates alert
[ ] previous value preserved
[ ] current value preserved
[ ] threshold preserved
[ ] OPEN state
[ ] justification supported
[ ] justifiedBy trusted
[ ] justifiedAt server-side
[ ] alert does not block current Session in MVP
[ ] Audit without sensitive payload
```

---

# 119. Definition of Done — Persistence

```text
[ ] migration 0012
[ ] 0001 → 0012 applies on empty D1
[ ] second migration run has nothing pending
[ ] bounded queries
[ ] indexes verified
[ ] no direct access to Operations tables
```

---

# 120. Definition of Done — Reliability

```text
[ ] Equipment usage idempotent
[ ] Power + alert creation consistent
[ ] justification idempotent
[ ] Audit append-only
[ ] no duplicate alert from retry
```

---

# 121. Definition of Done — Security

```text
[ ] Authentication
[ ] tenancy
[ ] equipment admin permissions
[ ] technical-history read permission
[ ] session technical-write permission
[ ] professional ownership
[ ] cross-tenant history blocked
[ ] caller cannot forge recordedBy
[ ] sensitive values absent from logs
```

---

# 122. Definition of Done — regression

```text
[ ] PR-14 PASS
[ ] PR-15 PASS
[ ] PR-16 PASS
[ ] PR-17 PASS

[ ] Session still starts correctly
[ ] technical form snapshot preserved
[ ] technical values preserved
[ ] power recording preserved
[ ] Appointment remains IN_PROGRESS
```

---

# 123. Qualidade final

Executar:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers

npm run gate:pr17
npm run gate:pr18

npm run workers:dry-run
git diff --check
```

Resultado:

```text
PASS
```

---

# 124. O que não entra no PR-18

Manter explicitamente fora:

```text
Photos
R2

Intercurrence

CompleteSession

Package consumption

Payment

Return recommendation

Material inventory

Equipment maintenance workflow completo

Calibration workflow

Automatic hard-block from variation alert
```

Em especial, **o alerta de variação não deve impedir automaticamente a sessão no MVP**, pois a regra atual determina alerta + valores anterior/atual + justificativa, sem exigir bloqueio do atendimento. 

---

# 125. Relatório pós-implementação esperado

Eu pediria ao Codex:

```text
PR-18 — Equipment Usage + Previous Session Comparison + Variation Alerts

Baseline
PR17 gate:

Equipment
statuses:
repository:
service compatibility:
admin permissions:

Equipment Usage
recording:
availability:
compatibility:
historical snapshot:
inactivation preservation:
idempotency:

Previous Session
selection:
tenant:
customer:
service:
technical values:
power:
equipment:
no baseline:

Comparison
field key:
type compatibility:
unit compatibility:
version compatibility:

Variation Policy
mode:
threshold:
persistence:
tenant/service scope:

Variation Alert
creation:
previous/current:
threshold snapshot:
non-blocking:
justification:
replay:

Persistence
migration:
indexes:
bounded queries:

Security
tenant isolation:
professional authorization:
history permission:
PII/log review:

Reliability
atomicity:
idempotency:
Audit:

Regression
PR14:
PR15:
PR16:
PR17:

Quality
unit:
workers:
lint:
typecheck:
dry-runs:
PR18 gate:

Remaining blockers:

Next PR:
```

---

# Depois do PR-18

Com esse PR concluído, a Session terá:

```text
Session IN_PROGRESS
    │
    ├── Technical Form Snapshot
    ├── Technical Values
    ├── Power
    ├── Equipment Usage
    ├── Previous Session Context
    └── Variation Alerts
```

O próximo PR deve então ser:

# PR-19 — Intercurrence Foundation + Clinical Restrictions Propagation

A documentação determina que a intercorrência registre descrição, tipo, gravidade, data, profissional, sessão e conduta, podendo também possuir região, parâmetros, equipamento, fotos, acompanhamento, retorno e necessidade de reavaliação. Uma intercorrência ativa também deve gerar alerta no cadastro. 

Isso é melhor vir **antes das fotos e antes de `CompleteSession`**, porque intercorrências podem gerar restrições clínicas que precisam impactar atendimentos posteriores.

O roadmap fica:

```text
PR-16
Session Start
       ↓
PR-17
Technical Form
+ Parameters
+ Power
       ↓
PR-18
Equipment
+ Previous Session
+ Variation Alerts
       ↓
PR-19
Intercurrence
+ Clinical Restrictions
       ↓
PR-20
Photos / R2
       ↓
PR-21
CompleteSession
       ↓
PR-22
Package Consumption / History / Return
```

Portanto, **o próximo PR correto é o PR-18 — Equipment Usage + Previous Session Comparison + Variation Alerts**. O ponto principal é não transformá-lo apenas em “CRUD de equipamentos”: ele deve fechar a cadeia clínica `equipamento utilizado → histórico anterior → comparação → alerta justificado`, preservando tenant, snapshots históricos e a natureza não bloqueante do alerta no MVP.
