Considerando o estado após o **PR-11.7**, o próximo PR deve ser o último PR preparatório antes do `CreateAppointment`:

# PR-11.8 — Commercial Policy Materialization + Final Appointment Readiness

Ele deve resolver duas pendências restantes:

```text
1. fechar a última prova física Clinical:
   Assessment APTO / NAO_APTO realmente persistido em D1

2. transformar:
   CommercialTerms = BLOCKED

   em pelo menos um caminho normativo:

   CommercialTerms = READY
```

Não há razão para abrir outro PR exclusivamente para a prova Clinical, porque o relatório do PR-11.7 mostra que toda a qualificação física restante passou e só ficou pendente esse cenário específico. Já o principal blocker funcional agora é comercial.

A documentação fornece base normativa suficiente para isso. Um `Service` pode configurar se exige sinal, sinal fixo ou percentual, se permite desconto e preço mínimo.  As políticas de desconto podem ser configuradas por perfil e definir percentual ou valor fixo, elegibilidade, mínimo, máximo, validade, uso único, aprovação e acúmulo.  E o sinal pode ser não exigido, fixo ou percentual, sendo calculado sobre o preço final após desconto e nunca podendo ultrapassá-lo. 

---

## 1. Objetivo final do PR

Sair de:

```text
Scheduling                  PASS
Concurrency                 PASS
Reliability                 PASS
Idempotency                 PASS
Tenant isolation            PASS
Worker runtime              PASS
Clinical RPC transport      PASS
Billing RPC transport       PASS

Clinical D1 APTO/NAO_APTO   PENDING

CommercialTerms:
  DiscountPolicy            Unavailable
  DepositPolicy             Unavailable
  result                    BLOCKED
```

para:

```text
Scheduling                  PASS
Concurrency                 PASS
Reliability                 PASS
Idempotency                 PASS
Tenant isolation            PASS
Clinical                    PASS físico
Billing transport           PASS

CommercialTerms
  ├── DiscountPolicy        REAL
  ├── DepositPolicy         REAL
  └── READY para configuração válida

CreateAppointmentReady      PASS
```

Ainda assim:

```text
POST /appointments
```

**não entra neste PR**.

---

# 2. Escopo

Entram:

* prova Clinical/D1 `APTO`;
* prova Clinical/D1 `NAO_APTO`;
* configuração comercial de Service;
* política de desconto persistente/configurável;
* política de sinal persistente/configurável;
* adapters reais de `DiscountPolicyPort`;
* adapter real de `DepositPolicyPort`;
* `CalculateCommercialTerms → READY`;
* snapshots/identificadores da policy aplicada;
* D1 migration;
* testes unitários;
* testes Workers;
* integração Billing RPC;
* matriz final `CreateAppointmentReadiness`.

Não entram:

* `POST /appointments`;
* pagamento do sinal;
* confirmação do sinal;
* desconto manual excepcional completo;
* workflow de aprovação administrativa completo;
* Payment;
* Refund;
* Package;
* Session;
* Queue;
* Cron;
* Outbox consumer;
* KV;
* R2.

---

# 3. Gate inicial

Executar primeiro o gate já construído:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:physical-safety
```

Resultado obrigatório:

```text
exit code 0
```

Se isso regredir, corrigir antes de implementar Commercial Policies.

---

# 4. Fechar a prova Clinical pendente

Antes de tocar no Billing, completar a única pendência física registrada.

Criar no D1 auxiliar do Clinical:

```text
Tenant A
Customer A
Service S
Assessment A
result = APTO
```

Executar pelo caminho real:

```text
Operations
   ↓
AssessmentEligibilityPort
   ↓
CLINICAL_SERVICE
   ↓
Clinical Worker
   ↓
AssessmentRepository
   ↓
D1
```

Resultado:

```text
READY
```

---

# 5. Prova `NAO_APTO`

Repetir com:

```text
result = NAO_APTO
```

Resultado:

```text
BLOCKED
```

A documentação define explicitamente avaliações `apto`, `apto com restrições` e `não apto`, e serviços que exigem avaliação não devem prosseguir sem liberação adequada. 

---

# 6. Cross-tenant Clinical

Também fechar:

```text
Tenant A
Customer A
Service A
```

não pode utilizar:

```text
Assessment Tenant B
```

Mesmo que os demais identificadores coincidam.

Depois disso:

```text
ClinicalPhysicalQualification = PASS
```

---

# 7. Não alterar Assessment além disso

Não aproveitar para implementar:

```text
anamnese completa
alergias
medicamentos
fotos
consentimento
ficha clínica completa
```

O objetivo é apenas fechar a prova pendente.

---

# 8. Começar Commercial Policies pelas regras do Service

O `Service` já possui conceitos normativos suficientes:

```text
permite desconto

exige sinal
sinal fixo
sinal percentual

preço mínimo
```



Isso deve virar configuração técnica persistida, se ainda não virou no PR-06/10.

---

# 9. Inspecionar o Service atual

Pesquisar:

```bash
grep -R "allowsDiscount" apps/operations-worker/src -n || true
grep -R "requiresDeposit" apps/operations-worker/src -n || true
grep -R "deposit" apps/operations-worker/src/services -n || true
grep -R "minimumPrice" apps/operations-worker/src -n || true
```

Não duplicar campos equivalentes que já existam.

---

# 10. Formalizar configuração comercial do Service

Conceitualmente:

```text
ServiceCommercialConfig

allowsDiscount

minimumPriceCents?

deposit:
  NOT_REQUIRED
  FIXED
  PERCENTAGE
```

Para sinal:

```text
FIXED
  → amountCents

PERCENTAGE
  → percentageBasisPoints / representação inteira equivalente
```

Não usar float.

---

# 11. Não colocar `depositCents = 0` para sinal não exigido

O PR-10 acertou ao distinguir ausência de sinal de valor zero.

Continuar:

```text
depositRequired = false
deposit = absent
```

e não:

```text
depositRequired = false
depositCents = 0
```

como única representação semântica.

---

# 12. Representação percentual sem float

Se percentual for persistido, usar uma representação inteira.

Por exemplo:

```text
basis points
```

ou outra convenção já adotada.

Exemplo conceitual:

```text
20% = 2000 bp
```

Não usar:

```ts
0.2
```

como valor financeiro de domínio.

---

# 13. Não inventar percentuais default

Proibido:

```text
deposit = 20%
discount = 10%
```

só porque os exemplos da documentação usam esses valores.

Os valores devem ser configuráveis pela empresa. 

---

# 14. Criar Discount Policy como domínio real

No `billing-worker`, se ainda não existe:

```bash
nest g class \
  discounts/domain/discount-policy \
  --project billing-worker \
  --no-spec
```

Uma policy configurada pode conter, conforme RN-DES-001:

```text
id
tenantId

customerProfile

type
  PERCENTAGE
  FIXED

value

eligibleServices?
eligibleCategories?
eligiblePackages?

minimumPurchaseCents?
maximumDiscountCents?

validFrom?
validUntil?

singleUse

requiresApproval

stackable

priority?
```

Nem todos precisam ser obrigatórios.

A documentação permite esses atributos; não significa que todos devam existir em toda policy. 

---

# 15. Tenant é obrigatório em DiscountPolicy

Toda policy precisa ser:

```text
tenant-owned
```

Nunca:

```text
global discount policy
```

a menos que exista regra futura específica para isso.

---

# 16. Criar DiscountPolicyRepository

Via CLI:

```bash
nest g interface \
  discounts/ports/discount-policy-repository \
  --project billing-worker
```

Operação orientada ao caso de uso, por exemplo:

```text
findApplicablePolicies(
  tenantId,
  profile,
  serviceId,
  category,
  amount,
  at
)
```

Não:

```text
findAll()
```

---

# 17. Criar adapter D1

```bash
nest g provider \
  discounts/adapters/d1-discount-policy-repository \
  --project billing-worker
```

O adapter conhece SQL.

Domain/Application não.

---

# 18. Implementar `DiscountPolicyPort` real

Hoje:

```text
DiscountPolicyPort
       ↓
Unavailable
```

deve virar:

```text
DiscountPolicyPort
       ↓
ConfiguredDiscountPolicyAdapter
       ↓
DiscountPolicyRepository
       ↓
D1
```

na composição principal do Billing Worker.

---

# 19. Caminho normativo sem desconto

Aqui existe um detalhe importante.

Se:

```text
Service.allowsDiscount = false
```

então o resultado correto pode ser explicitamente:

```text
discountCents = 0
```

porque o próprio serviço proíbe desconto.

Isso **não é um fallback inventado**.

É uma decisão normativa.

Fluxo:

```text
allowsDiscount = false
        ↓
NO_DISCOUNT
        ↓
discountCents = 0
```

---

# 20. Quando `allowsDiscount=true`

Nesse caso o sistema deve localizar políticas aplicáveis, porque RN-DES-002 exige identificar perfil, localizar políticas válidas, validar serviço/período/uso/limite e salvar a regra aplicada. 

Logo:

```text
allowsDiscount=true
+
policy infrastructure unavailable
        ↓
BLOCKED
```

continua correto.

---

# 21. Nenhuma policy aplicável é diferente de infraestrutura indisponível

Formalizar:

```text
POLICY_SYSTEM_UNAVAILABLE
    → BLOCKED
```

versus:

```text
POLICY_SYSTEM_AVAILABLE
+
no applicable policy
    → NO_DISCOUNT
```

Isso é uma diferença essencial.

---

# 22. Implementar cálculo percentual

Para uma policy válida:

```text
discount =
basePrice × configuredPercentage
```

com aritmética inteira e arredondamento normativo documentado.

Se a documentação não define arredondamento:

* escolher convenção técnica determinística;
* registrar em `billing-contracts.md`;
* não usar floating point.

---

# 23. Implementar desconto fixo

```text
discountCents =
configuredFixedAmountCents
```

Depois aplicar limites.

---

# 24. Aplicar RN-DES-004

O desconto não pode:

```text
gerar preço negativo
ultrapassar o valor da operação
reduzir abaixo do preço mínimo
ultrapassar limite autorizado
```



Então:

```text
discount <= basePrice
```

já existente no PR-10 é apenas uma parte da policy completa.

---

# 25. Preço mínimo do Service

Se:

```text
minimumPriceCents
```

está configurado:

```text
finalPriceCents >= minimumPriceCents
```

Logo:

```text
maximumEffectiveDiscount =
basePrice - minimumPrice
```

---

# 26. Não implementar aprovação completa neste PR

RN-DES-006 define:

```text
Aguardando aprovação
Administrador:
- aprova
- recusa
- ajusta

recepção não aprova o próprio pedido
```



Esse fluxo possui lifecycle próprio.

Não precisa ser completamente implementado para liberar um caminho simples de `CreateAppointment`.

Neste PR:

```text
requiresApproval = false
→ policy pode resultar READY

requiresApproval = true
→ BLOCKED / APPROVAL_REQUIRED
```

até um PR específico de aprovação excepcional.

---

# 27. Não permitir autoaprovação implícita

Nunca:

```text
requiresApproval=true
→ admin actor → automaticamente aprovado
```

A aprovação precisa ser uma operação explícita e auditável.

---

# 28. Acúmulo

RN-DES-007 define que descontos não são acumuláveis por padrão. Quando várias policies forem aplicáveis, deve ser usada a mais vantajosa ou a prioridade configurada, e a estratégia deve ser registrada. 

Para MVP:

```text
stacking default = false
```

é normativo.

---

# 29. Estratégia múltiplas policies

Modelar configuração:

```text
BEST_FOR_CUSTOMER
PRIORITY
```

somente se já existir configuração da empresa.

Se nenhuma estratégia estiver configurada e houver múltiplas policies ambíguas:

```text
BLOCKED / DISCOUNT_POLICY_AMBIGUOUS
```

é mais seguro que escolher silenciosamente.

---

# 30. Uso único

Se `singleUse=true`, o PR precisará saber se a policy já foi consumida.

Não inventar histórico.

Criar port/repository apropriado ou manter:

```text
single-use policy
+
usage tracking unavailable
→ BLOCKED
```

É aceitável que o primeiro caminho `READY` utilize policy sem `singleUse`.

---

# 31. Congelamento do desconto

O resultado deve trazer identidade suficiente da regra aplicada.

Por exemplo:

```text
discountPolicyId
discountPolicyVersion / snapshot fields
customerProfileAtCalculation
discountType
discountValue
discountCents
```

A documentação exige que a política e o desconto utilizados permaneçam congelados na operação. 

---

# 32. Criar Deposit Policy real

Do lado do Billing:

```bash
nest g class \
  deposits/domain/deposit-policy \
  --project billing-worker \
  --no-spec
```

Ela recebe a configuração do Service.

---

# 33. Casos normativos de Deposit

A documentação é explícita:

```text
NOT_REQUIRED
FIXED
PERCENTAGE
```



Portanto os três podem ser implementados sem inventar comportamento.

---

# 34. Deposit não exigido

```text
requiresDeposit = false
        ↓
depositRequired = false
deposit = absent
```

Isso já fornece um caminho comercial válido.

---

# 35. Deposit fixo

```text
requiresDeposit=true
mode=FIXED
amountCents=X
```

Resultado:

```text
depositCents = X
```

desde que:

```text
0 <= X <= finalPriceCents
```

---

# 36. Deposit percentual

RN-SIN-002 é explícita:

```text
Preço-base
− desconto
= preço final

Preço final
× percentual do sinal
= sinal
```



Logo o cálculo deve ocorrer **depois do desconto**.

---

# 37. Nunca calcular sinal sobre preço-base

Provar com teste:

```text
basePrice = 20000
discount  = 2000
final     = 18000

deposit 20%
```

A base é:

```text
18000
```

e não:

```text
20000
```

Os números do teste são fixture, não configuração default.

---

# 38. Limite

RN-SIN-003:

```text
depositCents <= finalPriceCents
```



Já existe invariant no `CommercialTerms`; preservar nos dois níveis.

---

# 39. Criar `DepositPolicyPort` real

Hoje:

```text
DepositPolicyPort
      ↓
Unavailable
```

passa a:

```text
DepositPolicyPort
      ↓
ConfiguredDepositPolicyAdapter
```

Se configuração comercial do Service vier do Operations via request:

```text
Billing não consulta Service D1 do Operations
```

Isso preserva ownership.

---

# 40. Expandir CommercialTerms request

Se necessário, o contrato Operations → Billing deve passar um snapshot comercial explícito do Service.

Algo como:

```text
ServiceCommercialContext
├── serviceId
├── basePriceCents
├── minimumPriceCents?
├── allowsDiscount
├── depositMode
├── depositFixedCents?
└── depositPercentage?
```

Não compartilhar a entidade `Service`.

---

# 41. Operations continua autoridade do cadastro Service

Billing apenas recebe o contexto necessário para calcular.

Não fazer:

```text
Billing
→ SELECT services
```

na tabela ownership do Operations.

---

# 42. RelationshipProfile também entra no contexto

Discount por perfil exige:

```text
customerProfile
```

O produto diz explicitamente que o perfil influencia o tratamento comercial e que valores/critérios são configuráveis pela empresa. 

Então Operations pode fornecer o snapshot:

```text
relationshipProfile
```

ao Billing.

---

# 43. Billing não recalcula perfil

Proibido:

```text
Billing
→ contar sessões
→ recalcular CustomerProfile
```

Billing recebe o perfil autoritativo.

---

# 44. Novo fluxo de `CalculateCommercialTerms`

Depois do PR:

```text
Request
   │
   ▼
CalculateCommercialTerms
   │
   ├── validate ServiceCommercialContext
   │
   ├── resolve DiscountPolicy
   │       ├── no discount allowed → 0
   │       ├── no applicable policy → 0
   │       ├── applicable → calculate
   │       ├── approval required → BLOCKED
   │       └── unavailable/ambiguous → BLOCKED
   │
   ├── calculate final price
   │
   ├── resolve DepositPolicy
   │       ├── NOT_REQUIRED
   │       ├── FIXED
   │       └── PERCENTAGE(finalPrice)
   │
   └── CommercialTerms
           ↓
         READY
```

---

# 45. Primeiro caminho obrigatório `READY`

Precisamos pelo menos provar este caminho totalmente normativo:

```text
Service:
  allowsDiscount = false
  deposit = NOT_REQUIRED

basePrice = valid
```

Resultado:

```text
discountCents = 0
finalPriceCents = basePrice
depositRequired = false

CommercialTerms = READY
```

Esse caminho é sustentado pelas regras do Service e do sinal; não é fallback permissivo.

---

# 46. Segundo caminho obrigatório

```text
allowsDiscount = false
deposit = FIXED
```

Resultado:

```text
READY
```

se valor válido.

---

# 47. Terceiro caminho obrigatório

```text
allowsDiscount = false
deposit = PERCENTAGE
```

Resultado:

```text
READY
```

calculado sobre `finalPrice`.

---

# 48. Quarto caminho

```text
allowsDiscount = true
+
applicable configured discount policy
+
deposit configuration valid
```

Resultado:

```text
READY
```

Isso prova a integração completa.

---

# 49. Caminho sem policy aplicável

Quando o sistema de policies está operacional mas nenhuma policy corresponde:

```text
discount = 0
```

desde que a documentação/configuração permita simplesmente não haver desconto.

Não confundir com:

```text
policy repository unavailable
```

que continua `BLOCKED`.

---

# 50. Migration do PR

Criar:

```text
database/d1/migrations/
0005_commercial_policy_materialization.sql
```

Ajustar número se houver outra migration real.

---

# 51. Onde persistir DiscountPolicy?

Como Billing é authority, a tabela deve pertencer logicamente ao Billing:

```text
discount_policies
```

com `tenant_id`.

Mesmo usando D1 compartilhado no Free-first, ownership continua lógico.

---

# 52. Schema mínimo

Conceitualmente:

```text
discount_policies

id
tenant_id

customer_profile

discount_type
discount_value

minimum_purchase_cents
maximum_discount_cents

valid_from
valid_until

requires_approval
single_use
stackable
priority

status

created_at
updated_at
```

Campos de escopo `service/category` podem exigir tabela associativa se múltiplos valores forem permitidos.

Não force JSON se queries de applicability precisarem scan.

---

# 53. Service commercial config migration

Atualizar `services` com os campos que ainda não existem, por exemplo:

```text
allows_discount
minimum_price_cents

deposit_mode
deposit_fixed_cents
deposit_percentage_basis_points
```

Mas somente aqueles ausentes do schema atual.

---

# 54. Constraints

Garantir:

```text
minimum_price >= 0

fixed_deposit >= 0

percentage >= 0

percentage <= 100%
```

e exclusividade coerente:

```text
NOT_REQUIRED
→ fixed=null
→ percentage=null

FIXED
→ fixed set
→ percentage=null

PERCENTAGE
→ percentage set
→ fixed=null
```

quando D1 constraints permitirem.

Também validar em Domain.

---

# 55. Índices

Discount query principal provavelmente precisa começar por:

```text
tenant_id
status
customer_profile
```

e depois filtrar elegibilidade.

Criar índices a partir da query real.

Não adicionar índices especulativos demais.

---

# 56. Testes unitários — Discount

Cobrir:

```text
service disallows discount
→ 0
```

```text
fixed policy
→ correct cents
```

```text
percentage policy
→ deterministic cents
```

```text
discount > base
→ reject
```

```text
final < minimum price
→ clamp/reject conforme policy normativa
```

Eu recomendaria **reject/policy not applicable**, não alterar silenciosamente o desconto, a menos que o contrato determine ajuste.

---

# 57. Teste aprovação

```text
requiresApproval=true
+
no approved decision
→ BLOCKED
```

Não aprovar automaticamente.

---

# 58. Teste múltiplas policies

Quando não acumuláveis:

```text
Policy A
Policy B
```

usar a estratégia configurada.

Se estratégia:

```text
BEST_FOR_CUSTOMER
```

selecionar maior benefício válido.

---

# 59. Testes Deposit

Cobrir:

```text
NOT_REQUIRED
→ absent
```

```text
FIXED
→ exact cents
```

```text
PERCENTAGE
→ finalPrice × %
```

```text
deposit > final
→ reject
```

---

# 60. Teste desconto + sinal

Esse é essencial:

```text
base
↓
discount
↓
final
↓
deposit
```

e não:

```text
base
↓
deposit
↓
discount
```

A ordem é normativamente explícita. 

---

# 61. Congelamento

`CommercialTermsResponse` precisa devolver tudo que o futuro Appointment precisará congelar:

```text
basePriceCents

customerProfileSnapshot

discount:
  applied
  policyId?
  policy snapshot/reference
  amountCents

finalPriceCents

deposit:
  required
  mode
  configuredValue?
  calculatedCents?
```

Isso prepara RN-GER-004 e RN-DES-003.

---

# 62. Não persistir Appointment snapshot ainda

Billing calcula e retorna.

É o futuro `CreateAppointmentUseCase` que deverá congelar esses Terms dentro de Appointment.

Não criar essa operação neste PR.

---

# 63. RPC real Operations → Billing

Atualizar o adapter real:

```text
CommercialTermsPort
        ↓
BILLING_SERVICE
        ↓
CalculateCommercialTerms
```

para transmitir a nova configuração comercial.

---

# 64. Worker test: caminho sem desconto/sinal

No `workerd`:

```text
Operations
→ Billing
```

com configuração:

```text
allowsDiscount=false
deposit=NOT_REQUIRED
```

Resultado obrigatório:

```text
transport = PASS
business  = READY
```

Esse é o gate mais importante deste PR.

---

# 65. Worker test: desconto real

Inserir DiscountPolicy no D1 Billing.

Chamar pelo RPC.

Resultado deve refletir a row persistida.

Não fake.

---

# 66. Worker test: sinal percentual

Service context:

```text
deposit=PERCENTAGE
```

Resultado via RPC:

```text
READY
```

com cálculo sobre finalPrice.

---

# 67. Tenant isolation comercial

Policy do:

```text
Tenant A
```

não pode ser aplicada ao:

```text
Tenant B
```

Teste físico obrigatório.

---

# 68. Profile isolation

Uma policy:

```text
NEW
```

não deve ser aplicada automaticamente ao perfil:

```text
LOYAL/ASSIDUO
```

e vice-versa.

Usar nomes canônicos existentes no domínio.

---

# 69. Service eligibility

Policy restrita ao:

```text
Service A
```

não se aplica ao:

```text
Service B
```

se esse filtro estiver configurado.

---

# 70. Expiração

Policy fora da validade:

```text
not applicable
```

Não recalcular usando policy vencida.

---

# 71. Observabilidade

Billing deve registrar apenas:

```text
operation=CalculateCommercialTerms
tenantId
serviceId
customerProfile
result
discountOutcome
depositOutcome
duration
correlationId
```

Não Customer PII.

---

# 72. Audit?

O simples cálculo:

```text
CalculateCommercialTerms
```

não precisa necessariamente gerar Audit persistente.

A documentação exige auditoria do desconto aplicado/alterações críticas, mas neste PR estamos materializando cálculo/configuração. A criação autoritativa do Appointment no PR-12 deverá registrar a regra efetivamente aplicada. Eventos de desconto e aprovação estão entre os eventos auditáveis. 

---

# 73. Outbox?

Também não criar Outbox para todo cálculo consultivo.

Isso geraria write amplification desnecessário.

No PR-12:

```text
appointment.created
```

poderá carregar referência aos Terms congelados.

---

# 74. Free Tier

Esse PR precisa evitar:

```text
Billing RPC
→ scan de todas policies do tenant
```

Query precisa ser bounded por:

```text
tenant
status
profile
date
```

e depois elegibilidade.

---

# 75. Não usar KV

Policy comercial pode mudar e interfere diretamente no preço.

Primeiro D1 consistente.

Cache pode vir depois.

---

# 76. Reexecutar physical safety

Após migrations/alterações do Service:

```bash
npm run gate:physical-safety
```

Tem que continuar:

```text
exit 0
```

Nenhuma regressão de:

```text
Scheduling
Reliability
Tenant isolation
Clinical
```

é aceitável.

---

# 77. Criar gate final de readiness

Agora sim criar:

```bash
npm run gate:create-appointment
```

ou equivalente.

Ele deve rodar:

```text
physical safety
+
commercial policy workers tests
+
dry-runs
```

---

# 78. Expressão de readiness

Documentar:

```text
CreateAppointmentReady =
  PhysicalSafetyGate
  AND ClinicalPersistenceQualified
  AND BillingRpcQualified
  AND CommercialTermsReadyPathExists
```

---

# 79. Matriz final

Ao terminar:

| Capability             | Resultado |
| ---------------------- | --------: |
| Unit tests             |      PASS |
| Worker tests           |      PASS |
| HTTP Security          |      PASS |
| D1                     |      PASS |
| Tenant isolation       |      PASS |
| Context isolation      |      PASS |
| Scheduling concurrency |      PASS |
| Reliability            |      PASS |
| Idempotency            |      PASS |
| Clinical RPC           |      PASS |
| Clinical APTO D1       |      PASS |
| Clinical NAO_APTO D1   |      PASS |
| Billing RPC            |      PASS |
| Discount Policy        |      PASS |
| Deposit Policy         |      PASS |
| CommercialTerms READY  |      PASS |

---

# 80. `POST /appointments` continua proibido

Mesmo que a matriz passe no meio do PR:

```text
não avançar automaticamente
```

Fechar PR-11.8 primeiro.

Isso mantém diffs pequenos e reversíveis.

---

# 81. Definition of Done — Clinical closure

```text
[ ] APTO persistido em D1

[ ] Operations → Clinical → D1 → READY

[ ] NAO_APTO persistido em D1

[ ] Operations → Clinical → D1 → BLOCKED

[ ] cross-tenant Assessment não utilizado

[ ] Clinical physical qualification = PASS
```

---

# 82. Definition of Done — Service commercial config

```text
[ ] allowsDiscount normativo

[ ] minimumPriceCents quando configurado

[ ] deposit mode:
    NOT_REQUIRED
    FIXED
    PERCENTAGE

[ ] fixed deposit em cents

[ ] percentage sem floating point

[ ] nenhuma configuração default inventada
```

---

# 83. Definition of Done — Discount

```text
[ ] DiscountPolicy domain

[ ] tenant-aware

[ ] profile-aware

[ ] D1 repository

[ ] real DiscountPolicyPort adapter

[ ] service allowsDiscount=false → NO_DISCOUNT válido

[ ] applicable fixed discount PASS

[ ] applicable percentage discount PASS

[ ] minimum price protegido

[ ] maximum discount protegido

[ ] validity protegida

[ ] approval-required → BLOCKED

[ ] no accidental stacking

[ ] applied policy identifiable for snapshot
```

---

# 84. Definition of Done — Deposit

```text
[ ] DepositPolicy real

[ ] NOT_REQUIRED PASS

[ ] FIXED PASS

[ ] PERCENTAGE PASS

[ ] percentual usa finalPrice

[ ] deposit <= finalPrice

[ ] no default percentage invented

[ ] DepositPolicyPort real
```

---

# 85. Definition of Done — CommercialTerms

```text
[ ] base price preservado

[ ] discount separado

[ ] final price determinístico

[ ] deposit separado

[ ] monetary values integer

[ ] at least one normative READY path

[ ] discount + deposit READY path PASS

[ ] policy unavailable still BLOCKED

[ ] policy ambiguous BLOCKED

[ ] tenant isolation PASS
```

---

# 86. Definition of Done — RPC

```text
[ ] Operations → Billing RPC real

[ ] READY atravessa Service Binding

[ ] BLOCKED atravessa Service Binding

[ ] correlationId preservado

[ ] nenhum HTTP interno público

[ ] nenhum Domain entity compartilhado
```

---

# 87. Definition of Done — migrations

```text
[ ] migration 0005 criada

[ ] banco vazio aplica 0001–0005

[ ] migrations workerd PASS

[ ] reaplicação → no pending migrations

[ ] indexes verificados
```

---

# 88. Definition of Done — qualidade

```text
[ ] npm run lint PASS

[ ] tsc --build --force PASS

[ ] unit tests PASS

[ ] workers tests PASS

[ ] commercial policy tests PASS

[ ] Clinical persistence tests PASS

[ ] gate:physical-safety PASS

[ ] gate:create-appointment PASS

[ ] Operations dry-run PASS

[ ] Clinical dry-run PASS

[ ] Billing dry-run PASS

[ ] git diff --check PASS
```

---

# 89. O que não entra

```text
POST /appointments

ConfirmDeposit
ExpireDeposit
Deposit payment lifecycle

ApproveExceptionalDiscount completo

Payment
Refund
Credit
Package

Session

Queue
Cron
Outbox consumer

KV
R2
```

---

# 90. Relatório pós-PR

O Codex deve fechar com:

```text
PR-11.8 — Commercial Policy Materialization + Final Appointment Readiness

Clinical Closure
APTO D1:
NAO_APTO D1:
cross-tenant:

Service Commercial Config
discount:
deposit:
minimum price:

Discount Policy
repository:
fixed:
percentage:
minimum price:
approval:
stacking:
tenant isolation:

Deposit Policy
not required:
fixed:
percentage:
after discount:

CommercialTerms
no-discount/no-deposit:
discount path:
deposit path:
discount+deposit path:
READY achievable:

RPC
Operations → Billing:
READY transport:
BLOCKED transport:
correlation:

Migrations
0001–0005:

Physical Safety Regression
unit:
workers:
scheduling:
reliability:
idempotency:
tenant isolation:

CreateAppointmentReadiness
runtime:
security:
D1:
clinical:
commercial:
concurrency:
reliability:
idempotency:

Final result:
READY / BLOCKED

Next PR:
```

---

# Depois do PR-11.8

Se este PR for concluído como descrito, **não há motivo arquitetural para outro PR-11.x**.

O próximo deve finalmente ser:

# PR-12 — CreateAppointment Authoritative Flow

A cadeia ficará:

```text
POST /tenants/:tenantId/appointments
                 │
                 ▼
          Authentication
                 │
                 ▼
            Trusted Tenant
                 │
                 ▼
       Idempotency boundary
                 │
                 ▼
      AppointmentEligibility
         ├── Tenant
         ├── License
         ├── Plan
         ├── Customer
         ├── Restriction
         ├── Service
         ├── Professional
         ├── Assessment → Clinical
         └── Availability
                 │
                 ▼
       CommercialTermsPort
                 │
                 ▼
          Billing Worker
         ├── DiscountPolicy
         └── DepositPolicy
                 │
                 ▼
             UnitOfWork
        ┌────────┼────────┐
        ▼        ▼        ▼
   reserve    Audit     Outbox
    slot
        │
        ▼
   Appointment
    snapshot
        │
        ▼
 Idempotency.complete
        │
        ▼
      COMMIT
        │
        ▼
   201 Created
```

Esse fluxo atende à regra de que o agendamento deve carregar empresa, cliente, serviço, profissional, intervalo, preço-base, desconto, preço final, sinal, origem e status, enquanto desconto e sinal são calculados antes e depois congelados historicamente.

Portanto, **PR-11.8 deve ser o último PR preparatório: fechar a persistência Clinical que restou e materializar Discount/Deposit Policies reais. Se `gate:create-appointment` sair com `exit code 0`, o PR-12 fica formalmente liberado.**
