Considerando o estado **efetivamente alcançado no PR-11.4**, eu ainda não abriria o `PR-12 — CreateAppointment Authoritative Flow`.

O blocker agora está muito bem delimitado: **o código dos adapters RPC existe, os Workers bundlam, os bindings estão declarados, mas a topologia multi-Worker ainda não foi executada como uma única malha local conectada**. A documentação atual da Cloudflare confirma que Service Bindings funcionam em desenvolvimento local e recomenda como abordagem padrão executar múltiplos Workers em um único `wrangler dev` com múltiplos `-c`, justamente por oferecer a melhor compatibilidade com bindings. ([Cloudflare Docs][1])

Portanto, eu definiria o próximo PR como:

# PR-11.5 — Multi-Worker Runtime Harness + Physical Qualification

O objetivo é transformar:

```text
Operations Worker        PASS isolado
Clinical Worker          PASS isolado
Billing Worker           PASS isolado

CLINICAL_SERVICE         not connected
BILLING_SERVICE          not connected

RPC adapters             implementados
RPC físico               não provado

D1                       migrations PASS
Scheduling concurrency   não provada
Reliability              não provada fisicamente
Vitest                    bloqueado
```

em:

```text
                 workerd / Wrangler
                        │
                        ▼
                 Operations Worker
                  /             \
                 /               \
      CLINICAL_SERVICE       BILLING_SERVICE
             │                    │
             ▼                    ▼
      Clinical Worker        Billing Worker
             │
             ▼
             D1

Bindings                 CONNECTED
RPC Clinical             PASS
RPC Billing              PASS
Context isolation        PASS
D1 runtime               PASS
Concurrency              PASS
Reliability              PASS
Vitest                   PASS
```

O PR continua **sem `POST /appointments`**.

---

# 1. Escopo normativo do PR

Entram somente:

```text
multi-worker local runtime
Service Binding discovery
Clinical RPC qualification
Billing RPC qualification

context propagation
context isolation

D1 physical integration tests

Scheduling concurrent reservation proof

Reliability physical proof

Idempotency replay/conflict proof

Vitest recovery

Workers integration test harness

runtime documentation
```

Não entram:

```text
POST /appointments

novas regras de desconto
novas regras de sinal

Payment
Refund
Package
Credit

Session

R2
KV

Queue
Cron
Outbox consumer

BFF
```

---

# 2. Começar pelo estado real

Executar:

```bash
pwd
git status
git branch --show-current
git log --oneline -20
```

Depois:

```bash
find apps/operations-worker -maxdepth 6 -type f | sort
find apps/clinical-worker -maxdepth 6 -type f | sort
find apps/billing-worker -maxdepth 6 -type f | sort
```

Verificar:

```bash
cat apps/operations-worker/wrangler.jsonc
cat apps/clinical-worker/wrangler.jsonc
cat apps/billing-worker/wrangler.jsonc
```

---

# 3. O primeiro diagnóstico é comparar os `name`

A propriedade:

```json
"name": "..."
```

dos Workers é crítica.

Cloudflare resolve o `service` do Service Binding pelo **nome do Worker alvo**. A configuração do caller deve conter:

```json
{
  "services": [
    {
      "binding": "CLINICAL_SERVICE",
      "service": "<nome-exato-do-clinical-worker>"
    }
  ]
}
```

e:

```json
{
  "binding": "BILLING_SERVICE",
  "service": "<nome-exato-do-billing-worker>"
}
```

O campo `binding` é o nome disponível no `env`; `service` identifica o Worker de destino. ([Cloudflare Docs][1])

---

# 4. Criar teste estático de correspondência

Adicionar um teste/configuration check que garanta:

```text
operations.services[].service
        =
target wrangler.name
```

Por exemplo:

```text
CLINICAL_SERVICE.service
=
clinical wrangler.name

BILLING_SERVICE.service
=
billing wrangler.name
```

Isso evita um typo produzir eternamente:

```text
not connected
```

---

# 5. Verificar environments

Se algum Wrangler usar:

```text
env.production
env.staging
env.local
```

a Cloudflare exige que o nome de `service` corresponda ao Worker/environment efetivo, normalmente seguindo `<worker-name>-<environment>`. ([Cloudflare Docs][2])

Não assumir:

```text
service = beauty-clinical-worker
```

se o alvo efetivo no ambiente for:

```text
beauty-clinical-worker-local
```

ou equivalente.

---

# 6. Usar o modo recomendado de desenvolvimento multi-Worker

Em vez de começar com três processos separados, usar primeiro **um único comando**.

A Cloudflare atualmente recomenda essa modalidade como padrão por oferecer melhor compatibilidade com bindings. ([Cloudflare Docs][3])

Como Operations é o caller e deve ficar exposto via HTTP, ele deve ser o **primeiro config**:

```bash
npx wrangler dev \
  -c apps/operations-worker/wrangler.jsonc \
  -c apps/clinical-worker/wrangler.jsonc \
  -c apps/billing-worker/wrangler.jsonc
```

A ordem importa para a ergonomia local:

```text
1º config
→ primary Worker
→ exposto em localhost:8787

2º/3º
→ secondary Workers
→ acessíveis pelos bindings
```

([Cloudflare Docs][1])

---

# 7. Não colocar Clinical como primeiro config

Se executar:

```bash
wrangler dev \
  -c clinical \
  -c billing \
  -c operations
```

o Clinical será o Worker HTTP principal.

Para nossa arquitetura queremos:

```text
Operations
=
primary/local public entrypoint
```

Logo Operations primeiro.

---

# 8. Persistir estado local explicitamente

Para D1 e os testes físicos, definir uma pasta local previsível.

Por exemplo:

```bash
npx wrangler dev \
  -c apps/operations-worker/wrangler.jsonc \
  -c apps/clinical-worker/wrangler.jsonc \
  -c apps/billing-worker/wrangler.jsonc \
  --persist-to .wrangler/state
```

Se a versão instalada aceitar essa combinação.

Isso facilita:

```text
migrations
fixtures
integration tests
restarts
```

---

# 9. Gate imediato: bindings conectados

Ao subir o comando, o Operations deve mostrar algo equivalente a:

```text
Services:

CLINICAL_SERVICE:
beauty-clinical-worker
[connected]

BILLING_SERVICE:
beauty-billing-worker
[connected]
```

A própria documentação do Wrangler usa `connected/not connected` como sinal de descoberta de outro `wrangler dev`. ([Cloudflare Docs][1])

Se continuar:

```text
not connected
```

não avance para testes de domínio.

---

# 10. Criar script de desenvolvimento multi-worker

Depois de provar o comando manual, formalizar em `package.json`.

Por exemplo:

```json
{
  "scripts": {
    "dev:workers": "wrangler dev -c apps/operations-worker/wrangler.jsonc -c apps/clinical-worker/wrangler.jsonc -c apps/billing-worker/wrangler.jsonc"
  }
}
```

Não obrigatoriamente com esse nome, mas o repositório deve possuir um comando reproduzível.

Objetivo:

```bash
npm run dev:workers
```

e não depender de uma sequência manual esquecível.

---

# 11. Documentar alternativa de três processos

Wrangler atual também consegue descobrir Workers rodando em sessões separadas; esse suporte foi melhorado para comunicação cross-command. ([Cloudflare Docs][4])

Então documentar fallback:

```text
Terminal 1 → Clinical
Terminal 2 → Billing
Terminal 3 → Operations
```

Mas a estratégia principal continua:

```text
single multi-config command
```

---

# 12. Verificar compatibilidade RPC

Os métodos:

```text
checkAssessmentEligibility()
calculateCommercialTerms()
```

usam RPC.

Cloudflare exige `compatibility_date >= 2024-04-03` ou flag RPC apropriada. ([Cloudflare Docs][5])

Verificar nos três:

```bash
grep -R "compatibility_date" \
  apps/*-worker/wrangler.jsonc
```

Usar a política de compatibility date já definida no projeto.

Não criar dates diferentes sem motivo.

---

# 13. Clinical precisa ser `WorkerEntrypoint`

Para RPC direto, o Worker de destino deve usar uma classe que estenda:

```ts
WorkerEntrypoint
```

e expor métodos públicos. ([Cloudflare Docs][6])

Verificar Clinical:

```ts
export default class ClinicalWorker
  extends WorkerEntrypoint<Env> {
  async checkAssessmentEligibility(...) {}
}
```

ou equivalente válido.

---

# 14. Billing também

Mesmo princípio:

```ts
export default class BillingWorker
  extends WorkerEntrypoint<Env> {
  async calculateCommercialTerms(...) {}
}
```

---

# 15. Não usar somente object-style default para RPC

Isto:

```ts
export default {
  fetch() {}
}
```

é adequado para HTTP.

Mas para métodos RPC públicos a abordagem canônica é `WorkerEntrypoint`. ([Cloudflare Docs][6])

Se Clinical/Billing ainda estiverem usando apenas objeto com propriedades arbitrárias, corrigir.

---

# 16. Preservar `fetch()` também

Clinical/Billing podem continuar com:

```text
GET /health
```

Então seus `WorkerEntrypoint`s podem possuir:

```ts
async fetch(request: Request) {
  ...
}
```

mais:

```ts
async checkAssessmentEligibility(...) {}
```

ou:

```ts
async calculateCommercialTerms(...) {}
```

---

# 17. Operations pode continuar object-style

Se Operations apenas:

```text
recebe HTTP
chama bindings
```

não é obrigatório que seja `WorkerEntrypoint`.

Pode continuar:

```ts
export default {
  fetch(...)
}
```

desde que não precise expor RPC.

---

# 18. Tipar os bindings pelo Worker

Uma vantagem do RPC Cloudflare é poder usar tipos do entrypoint.

Porém preserve fronteiras.

Não faça Operations importar:

```text
Clinical Domain
```

ou:

```text
Billing Domain
```

Os tipos compartilhados devem continuar vindo de:

```text
libs/contracts
```

---

# 19. Gate RPC Clinical mínimo

Com os três conectados, criar uma chamada real:

```text
Operations
    ↓
env.CLINICAL_SERVICE
    ↓
checkAssessmentEligibility(...)
```

O objetivo inicial não é `READY`.

É provar:

```text
method reachable
contract serialized
result returned
```

---

# 20. Criar um harness interno de qualificação

Não exponha endpoint público permanente como:

```http
GET /test-clinical-binding
```

para produção.

Pode existir harness somente de test/runtime.

Por exemplo:

```text
test/runtime/
service-bindings/
```

que invoque o adapter real.

---

# 21. Teste Clinical — serviço sem avaliação

Dado:

```text
requiresAssessment = false
```

provar:

```text
Clinical invocation count = 0
```

Esse é um requisito funcional **e de Free Tier**.

---

# 22. Teste Clinical — APTO

Preparar:

```text
Tenant A
Customer A
Service S
Assessment APTO
```

Chamar através de:

```text
Operations
→ AssessmentEligibilityPort
→ Clinical binding
→ Clinical
→ D1
```

Esperado:

```text
READY
```

---

# 23. Teste NAO_APTO

Mesmo caminho:

```text
Assessment = NAO_APTO
```

resultado:

```text
BLOCKED
```

---

# 24. Testar APTO_COM_RESTRICOES

Preservar exatamente a semântica já implementada no PR-11.

Não alterar regra apenas para o integration test.

---

# 25. Binding Clinical quebrado

Criar um cenário controlado sem conexão ou com adapter que lança erro.

Resultado:

```text
requiresAssessment = true
+
Clinical unavailable
        ↓
BLOCKED
```

Fail-closed continua obrigatório.

---

# 26. Billing RPC físico

Agora:

```text
Operations
→ CommercialTermsPort
→ BILLING_SERVICE
→ Billing
→ CalculateCommercialTerms
```

---

# 27. O resultado provável continua BLOCKED

Como o PR-10 ainda possui:

```text
DiscountPolicyPort → unavailable
DepositPolicyPort  → unavailable
```

é provável obter:

```text
RPC transport = PASS
CommercialTerms = BLOCKED
```

Isso é esperado.

---

# 28. Não criar policy fake para obter READY

Proibido adicionar:

```text
NoDiscountPolicy
NoDepositPolicy
```

só para o RPC ficar verde, a menos que “sem desconto” e “sem sinal” sejam de fato configurações comerciais normativas representadas explicitamente.

Transport success não exige business `READY`.

---

# 29. Criar testes de propagação de correlation

Request original:

```text
correlationId = ABC
```

Clinical deve receber:

```text
ABC
```

Billing deve receber:

```text
ABC
```

Cada invocation gera novo `requestId`.

---

# 30. Não propagar o objeto ExecutionContext

Manter contratos explícitos:

```text
tenantId
actorId? se necessário
correlationId
business IDs
```

Não serializar:

```text
ExecutionContext completo
```

---

# 31. Context isolation passa a ser gate

O bridge já está funcional.

Agora precisamos provar que cache de runtime não mistura tenants.

---

# 32. Teste sequencial

Criar:

```text
Actor A → Tenant A
Actor B → Tenant B
```

Executar:

```text
request A
request B
request A
request B
```

Provar respostas corretas.

---

# 33. Teste concorrente

Executar:

```ts
await Promise.all([
  requestTenantA(),
  requestTenantB(),
]);
```

atravessando:

```text
Cloudflare HTTP bridge
```

e não chamando o UseCase diretamente.

---

# 34. Validar contexto

Para A:

```text
tenantId = A
actorId = actorA
requestId = requestA
```

Para B:

```text
tenantId = B
actorId = actorB
requestId = requestB
```

Sem cruzamento.

---

# 35. Teste de repetição

Executar algo como:

```text
100 requests
50 Tenant A
50 Tenant B
```

intercaladas/concorrentes.

O objetivo não é benchmark.

É detectar estado global mutável.

---

# 36. Se houver vazamento, interromper PR

Não seguir para Scheduling.

Um vazamento de:

```text
tenant
actor
permission
```

é blocker de segurança.

---

# 37. Recuperar Vitest agora

O problema:

```text
Cannot resolve entry module vitest.config.mts
```

precisa finalmente desaparecer.

---

# 38. Verificar o arquivo

```bash
find . -maxdepth 4 \
  -name "vitest.config.*" \
  -print

ls -la vitest.config.mts
```

No Windows/PowerShell/CMD adaptar os comandos quando necessário.

Depois:

```bash
cat package.json
```

---

# 39. Executar configuração explicitamente

```bash
npx vitest run \
  --config ./vitest.config.mts
```

Se falhar:

```text
UNRESOLVED_ENTRY
```

reduzir o problema para um config mínimo.

---

# 40. Preferir `vitest.config.ts` se `.mts` não tiver função real

Se a análise provar incompatibilidade do config atual no Windows/Node 24 e não houver necessidade específica do `.mts`:

```text
vitest.config.mts
        ↓
vitest.config.ts
```

é uma refatoração razoável.

Mas o objetivo é resolver tooling, não mudar testes.

---

# 41. Criar um config unitário simples

Por exemplo conceitualmente:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // include/exclude reais do projeto
  },
});
```

Evitar importar Wrangler na suíte puramente unitária.

---

# 42. Separar runtime tests dos unitários

Com o sistema atual, essa separação já se justifica:

```text
test:unit
```

para:

```text
Domain
FSM
Policies
Application com fakes
```

e:

```text
test:workers
```

para:

```text
D1
bindings
Cloudflare HTTP bridge
RPC
concurrency
```

---

# 43. Avaliar plugin/pool Workers atual

Como Wrangler/workerd agora são centrais, usar infraestrutura de testes do ecossistema Cloudflare quando apropriado, em vez de simular `env` manualmente.

Mas não migrar todos os testes unitários para workerd.

---

# 44. Testes unitários que devem finalmente executar

No mínimo:

```text
TimeInterval
Appointment
AppointmentStateMachine
AvailabilityPolicy

IdempotencyService
Reliability

AppointmentEligibilityPolicy
LicenseOperationalPolicy

AssessmentEligibilityPolicy

CommercialTerms
```

---

# 45. D1 runtime qualification

As migrations já estão aplicadas.

Agora provar que o Worker usa **aquele binding** efetivamente.

---

# 46. Customers vertical

Usar o vertical já existente:

```http
GET /tenants/:tenantId/customers
```

Fluxo:

```text
fetch
→ authentication
→ tenancy
→ permission
→ Customer use case
→ D1 adapter
→ env.DB
```

Resultado:

```text
200
```

---

# 47. Cross-tenant físico

Criar:

```text
Tenant A → Customer A
Tenant B → Customer B
```

Tenant A lista:

```text
Customer A
```

e nunca B.

---

# 48. Get cross-tenant

Tentativa:

```text
Tenant A
GET Customer B
```

resultado conforme contrato:

```text
404/403
```

mas nunca os dados B.

---

# 49. PATCH cross-tenant

Também provar que Tenant A não altera Customer B.

Não basta proteger leitura.

---

# 50. Clinical D1 físico

RPC:

```text
Operations
→ Clinical
→ AssessmentRepository
→ env.DB
```

deve encontrar somente Assessment tenant-aware.

---

# 51. Assessment cross-tenant

Mesmo:

```text
customerId
serviceId
```

não pode permitir Assessment de outro tenant.

---

# 52. Scheduling concurrency proof pendente

Agora devemos finalmente provar o `INSERT ... WHERE NOT EXISTS`.

Esse é um dos gates mais importantes de todo o projeto.

---

# 53. Criar integration test dedicado

Por exemplo:

```text
test/integration/
scheduling-concurrency.spec.ts
```

ou estrutura já adotada.

---

# 54. Usar D1 real local

A prova precisa atravessar:

```text
ScheduleReservationPort
       ↓
D1 ScheduleReservation adapter
       ↓
workerd D1
```

Não in-memory.

---

# 55. Preparar slot

```text
Tenant A
Professional P
Service S
Customer A

slot:
09:00–10:00
```

---

# 56. Disparar duas tentativas simultâneas

```ts
const [a, b] = await Promise.allSettled([
  reserve(slot),
  reserve(slot),
]);
```

---

# 57. Resultado obrigatório

```text
success = 1
conflict = 1
rows = 1
```

---

# 58. Repetir em múltiplos slots

Por exemplo:

```text
50 independent slots
```

cada um com duas tentativas simultâneas.

Esperado:

```text
successful = 50
conflicts = 50
doubleBookings = 0
```

O número pode ser reduzido se o ambiente local ficar muito lento.

---

# 59. Adjacência

Provar:

```text
09:00–10:00
10:00–11:00
```

ambas válidas.

---

# 60. Sobreposição parcial

```text
09:00–10:00
09:30–10:30
```

uma rejeitada.

---

# 61. Tenant diferente

Mesmo intervalo em:

```text
Tenant A
Tenant B
```

não deve produzir conflito cruzado.

---

# 62. Se ocorrer double booking

Parar.

Não abrir PR-12.

O mecanismo:

```sql
INSERT ... WHERE NOT EXISTS
```

precisa ser reconsiderado.

Não resolver com:

```text
Map mutex
global lock
in-memory semaphore
```

porque isolates/Workers distintos não compartilham essa memória.

---

# 63. Reliability physical proof

O segundo gate histórico pendente.

Usar D1 verdadeiro.

---

# 64. Testar sucesso do UnitOfWork

Executar:

```text
idempotency reservation
domain persistence command
audit append
outbox append
idempotency completion
```

usando o `TransactionContext.persistence`.

---

# 65. Estado final esperado

```text
business row   = 1
audit           = 1
outbox          = 1
idempotency     = COMPLETED
```

---

# 66. Provar falha no batch

Introduzir uma statement inválida/constraint failure controlada.

Depois consultar D1.

Registrar exatamente:

```text
business row?
audit?
outbox?
idempotency?
```

O objetivo é verificar a semântica física, não confirmar nossa expectativa.

---

# 67. Atualizar `unit-of-work.md`

Se o comportamento real divergir da descrição atual:

```text
documentação
→ comportamento comprovado
```

Não o contrário.

---

# 68. Idempotency replay

Executar duas vezes:

```text
same tenant
same operation
same key
same requestHash
```

Esperado:

```text
1 mutation
1 audit event
1 outbox event
same logical result
```

---

# 69. Key conflict

```text
same key
different requestHash
```

Esperado:

```text
IDEMPOTENCY_KEY_CONFLICT
```

sem segunda mutação.

---

# 70. Cross-tenant idempotency

```text
Tenant A / key X
Tenant B / key X
```

devem ser independentes.

---

# 71. Outbox continua sem consumer

Validar:

```text
status = PENDING
```

Nenhuma fila ou cron deve consumir o evento.

---

# 72. Observabilidade RPC

Agora validar cadeia distribuída.

Exemplo:

```text
Operations
service=beauty-operations-worker
correlation=X

Clinical
service=beauty-clinical-worker
correlation=X
```

---

# 73. Billing também

```text
Operations correlation=X
Billing correlation=X
```

---

# 74. PII review

Inspecionar logs/traces dos testes.

Não deve aparecer:

```text
Authorization token
CPF/documento
email
telefone
assessment contents
allergies
medications
```

---

# 75. Health regression

Nos três Workers:

```text
GET /health → 200
```

e confirmar:

```text
D1 query = 0
RPC = 0
Audit = 0
Outbox = 0
```

---

# 76. Free Tier: medir invocações reais

Agora finalmente podemos documentar custo operacional.

### Customers

```text
1 Operations invocation
+ D1 reads
```

### Eligibility sem Assessment

```text
1 Operations
+ 0 Clinical RPC
```

### Eligibility com Assessment

```text
1 Operations
+ 1 Clinical binding call
```

A documentação da Cloudflare informa que Service Bindings não acrescentam cobrança de request entre os Workers; eles são uma abstração interna sem custo adicional de request, embora obviamente o código downstream continue consumindo recursos do Worker. ([Cloudflare Docs][1])

Isso é especialmente adequado ao objetivo Free-first do projeto.

---

# 77. Billing no futuro

`CreateAppointment` posteriormente deverá fazer:

```text
1 Billing RPC
```

e não várias chamadas.

Preservar o contrato único:

```text
calculateCommercialTerms()
```

---

# 78. Não usar HTTP Worker-to-Worker

Com bindings finalmente conectados, não introduzir:

```text
http://localhost:xxxx
```

como caminho interno oficial.

Service Binding continua sendo a arquitetura.

---

# 79. Wrangler dry-run continua gate

Executar novamente:

```bash
npx wrangler deploy --dry-run \
  -c apps/operations-worker/wrangler.jsonc

npx wrangler deploy --dry-run \
  -c apps/clinical-worker/wrangler.jsonc

npx wrangler deploy --dry-run \
  -c apps/billing-worker/wrangler.jsonc
```

Bundling normal.

---

# 80. Testar `wrangler types`

Depois das eventuais alterações de RPC/config:

```bash
npx wrangler types \
  -c apps/operations-worker/wrangler.jsonc
```

e demais Workers.

---

# 81. Atualizar documentação

Atualizar:

```text
docs/architecture/cloudflare-runtime.md
docs/architecture/workers.md
```

e criar plano:

```text
docs/plans/
PR-11.5-multi-worker-runtime-qualification.md
```

---

# 82. Documentar comando oficial local

O README precisa passar a conter algo parecido com:

```bash
npm run dev:workers
```

que sobe:

```text
Operations
Clinical
Billing
```

em uma topologia conectada.

Isso é parte da arquitetura de desenvolvimento, não conhecimento tribal.

---

# 83. Documentar ordem de deploy futura

No primeiro deploy real, Workers alvos precisam existir antes do caller que declara Service Binding. A documentação da Cloudflare destaca essa dependência de bootstrap. ([Cloudflare Docs][1])

Logo a futura ordem:

```text
1. Clinical
2. Billing
3. Operations
```

Ainda sem realizar deploy neste PR.

---

# 84. Matriz física ao final

O relatório deve gerar algo assim:

| Capability          |        Lógica |        Física |
| ------------------- | ------------: | ------------: |
| Module Worker       |          PASS |          PASS |
| HTTP Bridge         |          PASS |          PASS |
| Authentication      |          PASS |          PASS |
| Tenancy             |          PASS |          PASS |
| D1 Operations       |          PASS |          PASS |
| D1 Clinical         |          PASS |          PASS |
| Clinical RPC        |          PASS |          PASS |
| Billing RPC         |          PASS |          PASS |
| Context isolation   |             — |          PASS |
| Scheduling conflict |          PASS |          PASS |
| Reliability         |          PASS |          PASS |
| Idempotency         |          PASS |          PASS |
| Vitest              | tests written |          PASS |
| CommercialTerms     |          PASS | READY/BLOCKED |

---

# 85. Gate para considerar PR-11.5 concluído

Não aceitar:

```text
Bindings still not connected
```

como conclusão normal.

O PR existe justamente para resolver isso.

Se a funcionalidade multi-config do Wrangler tiver um bug reproduzível, a documentação da Cloudflare reconhece que esse modo ainda possui caráter experimental. ([Cloudflare Docs][1]) Nesse caso, deve-se usar o modo cross-command já suportado ou um Workers test harness equivalente, mas é obrigatório obter **alguma prova real de Service Binding** antes de fechar o PR.

---

# 86. Definition of Done — bindings

```text
[ ] service target names correspondem ao wrangler.name

[ ] compatibility_date suporta RPC

[ ] Clinical usa WorkerEntrypoint válido

[ ] Billing usa WorkerEntrypoint válido

[ ] CLINICAL_SERVICE connected

[ ] BILLING_SERVICE connected

[ ] Operations → Clinical RPC PASS

[ ] Operations → Billing RPC PASS

[ ] nenhuma URL pública usada

[ ] failure continua fail-closed
```

---

# 87. Definition of Done — Vitest

```text
[ ] vitest.config resolve no Windows/Node 24

[ ] npm run test executa

[ ] scheduling unit tests PASS

[ ] reliability tests PASS

[ ] eligibility tests PASS

[ ] licensing tests PASS

[ ] clinical tests PASS

[ ] commercial terms tests PASS
```

---

# 88. Definition of Done — contexto

```text
[ ] sequential isolation PASS

[ ] concurrent isolation PASS

[ ] stress alternando tenants PASS

[ ] tenantId não vaza

[ ] actorId não vaza

[ ] requestId não vaza

[ ] correlationId é propagado conscientemente
```

---

# 89. Definition of Done — D1

```text
[ ] migrations 0001–0004 continuam aplicadas

[ ] Operations D1 integration PASS

[ ] Clinical D1 integration PASS

[ ] cross-tenant D1 isolation PASS
```

---

# 90. Definition of Done — Scheduling

```text
[ ] concorrência usa D1 real

[ ] dois requests conflitantes → 1 sucesso

[ ] zero double booking

[ ] adjacência permitida

[ ] overlap parcial bloqueado

[ ] tenant isolation preservada

[ ] nenhum mutex process-local
```

---

# 91. Definition of Done — Reliability

```text
[ ] UnitOfWork físico executado

[ ] mutation participa do batch previsto

[ ] success semantics comprovada

[ ] failure semantics comprovada

[ ] idempotency replay PASS

[ ] idempotency conflict PASS

[ ] cross-tenant idempotency PASS

[ ] Audit append-only preservado

[ ] Outbox PENDING preservado
```

---

# 92. Definition of Done — Cloudflare

```text
[ ] multi-worker command reproduzível

[ ] Operations primary

[ ] Clinical secondary

[ ] Billing secondary

[ ] bindings connected

[ ] wrangler types PASS

[ ] normal dry-run Operations PASS

[ ] normal dry-run Clinical PASS

[ ] normal dry-run Billing PASS

[ ] /health dos três PASS
```

---

# 93. Definition of Done — qualidade

```text
[ ] npm run lint PASS

[ ] tsc --build PASS

[ ] Vitest PASS

[ ] Worker integration tests PASS

[ ] RPC tests PASS

[ ] D1 tests PASS

[ ] concurrency tests PASS

[ ] reliability tests PASS

[ ] git diff --check PASS
```

---

# 94. O que não pode aparecer no diff

Ainda não:

```text
POST /appointments

Payment
Refund
Package
Credit

Session

Queue
Cron
Outbox consumer

KV
R2

percentual novo de desconto
percentual novo de sinal

HTTP público Operations→Clinical
HTTP público Operations→Billing
```

---

# 95. Relatório obrigatório do Codex

Eu exigiria:

```text
PR-11.5 — Multi-Worker Runtime Harness + Physical Qualification

Wrangler
version:
multi-config command:

Workers
Operations:
Clinical:
Billing:

Service Bindings
CLINICAL_SERVICE:
BILLING_SERVICE:

RPC
Clinical:
Billing:

Vitest
config:
unit suite:

Context isolation
sequential:
concurrent:
stress:

D1
migrations:
Operations:
Clinical:
cross-tenant:

Scheduling
iterations:
successes:
conflicts:
double bookings:
adjacent:
partial overlap:

Reliability
success:
failure:
replay:
hash conflict:
audit:
outbox:

Observability
Clinical correlation:
Billing correlation:
PII:

Cloudflare Free
Worker invocations:
Service Binding behavior:
D1 reads/writes:

CommercialTerms
RPC transport:
business status:

Remaining blockers:

Next PR:
```

---

# 96. Qual será o próximo PR depois?

Aqui a decisão fica finalmente objetiva.

Se ao término tivermos:

```text
HTTP runtime              PASS
Bindings                  PASS
Clinical                  PASS
D1                        PASS
Concurrency               PASS
Reliability               PASS
Vitest                    PASS
CommercialTerms           READY
```

então:

# PR-12 — CreateAppointment Authoritative Flow

pode finalmente começar.

Porém, com base no PR-10, o cenário mais provável ainda é:

```text
Billing RPC              PASS
CalculateCommercialTerms BLOCKED
```

porque:

```text
DiscountPolicyPort
DepositPolicyPort
```

ainda não possuem políticas comerciais reais.

Nesse cenário, o próximo deverá ser:

# PR-11.6 — Commercial Policy Materialization

e somente depois:

```text
PR-12
CreateAppointment Authoritative Flow
```

Portanto, a sequência que eu congelaria agora é:

```text
PR-11.4
Service Binding adapters
        ↓
PR-11.5
Multi-Worker Runtime Harness
+ physical qualification
        ↓
        ├── CommercialTerms READY
        │          ↓
        │        PR-12
        │
        └── CommercialTerms BLOCKED
                   ↓
                PR-11.6
          Commercial Policies
                   ↓
                 PR-12
```

O detalhe mais importante para a implementação deste PR é corrigir a forma de iniciar a topologia local: **use Operations como primeiro `-c` e Clinical/Billing como configs secundários no mesmo `wrangler dev`**. A documentação atual da Cloudflare recomenda justamente o comando multi-config como abordagem padrão para desenvolvimento de múltiplos Workers e Service Bindings. ([Cloudflare Docs][3]) Isso deve ser tentado e qualificado antes de criar qualquer workaround baseado em HTTP ou abandonar Service Bindings.

[1]: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/?utm_source=chatgpt.com "Service bindings - Runtime APIs · Cloudflare Workers docs"
[2]: https://developers.cloudflare.com/workers/wrangler/configuration/?utm_source=chatgpt.com "Configuration - Wrangler · Cloudflare Workers docs"
[3]: https://developers.cloudflare.com/workers/local-development/multi-workers/?utm_source=chatgpt.com "Developing with multiple Workers · Cloudflare Workers docs"
[4]: https://developers.cloudflare.com/changelog/post/2025-09-23-wrangler-dev-multi-config-cross-command-support/?utm_source=chatgpt.com "Improved support for running multiple Workers with `wrangler dev` · Changelog"
[5]: https://developers.cloudflare.com/workers/runtime-apis/rpc/?utm_source=chatgpt.com "Remote-procedure call (RPC) · Cloudflare Workers docs"
[6]: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/?utm_source=chatgpt.com "Service bindings - RPC (WorkerEntrypoint) · Cloudflare Workers docs"
