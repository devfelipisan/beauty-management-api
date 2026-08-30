O próximo PR deve ser o **PR-10 — Billing Worker Foundation + Commercial Terms**, com foco em tornar o Billing a autoridade para **desconto, preço final e sinal**, sem ainda implementar pagamento completo.

O objetivo é destravar a última parte comercial necessária para o futuro `CreateAppointment`, preservando a separação entre:

```text
Operations
  → eligibility / scheduling

Billing
  → pricing / discount / deposit
```

e mantendo `POST /appointments` ainda bloqueado até que Operations consiga consumir esses termos comerciais de forma confiável.

# PR-10 — Billing Worker Foundation + Commercial Terms

## 1. Objetivo

Entregar:

```text
billing-worker
+
Discount
+
Deposit
+
CommercialTerms
+
ports/contracts
+
D1 adapters
+
migrations
+
observability
+
health
```

Sem implementar ainda:

```text
Payment
Refund
Package
Credit
Session
R2
KV
Queue
Outbox consumer
CreateAppointment
```

## 2. Gate zero — não carregar passivos do ambiente

O relatório do PR-09 ainda informa:

```text
Vitest        BLOCKED
Wrangler      BLOCKED
D1 local      NOT EXECUTED
Concurrency   NOT PROVEN
```

Antes de avançar:

```bash
pwd
git status
git branch --show-current
git log --oneline -20

node --version
npm --version
cat package.json
```

Identificar o lockfile e restaurar a instalação correta.

Depois exigir:

```bash
npm run lint
npm run test
npx tsc --build
npx wrangler --version
```

Não trocar framework de testes nem atualizar dependências indiscriminadamente.

## 3. Executar migrations 0001–0003 localmente

Listar:

```bash
find database/d1/migrations \
  -maxdepth 1 \
  -type f \
  -print | sort
```

Aplicar:

```bash
npx wrangler d1 migrations apply <database-name> --local
```

O nome deve vir da configuração real.

## 4. Fechar a prova concorrente do PR-08

Antes de Billing, ainda precisa existir prova física de que:

```text
2 reservas simultâneas
mesmo profissional
mesmo intervalo
```

resultam em:

```text
1 sucesso
1 conflito
```

Se isso não puder ser comprovado, registrar como blocker do `CreateAppointment`.

Não impedir necessariamente a criação do Billing Worker, mas o roadmap deve continuar impedindo o endpoint final de agendamento.

---

# 5. Criar `billing-worker`

Via Nest CLI:

```bash
nest g app billing-worker
```

Depois:

```bash
find apps/billing-worker -maxdepth 5 -type f | sort
```

Inspecionar o scaffold.

Se for apenas Hello World:

```bash
rm apps/billing-worker/src/app.controller.ts
rm apps/billing-worker/src/app.controller.spec.ts
rm apps/billing-worker/src/app.service.ts
```

Ajustar o `AppModule`.

## 6. Criar Health

```bash
nest g module health --project billing-worker
nest g controller health --project billing-worker
```

Contrato:

```http
GET /health
```

Exemplo:

```json
{
  "status": "ok",
  "service": "beauty-billing-worker",
  "version": "local"
}
```

Health continua:

```text
0 D1 reads
0 D1 writes
0 audit
0 outbox
```

---

# 7. Reutilizar fundações existentes

O Billing Worker deve reutilizar:

```text
Config
Observability
ExecutionContext
Authentication
Tenancy
Database
Reliability
```

Não criar versões paralelas.

Estrutura:

```text
BillingWorkerModule
├── Config
├── Observability
├── Authentication
├── Tenancy
├── Database
├── Reliability
└── Health
```

---

# 8. Definir ownership do Billing Worker

Documentar:

```text
Billing owns:

Discount policy
Discount application
Deposit policy
Deposit lifecycle
Commercial Terms
Future Payment
Future Refund
Future Credit
Future Package
```

E explicitamente:

```text
Billing does NOT own:

Appointment scheduling
Availability
Customer lifecycle
Professional lifecycle
Service technical configuration
Clinical Session
Assessment
```

---

# 9. Criar documentação normativa antes do código

Adicionar ou atualizar:

```text
docs/business/billing-contracts.md
```

Ela deve congelar apenas regras já existentes.

Para Discount, registrar:

```text
base price
discount value/percentage
final price
snapshot
approval when exceptional
```

Para Deposit:

```text
required/not required
amount
status
expiration semantics
```

Não inventar percentuais, limites ou faixas.

---

# 10. Criar módulo `commercial-terms`

```bash
nest g module commercial-terms --project billing-worker
```

Não criar Controller ainda.

Primeiro domínio/application.

## 11. Criar `CommercialTerms`

```bash
nest g class \
  commercial-terms/domain/commercial-terms \
  --project billing-worker \
  --no-spec
```

Contrato conceitual:

```text
basePriceCents
discountCents
finalPriceCents
depositRequired
depositCents
```

Invariantes mínimas:

```text
basePriceCents >= 0
discountCents >= 0
discountCents <= basePriceCents

finalPriceCents =
basePriceCents - discountCents

depositCents >= 0
depositCents <= finalPriceCents
```

Não usar ponto flutuante.

---

# 12. Não calcular preço-base no Billing

O preço-base deve vir do Service no Operations.

Então futuramente:

```text
Operations
  → service.basePriceCents
  → Billing CommercialTerms
```

Billing não lê diretamente a tabela `services` se isso violar ownership.

Preferir contrato explícito.

---

# 13. Criar módulo Discount

```bash
nest g module discounts --project billing-worker
```

Criar entidade/value object se realmente necessário:

```bash
nest g class discounts/domain/discount \
  --project billing-worker \
  --no-spec
```

Evite entidade se o desconto for apenas valor calculado sem identidade própria.

---

# 14. Não inventar regras de desconto

Não criar:

```text
Novo = 0%
Assíduo = 10%
VIP = 15%
```

sem documentação normativa.

O domínio precisa refletir apenas regras efetivamente definidas.

Se o cálculo depender de configuração ainda ausente:

```text
discount decision unavailable
→ BLOCKED
```

não:

```text
discount = 0
```

automaticamente, caso isso possa alterar a regra comercial.

---

# 15. Criar `DiscountPolicyPort`

Se a policy vier de configuração/infra externa:

```bash
nest g interface \
  discounts/ports/discount-policy-port \
  --project billing-worker
```

Pergunta:

```text
qual desconto é permitido/aplicável?
```

e não:

```text
fetch all discount tables
```

---

# 16. Separar desconto normal de excepcional

Se a documentação exigir aprovação excepcional, modelar explicitamente:

```text
regular discount
exceptional discount
```

Não colocar:

```text
if actor.isAdmin → qualquer desconto
```

no controller.

A segregação de função continua sendo responsabilidade de Application/Policy.

---

# 17. Criar módulo Deposit

```bash
nest g module deposits --project billing-worker
```

Criar:

```bash
nest g class deposits/domain/deposit \
  --project billing-worker \
  --no-spec
```

se Deposit possuir identidade/lifecycle próprio, o que é coerente com a documentação existente.

---

# 18. Estados de Deposit

Usar apenas estados normativos existentes.

Não inventar novos estados para facilitar implementação.

Se a documentação canônica tiver algo equivalente a:

```text
PENDING
CONFIRMED
EXPIRED
CANCELED
```

formalizar exatamente esses estados.

Caso haja divergência, registrar antes do código.

---

# 19. Criar `DepositStateMachine`

```bash
nest g class \
  deposits/domain/deposit-state-machine \
  --project billing-worker \
  --no-spec
```

Ela deve ser:

```text
pure
deterministic
no I/O
no NestJS
no D1
```

---

# 20. Deposit é independente do Appointment status

Preservar:

```text
Appointment status
  ≠
Deposit status
```

Billing emite/retorna fatos comerciais/financeiros.

Operations decide sua própria transição através do use case coordenador.

---

# 21. Criar `DepositPolicy`

Se a regra for algo como:

```text
service/tenant requires deposit?
qual valor?
qual percentual?
```

criar:

```bash
nest g class \
  deposits/domain/deposit-policy \
  --project billing-worker \
  --no-spec
```

Mas apenas se os parâmetros normativos existirem.

---

# 22. Não inventar percentual padrão

Proibido:

```text
deposit = 30%
```

só porque é comum no mercado.

Se a regra não estiver normatizada:

```text
CommercialTerms = BLOCKED
```

até haver configuração válida.

---

# 23. Resultado de Commercial Terms deve ser fail-closed

Criar algo como:

```text
READY
BLOCKED
```

com motivos:

```text
DISCOUNT_POLICY_UNAVAILABLE
DISCOUNT_APPROVAL_REQUIRED
DEPOSIT_POLICY_UNAVAILABLE
INVALID_COMMERCIAL_TERMS
```

Somente quando suportados pelas regras.

---

# 24. Criar `CommercialTermsPolicy`

```bash
nest g class \
  commercial-terms/domain/commercial-terms-policy \
  --project billing-worker \
  --no-spec
```

Recebe fatos:

```text
base price
customer relationship profile
tenant commercial config
discount decision
deposit decision
```

e produz:

```text
CommercialTerms
```

Sem I/O.

---

# 25. Criar application service

```bash
nest g service \
  commercial-terms/application/calculate-commercial-terms \
  --project billing-worker
```

Responsabilidade:

```text
resolve required inputs
↓
invoke discount policy
↓
invoke deposit policy
↓
build CommercialTerms
```

---

# 26. Não consultar Customer diretamente no D1 do Billing

Se Terms dependem do perfil do Customer:

```text
Billing
  ↓
CustomerCommercialContextPort
```

ou receber o perfil como parte de um comando vindo do Operations.

Evitar:

```text
Billing D1 adapter
→ SELECT customer
```

se Customer pertence ao Operations.

Isso preserva ownership.

---

# 27. Preferir contexto compacto

Criar contrato tipo:

```text
CustomerCommercialContext
```

com apenas:

```text
customerId
relationshipProfile
```

e outros campos estritamente necessários.

Não transportar Customer completo.

---

# 28. Criar contrato compartilhado para Operations ↔ Billing

Em `libs/contracts`, se já existe:

```text
commercial-terms/
```

Criar contratos de transporte:

```text
CalculateCommercialTermsRequest
CommercialTermsResponse
```

Não compartilhar entidades de domínio.

---

# 29. Exemplo conceitual de request

```json
{
  "tenantId": "...",
  "customerId": "...",
  "serviceId": "...",
  "basePriceCents": 15000,
  "relationshipProfile": "NEW"
}
```

Mas só incluir campos normativamente necessários.

---

# 30. Exemplo de response

```json
{
  "status": "READY",
  "basePriceCents": 15000,
  "discountCents": 1000,
  "finalPriceCents": 14000,
  "depositRequired": true,
  "depositCents": 4000
}
```

Valores aqui são apenas estrutura, não regras fixas.

---

# 31. Criar Port no Operations

No `operations-worker`, o PR pode criar:

```bash
nest g interface \
  appointments/ports/commercial-terms-port \
  --project operations-worker
```

Contrato:

```text
Operations asks:
"calcule os termos comerciais para este candidato a Appointment"
```

Sem depender da implementação Billing.

---

# 32. Adapter `UnavailableCommercialTerms`

Enquanto Service Binding não estiver configurado:

```text
CommercialTermsPort
  ↓
Unavailable adapter
  ↓
BLOCKED
```

Nunca:

```text
AlwaysZeroDiscount
NoDeposit
```

como fallback.

---

# 33. Criar Service Binding somente se Billing Worker estiver executável

Depois de criar o Worker e contrato:

```text
operations-worker
   │
   │ Service Binding
   ▼
billing-worker
```

Configurar somente local/dry-run neste PR.

Não realizar deploy real.

---

# 34. Não usar HTTP público entre Workers por padrão

Preferir Service Binding.

A camada de contrato não deve saber se o transporte é:

```text
Service Binding
HTTP
mock
```

---

# 35. Criar adapter no Operations

Algo como:

```bash
nest g provider \
  appointments/adapters/billing-commercial-terms \
  --project operations-worker
```

Ele implementa:

```text
CommercialTermsPort
```

via Service Binding.

---

# 36. Não liberar `POST /appointments` automaticamente

Mesmo depois do CommercialTerms funcionar, ainda existem blockers do PR-09:

```text
License
Assessment
Customer restrictions
Plan limits
```

Enquanto qualquer um estiver indisponível:

```text
POST /appointments
→ continua ausente
```

---

# 37. Migration do Billing

Criar:

```text
database/d1/migrations/
└── 0004_billing_foundation.sql
```

Somente se Discount/Deposit tiverem estado persistente normativo.

---

# 38. Tabela `deposits`

Se necessária:

```text
id
tenant_id
appointment_id?
status
amount_cents
expires_at?
confirmed_at?
created_at
updated_at
```

Mas cuidado:

`appointment_id` ainda pode não existir funcionalmente.

Talvez neste PR seja melhor permitir:

```text
booking_reference / commercial_context_id
```

somente se normativo.

Não inventar FK prematuramente.

---

# 39. Melhor abordagem para Deposit antes de Appointment

Neste PR, eu preferiria implementar:

```text
DepositPolicy
DepositStateMachine
Deposit contracts
```

mas **não persistir Deposit real ainda**, caso o lifecycle dependa de Appointment existente.

Isso mantém o PR consistente.

---

# 40. Migration pode se limitar a configuração comercial

Se a documentação já tiver configurações tenant/service específicas, criar tabelas como:

```text
discount_policies
deposit_policies
```

somente se realmente normativas.

Caso contrário:

```text
nenhuma migration
```

é aceitável.

Não criar schema apenas para mostrar progresso.

---

# 41. Reliability no Billing

Quando uma mutação real de Deposit surgir:

```text
UnitOfWork
Idempotency
Audit
Outbox
```

devem ser reutilizados.

Não criar reliability paralela no Billing.

---

# 42. Eventos futuros de Deposit

Exemplos:

```text
deposit.created
deposit.confirmed
deposit.expired
```

Mas neste PR só persistir/auditar eventos se houver mutação real.

---

# 43. Não implementar Payment

Explicitamente fora:

```text
Payment
PaymentMethod
PaymentLedger
Refund
Credit
PackageMovement
```

Isso entra em PR posterior.

---

# 44. Não implementar cobrança SaaS

`Tenant plan/licensing` não é o mesmo que Billing operacional da clínica.

Evitar misturar:

```text
SaaS subscription
```

com:

```text
customer deposit/payment
```

São bounded contexts diferentes.

---

# 45. Testes CommercialTerms

Cobrir:

```text
base = 10000
discount = 0
→ final = 10000
```

```text
discount > base
→ reject
```

```text
deposit > final
→ reject
```

```text
negative monetary value
→ reject
```

---

# 46. Testes de centavos

Garantir que:

```text
R$ 119,90
```

seja representado como:

```text
11990
```

e que nenhum cálculo use floating point.

---

# 47. Testes de Discount fail-closed

```text
policy available
→ decision
```

```text
policy unavailable
→ BLOCKED
```

```text
approval required
→ BLOCKED / APPROVAL_REQUIRED
```

se isso existir normativamente.

---

# 48. Testes Deposit

Se FSM implementada:

```text
PENDING → CONFIRMED
valid
```

```text
CONFIRMED → EXPIRED
invalid
```

conforme estados/transições canônicos reais.

---

# 49. Testes de CommercialTerms boundary

Operations não pode:

```text
calcular desconto
calcular sinal
```

Architecture test deve falhar se aparecer:

```text
DiscountPolicy
DepositPolicy
```

dentro de `operations-worker`.

---

# 50. Testes Billing ownership

Billing não deve importar:

```text
Appointment entity
Customer entity
Service entity
```

de Operations.

Pode importar somente contratos compartilhados.

---

# 51. Teste Service Binding

Quando configurado localmente:

```text
Operations
→ CommercialTermsPort
→ Billing Service Binding
→ READY/BLOCKED
```

sem HTTP público.

---

# 52. Teste fail-closed quando Billing indisponível

```text
Billing binding unavailable
→ CommercialTerms BLOCKED
```

Não continuar com:

```text
discount = 0
deposit = 0
```

---

# 53. Observabilidade

Billing deve registrar apenas atributos seguros:

```text
operation
tenantId
actorId
serviceId
status
discountPolicyResult
depositPolicyResult
duration
```

Não registrar:

```text
customer name
email
phone
document
```

---

# 54. Audit vs telemetry

`CalculateCommercialTerms` puramente consultivo não precisa necessariamente gerar Audit.

Já:

```text
approve exceptional discount
confirm deposit
```

futuramente devem gerar Audit.

Não criar write amplification em consultas.

---

# 55. Free Tier

O PR deve medir:

```text
Operations eligibility calls
+
Billing commercial terms calls
```

Evitar fan-out excessivo.

Ideal:

```text
Operations
→ 1 Billing call
```

e não:

```text
Operations
→ Discount call
→ Deposit call
→ Config call
```

se tudo pode ser resolvido em um único `CalculateCommercialTerms`.

---

# 56. Um endpoint interno, não vários

Se Service Binding expõe RPC, preferir:

```text
calculateCommercialTerms(...)
```

em vez de:

```text
getDiscount()
getDeposit()
getPrice()
```

reduzindo chamadas e acoplamento.

---

# 57. Health do Billing permanece barato

```text
GET /health

D1 = 0
KV = 0
R2 = 0
Operations call = 0
```

---

# 58. Estrutura esperada

```text
apps/
├── operations-worker/
│   └── appointments/
│       └── ports/
│           └── commercial-terms-port.ts
│
└── billing-worker/
    └── src/
        ├── commercial-terms/
        │   ├── domain/
        │   ├── application/
        │   └── ...
        │
        ├── discounts/
        │   ├── domain/
        │   └── ports/
        │
        ├── deposits/
        │   └── domain/
        │
        └── health/
```

---

# 59. Arquitetura final do PR

```text
Operations Worker
       │
       │ CommercialTermsPort
       ▼
Service Binding
       │
       ▼
Billing Worker
       │
       ├── Discount
       ├── Deposit
       └── CommercialTerms
```

Operations continua autoridade de:

```text
Appointment
Availability
Eligibility
```

Billing passa a autoridade de:

```text
CommercialTerms
```

---

# 60. `POST /appointments` continua bloqueado por padrão

Após PR-10 a matriz ficará:

```text
Tenant operational          ✓
Customer active             ✓
Service active              ✓
Professional active         ✓
Professional enabled        ✓
Availability                ✓
Conflict                    ✓

License                     BLOCKED/port
Assessment                  BLOCKED/port
Customer restriction        BLOCKED/port
Plan limit                  BLOCKED/port

Commercial Terms            ✓ PR-10
Discount                    ✓ PR-10
Deposit decision            ✓ PR-10
```

Ainda não há autorização para CreateAppointment.

---

# 61. Definition of Done — Worker

```text
[ ] billing-worker criado via Nest CLI

[ ] Hello World removido

[ ] HealthModule criado

[ ] GET /health 200

[ ] health sem D1

[ ] shared Config reutilizada

[ ] shared Observability reutilizada

[ ] shared Reliability reutilizada

[ ] shared Auth/Tenancy reutilizadas quando aplicável
```

---

# 62. Definition of Done — domínio comercial

```text
[ ] CommercialTerms modelado

[ ] monetary values apenas em centavos

[ ] discount <= base price

[ ] final price determinístico

[ ] deposit <= final price

[ ] Discount rules somente normativas

[ ] Deposit rules somente normativas

[ ] nenhuma percentage inventada

[ ] fail-closed para policy indisponível

[ ] DepositStateMachine criada somente com estados normativos
```

---

# 63. Definition of Done — boundaries

```text
[ ] Operations não calcula Discount

[ ] Operations não calcula Deposit

[ ] Billing não importa entities de Operations

[ ] contracts compartilhados não contêm Domain entities

[ ] CommercialTermsPort criado em Operations

[ ] Service Binding usado quando possível

[ ] binding indisponível → BLOCKED

[ ] nenhum AlwaysAllow/NoDiscount fallback
```

---

# 64. Definition of Done — ambiente

Aqui eu tornaria obrigatório resolver os gaps acumulados:

```text
[ ] lint PASS

[ ] tsc --build PASS

[ ] Vitest PASS

[ ] Wrangler instalado/funcional

[ ] migrations 0001–0003 locais PASS

[ ] migration 0004 PASS se criada

[ ] PR-08 concurrency proof PASS

[ ] architecture tests PASS

[ ] billing build PASS

[ ] operations build PASS

[ ] health smoke dos dois Workers PASS

[ ] wrangler types PASS

[ ] wrangler dry-run PASS

[ ] git diff --check PASS
```

Se `Vitest`, `Wrangler` e a prova concorrente continuarem bloqueados, eu não consideraria mais o PR integralmente qualificado para servir de base ao `CreateAppointment`.

---

# 65. O que não deve aparecer

```text
POST /appointments

Payment
Refund
Credit
Package

Clinical Assessment implementation

License implementation

Plan implementation

Customer restriction implementation

Queue
Cron
Outbox consumer

R2
KV
```

---

# 66. Relatório final obrigatório

O Codex deve responder com:

```text
PR-10 — Billing Worker Foundation + Commercial Terms

Estado anterior

Environment/Gates

Billing worker foundation

CommercialTerms

Discount

Deposit

Normative rules used

Rules intentionally not invented

Operations CommercialTermsPort

Service Binding

Fail-closed behavior

Migration

Reliability

Observability

Free Tier impact

Architecture tests

Unit tests

Integration tests

Wrangler

Endpoints exposed

RN-AGE-001 coverage matrix

Remaining blockers

Next PR
```

---

# Próximo PR após o PR-10

Se esse PR fechar todos os gates, eu **não iria diretamente para Payment**.

O próximo deveria ser:

> **PR-11 — Appointment Admission Dependencies: License + Plan Limits + Customer Restrictions + Assessment Contract Integration**

Porque esses são os últimos blockers não comerciais de `RN-AGE-001`.

A sequência ideal passa a ser:

```text
PR-08
Scheduling Core
     ↓
PR-09
Eligibility Foundation
     ↓
PR-10
Billing / Commercial Terms
     ↓
PR-11
Admission Dependencies
License
Plan
Restrictions
Assessment integration
     ↓
PR-12
CreateAppointment Authoritative Flow
```

Somente no PR-12 o fluxo completo deveria aparecer:

```text
HTTP POST /appointments
        ↓
Authentication / Tenant
        ↓
Eligibility
        ↓
CommercialTerms
        ↓
Idempotency
        ↓
UnitOfWork
        │
        ├── reserve slot
        ├── Appointment
        ├── Audit
        ├── Outbox
        └── Idempotency completion
        ↓
COMMIT
        ↓
201
```

Esse caminho mantém a postura fail-closed que os PRs 08 e 09 já adotaram corretamente e evita introduzir um agendamento aparentemente funcional com regras críticas ainda simuladas.
