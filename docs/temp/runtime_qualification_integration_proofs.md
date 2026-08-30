Considerando o estado **real** após o PR-11, eu não iniciaria ainda o `PR-12 — CreateAppointment Authoritative Flow`.

O relatório mostra que o domínio necessário já está praticamente montado, mas quatro garantias físicas continuam sem prova:

```text
Vitest / lint            → não executáveis
D1 migrations            → não aplicadas
concorrência PR-08       → não provada fisicamente
Service Bindings         → não validados no runtime Cloudflare
```

Esses itens não são detalhes de acabamento. O futuro `CreateAppointment` dependerá diretamente deles. Portanto, eu inseriria um PR intermediário obrigatório:

# PR-11.1 — Runtime Qualification + Integration Proofs

O objetivo deste PR é **qualificar fisicamente a arquitetura construída nos PR-05 a PR-11**, sem adicionar novas regras de negócio.

Ao final, precisamos sair de:

```text
Domain implemented
Ports implemented
Adapters implemented
Build PASS

         mas

Runtime Cloudflare ?
D1 migrations ?
Concurrency ?
Service Bindings ?
Tests ?
```

para:

```text
Domain
   +
D1
   +
Cloudflare runtime
   +
Service Bindings
   +
Reliability
   +
Concurrency
   +
Tests
        ↓
QUALIFIED
```

Somente então abrir o PR-12.

---

# 1. Escopo exato

O PR deve resolver:

```text
dependency installation
Vitest
Oxlint
Wrangler
D1 local runtime
migrations 0001–0004
Operations Worker runtime
Billing Worker runtime
Clinical Worker runtime
Service Bindings
Operations → Clinical
Operations → Billing
D1 integration tests
Reliability integration tests
Scheduling concurrency proof
Admission integration proof
CommercialTerms integration proof
```

Não implementar:

```text
POST /appointments
Payment
Refund
Package
Session
R2
KV
Queue
Cron
Outbox consumer
novas regras de License
novas regras de Assessment
novas regras de Discount/Deposit
```

---

# 2. Não chamar esse trabalho de “ajuste de ambiente”

Essa etapa deve ser tratada como requisito arquitetural.

Até agora temos várias provas lógicas:

```text
TypeScript build PASS
domain tests escritos
architecture boundaries preservadas
```

Mas ainda não temos algumas provas físicas.

Formalize no plano:

```text
PR-11.1
Runtime Qualification and Integration Proofs
```

Assim esses gaps deixam de atravessar todos os próximos PRs como “limitações conhecidas”.

---

# 3. Primeiro: congelar o estado do repositório

Executar:

```bash
pwd
git status
git branch --show-current
git log --oneline -20
```

Inventariar:

```bash
find apps -maxdepth 5 -type f | sort
find libs -maxdepth 5 -type f | sort
find database/d1/migrations -type f | sort
```

Esperado:

```text
beauty-management-api
operations-worker
billing-worker
clinical-worker
```

e possivelmente outro app preexistente.

Migrations:

```text
0001_operations_foundation.sql
0002_reliability_foundation.sql
0003_scheduling_foundation.sql
0004_appointment_admission_dependencies.sql
```

Se divergir, registrar antes de alterar.

---

# 4. Diagnosticar package manager

O problema de Rolldown/Oxlint sugere instalação incompleta ou inconsistente.

Não comece executando:

```bash
npm install qualquer-coisa
```

Primeiro:

```bash
node --version
npm --version
```

Depois:

```bash
find . -maxdepth 2 \
  \( -name "package-lock.json" \
     -o -name "pnpm-lock.yaml" \
     -o -name "yarn.lock" \
     -o -name "bun.lock" \
     -o -name "bun.lockb" \) \
  -print
```

Também:

```bash
cat package.json
```

Verificar:

```text
packageManager
engines
scripts
devDependencies
```

O lockfile é a fonte de verdade da instalação.

---

# 5. Verificar dependências quebradas antes de reinstalar

Executar:

```bash
npm ls vitest
npm ls vite
npm ls rolldown
npm ls oxlint
npm ls wrangler
```

E:

```bash
npm ls --depth=0
```

Registrar:

```text
missing
invalid
extraneous
```

antes de corrigir.

---

# 6. Restaurar instalação determinística

Se o projeto usa `package-lock.json`:

```bash
rm -rf node_modules
npm ci
```

Somente remover `node_modules`, nunca o lockfile.

Não fazer:

```bash
rm package-lock.json
npm install
```

apenas para “resolver” versão.

Isso mudaria a árvore de dependências sem controle.

---

# 7. Confirmar native Rolldown

Depois:

```bash
npm ls rolldown
```

Executar:

```bash
npx vitest --version
```

Se ainda falhar por native binding, identificar:

```text
SO
arquitetura
Node version
optional dependency
package manager behavior
```

antes de modificar versão de pacote.

---

# 8. Gate Vitest

Precisamos finalmente obter:

```bash
npm run test
```

ou script equivalente.

Resultado obrigatório:

```text
PASS
```

Não vale mais:

```text
test files created
but runner unavailable
```

como qualificação.

---

# 9. Gate Oxlint

Confirmar primeiro script real:

```bash
cat package.json
```

Depois:

```bash
npm run lint
```

Se for Oxlint:

```bash
npx oxlint --version
```

Resultado obrigatório:

```text
lint PASS
```

Corrigir apenas problemas reais do código.

Não desabilitar regras em massa para tornar o gate verde.

---

# 10. TypeScript continua obrigatório

Executar:

```bash
npx tsc --build
```

E builds por Worker, conforme configuração real:

```bash
nest build operations-worker
nest build billing-worker
nest build clinical-worker
```

Mais qualquer app existente que já faça parte do monorepo.

---

# 11. Instalar/qualificar Wrangler

Wrangler deve ser dependência reproduzível do projeto.

Preferencialmente:

```bash
npm install -D wrangler
```

somente se realmente estiver ausente das dependências normativas.

Evitar depender de Wrangler global.

Depois:

```bash
npx wrangler --version
```

---

# 12. Não configurar produção ainda

O PR trabalha com:

```text
local runtime
dry-run
```

Não executar:

```bash
wrangler deploy
```

nem criar recurso remoto.

---

# 13. Inspecionar `wrangler.jsonc`

Executar:

```bash
cat wrangler.jsonc
```

ou localizar configs:

```bash
find . \
  \( -name "wrangler.jsonc" -o -name "wrangler.toml" \) \
  -print
```

Precisamos identificar:

```text
operations
billing
clinical
D1 binding
Service Bindings
entrypoints
compatibility flags
```

---

# 14. Problema provável: um único Wrangler para vários Workers

Agora existem pelo menos:

```text
operations-worker
billing-worker
clinical-worker
```

cada qual deployável independentemente.

Se ainda houver apenas:

```text
/wrangler.jsonc
```

genérico, esse PR deve normalizar a configuração.

Uma estrutura possível:

```text
wrangler/
├── operations/
│   └── wrangler.jsonc
├── billing/
│   └── wrangler.jsonc
└── clinical/
    └── wrangler.jsonc
```

ou configs na própria pasta de cada app.

O importante é que cada deployment seja inequívoco.

---

# 15. Cada Worker deve ser independente

Precisamos provar:

```text
Operations can build/deploy independently
Billing can build/deploy independently
Clinical can build/deploy independently
```

Sem depender de “subir a API inteira”.

Isso é parte central da arquitetura escolhida.

---

# 16. Configuração D1

O D1 deve estar disponível somente para Workers que realmente o utilizam.

Atualmente provavelmente:

```text
Operations → DB
Clinical   → DB
```

Billing talvez ainda:

```text
Billing → sem D1
```

porque PR-10 não criou estado persistente comercial.

Não adicione DB ao Billing apenas por simetria.

---

# 17. Não compartilhar binding desnecessariamente

Princípio:

```text
least infrastructure privilege
```

Então:

```text
Health
→ nunca precisa DB

Billing CommercialTerms puro
→ talvez não precise DB

Clinical Assessment repository
→ precisa DB

Operations
→ precisa DB
```

---

# 18. Aplicar migrations localmente

Com Wrangler funcional:

```bash
npx wrangler d1 migrations list <database-name> --local
```

Depois:

```bash
npx wrangler d1 migrations apply \
  <database-name> \
  --local
```

Nome real deve vir da configuração.

---

# 19. Prova: banco vazio → migrations completas

Criar banco local limpo/recriar estado conforme tooling.

Aplicar:

```text
0001
↓
0002
↓
0003
↓
0004
```

Resultado:

```text
PASS
```

Isso prova que o projeto não depende de schema manual histórico.

---

# 20. Verificar schema final

Usar ferramentas do Wrangler/D1 para verificar tabelas/columns/indices.

Confirmar pelo menos:

```text
tenants
professionals
services
professional_services
customers

reliability tables

appointments

licenses
assessments
```

segundo as migrations reais.

Não assumir nomes; conferir SQL implementado.

---

# 21. Testar migrations contra schema vazio

Esse é o caso mais importante.

Não basta aplicar a migration nova sobre banco local já manipulado manualmente.

Precisamos de:

```text
brand-new database
       ↓
all migrations
       ↓
working application
```

---

# 22. Testar migrations repetidas pelo tooling

Não execute SQL manual duas vezes.

Use:

```text
wrangler migrations
```

para provar que migrations já aplicadas não são reaplicadas indevidamente.

---

# 23. Qualificar Operations Worker localmente

Subir usando configuração Cloudflare real/local.

Não apenas:

```text
node dist/main.js
```

Precisamos também testar o adapter Worker.

Usar o comando apropriado do projeto, por exemplo:

```bash
npx wrangler dev \
  --config <operations-config>
```

---

# 24. Smoke Health Operations

```http
GET /health
```

Resultado:

```json
{
  "status": "ok",
  "service": "beauty-operations-worker",
  "version": "..."
}
```

E confirmar:

```text
0 D1 reads
0 Service Binding calls
```

---

# 25. Qualificar Billing

Subir separadamente:

```bash
npx wrangler dev \
  --config <billing-config>
```

Health:

```http
GET /health
```

PASS.

---

# 26. Qualificar Clinical

Mesma prova:

```bash
npx wrangler dev \
  --config <clinical-config>
```

Health:

```http
GET /health
```

PASS.

---

# 27. Service Binding Operations → Clinical

Configurar binding interno real.

Conceitualmente:

```text
operations-worker
  bindings:
    CLINICAL_SERVICE
      → clinical-worker
```

O nome exato deve ser documentado.

Não usar URL HTTP pública.

---

# 28. Service Binding Operations → Billing

Também:

```text
operations-worker
  bindings:
    BILLING_SERVICE
      → billing-worker
```

Isso materializa a integração criada logicamente no PR-10.

---

# 29. Definir interfaces Worker-RPC claras

Operations não deveria saber:

```text
endpoint interno do Billing
path do Clinical
URL pública
```

Deve utilizar adapter de infraestrutura:

```text
AssessmentEligibilityPort
        ↓
ClinicalServiceBindingAdapter
```

e:

```text
CommercialTermsPort
        ↓
BillingServiceBindingAdapter
```

---

# 30. Não deixar contrato depender de Cloudflare types

O Port:

```text
AssessmentEligibilityPort
```

não importa:

```text
Fetcher
Service
ExecutionContext do Cloudflare
```

Somente o adapter conhece isso.

Mesma regra para Billing.

---

# 31. Prova real Operations → Clinical

Criar integration test/fixture com:

```text
Service.requiresAssessment = false
```

Resultado:

```text
Clinical calls = 0
```

Depois:

```text
requiresAssessment = true
```

Resultado:

```text
Operations
→ Clinical
→ eligibility decision
```

Isso é uma prova muito importante de eficiência e comportamento.

---

# 32. Assessment não obrigatório

Teste:

```text
requiresAssessment = false
```

deve resultar em eligibility que não falha por ausência de Clinical.

Mesmo que Clinical esteja offline, se o serviço não exige avaliação:

```text
Assessment check = NOT_REQUIRED
```

---

# 33. Assessment obrigatório + Clinical disponível

Criar fixture:

```text
Assessment
result = APTO
```

e provar:

```text
Operations
→ Clinical
→ READY
```

---

# 34. Assessment obrigatório + NAO_APTO

Provar:

```text
Operations
→ Clinical
→ NAO_APTO
→ AppointmentEligibility BLOCKED
```

---

# 35. Assessment obrigatório + Clinical indisponível

Provar fail-closed:

```text
Clinical unavailable
→ BLOCKED
```

Nunca:

```text
Clinical unavailable
→ READY
```

---

# 36. Prova Operations → Billing

Usar cenário onde policies continuam indisponíveis.

Esperado:

```text
Operations
→ Billing
→ CalculateCommercialTerms
→ BLOCKED
```

Isso é correto.

A prova que queremos é **transporte + semântica**, não necessariamente `READY`.

---

# 37. Não criar policy comercial falsa para integration test

Não inserir no runtime real:

```text
Fixed10PercentDiscountAdapter
```

apenas para teste.

Pode utilizar fake no teste unitário, mas configuração real continua fail-closed se policies não existem.

---

# 38. Testar falha do Billing Binding

Operations deve receber:

```text
CommercialTerms unavailable
→ BLOCKED
```

e não:

```text
discount = 0
deposit = none
```

---

# 39. Prova física da concorrência do PR-08

Este é provavelmente o gate mais importante deste PR.

Preparar banco com:

```text
Tenant A
Professional P
Service S
Customer C
```

e executar duas reservas concorrentes para:

```text
Professional P
2026-... 09:00–10:00
```

---

# 40. A concorrência precisa usar o adapter real D1

Não basta:

```text
Promise.all([inMemoryRepo, inMemoryRepo])
```

A prova precisa atravessar:

```text
ScheduleReservationPort
        ↓
D1 adapter
        ↓
local D1 runtime
```

---

# 41. Resultado obrigatório

```text
reservation A = SUCCESS
reservation B = CONFLICT
```

ou inverso.

Banco final:

```text
appointment_count = 1
```

---

# 42. Executar várias iterações

Não testar uma vez.

Executar, por exemplo:

```text
50 ou 100 pares concorrentes
```

em slots/fixtures independentes.

Não precisa exagerar ao ponto de transformar teste local em benchmark.

O objetivo é detectar corrida determinística/provável.

---

# 43. Caso `INSERT ... WHERE NOT EXISTS` falhe

Se houver cenário:

```text
count = 2
```

o PR deve:

```text
FAIL
```

e a arquitetura de reserva precisa ser revista antes de PR-12.

Não tentar esconder no Application com mutex em memória.

Workers podem escalar horizontalmente.

---

# 44. Proibido mutex process-local

Não implementar:

```ts
const locks = new Map();
```

para proteger appointment.

Isso só funciona dentro de uma instância.

Não é garantia distribuída.

---

# 45. Prova do UnitOfWork com mutation real

O PR-07/08 adicionou:

```text
TransactionContext.persistence
```

Agora precisamos provar fisicamente:

```text
appointment mutation
audit
outbox
idempotency
```

na unidade de execução prevista.

---

# 46. Criar fixture transacional

Sem expor `POST /appointments`, pode existir teste de infraestrutura/application fixture.

Executar:

```text
reserve idempotency
schedule mutation
audit
outbox
complete idempotency
```

via `UnitOfWork`.

---

# 47. Prova success

Resultado:

```text
appointment = 1
audit = 1
outbox = 1
idempotency = COMPLETED
```

---

# 48. Prova rollback

Introduzir falha deliberada antes da conclusão.

Esperado, de acordo com a semântica real documentada do `D1Database.batch()`:

```text
nenhum estado parcialmente aceitável
```

O resultado precisa corresponder às garantias descritas em `unit-of-work.md`.

Se não corresponder, corrigir documentação ou implementação.

---

# 49. Prova de replay

Executar mesma operação:

```text
tenant A
operation = CreateAppointmentFixture
key = X
hash = H
```

duas vezes.

Esperado:

```text
business mutation = 1
audit = 1
outbox = 1
```

A segunda execução recebe replay.

---

# 50. Prova de conflito de idempotência

Mesma key:

```text
X
```

hash diferente:

```text
H2
```

resultado:

```text
IDEMPOTENCY_KEY_CONFLICT
```

sem nova mutation.

---

# 51. Admission integration test completo

Agora testar `CheckAppointmentEligibility` com adapters reais onde disponíveis.

Cenário elegível:

```text
Tenant ACTIVE
Customer ACTIVE
blocked=false
Service ACTIVE
Professional ACTIVE
Professional-Service enabled
License ACTIVE
Plan capability available
requiresAssessment=false
available slot
no conflict
```

Resultado:

```text
READY
```

---

# 52. Cenário License suspensa

```text
License SUSPENDED
```

resultado:

```text
BLOCKED
LICENSE_NOT_OPERATIONAL
```

E provar fail-fast:

```text
Clinical not called
Availability not queried
```

conforme ordem implementada.

---

# 53. Customer blocked

```text
Customer ACTIVE
blockedForNewAppointments = true
```

resultado:

```text
CUSTOMER_RESTRICTED
```

Não confundir com `CUSTOMER_INACTIVE`.

---

# 54. Service requires Assessment

Com:

```text
requiresAssessment = true
```

e nenhum Assessment:

```text
BLOCKED
```

Com `APTO`:

```text
READY
```

se demais gates estiverem verdes.

---

# 55. Plan disabled

Provar que capability/limit real:

```text
not allowed
```

leva a:

```text
BLOCKED
```

sem fallback.

---

# 56. Cross-tenant integration

Provas reais:

```text
Tenant A
Customer B
→ BLOCKED
```

```text
Tenant A
License B
→ BLOCKED
```

```text
Tenant A
Assessment B
→ não utilizado
```

---

# 57. CommercialTerms qualification

Como policies do PR-10 continuam indisponíveis, é perfeitamente aceitável obter:

```text
BLOCKED
```

O objetivo deste PR é garantir:

```text
Operations
→ Service Binding
→ Billing
→ deterministic response
```

---

# 58. Esse BLOCKED é blocker para PR-12?

Sim.

Há uma distinção importante:

Após PR-11.1 podemos iniciar o **planejamento** do PR-12, mas `POST /appointments` só pode ser exposto quando `CommercialTerms` for capaz de retornar `READY` para pelo menos uma configuração comercial válida.

Atualmente o PR-10 diz:

```text
DiscountPolicy unavailable
DepositPolicy unavailable
→ BLOCKED
```

Então precisamos verificar se já existe configuração normativa capaz de tornar essas policies reais.

---

# 59. Pode surgir um PR-11.2

Se, ao final desta qualificação, CommercialTerms continuar sempre:

```text
BLOCKED
```

porque não existem policies reais, o próximo PR não será `CreateAppointment`.

Será:

> **PR-11.2 — Commercial Policy Configuration**

para materializar políticas de desconto/sinal aprovadas pelas regras do produto.

Não criar `POST /appointments` que nunca consegue concluir.

---

# 60. Revisar `billing-contracts.md`

Nesse PR, analisar se as regras existentes permitem implementar policies reais sem inventar valores.

Perguntas:

```text
Existe percentual/valor de sinal configurável?
Existe desconto padrão?
Existe política por serviço?
Existe política por tenant?
0 desconto é um estado explicitamente permitido?
Sinal opcional é permitido?
```

Se documentos não responderem, registrar blocker.

---

# 61. Não interpretar “ausente” como zero

O PR-10 acertou ao representar:

```text
deposit absent
```

sem inventar:

```text
depositCents = 0
```

Preservar isso.

---

# 62. Cloudflare request budget

Agora podemos medir a topologia real.

Um admission check poderá gerar:

```text
1 Operations request
+ 0/1 Clinical binding call
```

CommercialTerms:

```text
+ 1 Billing binding call
```

BFF futuro:

```text
+ 1 external Worker request
```

Documentar custo real.

---

# 63. D1 read budget

Instrumentar integration tests para identificar aproximadamente:

```text
Tenant lookup
Customer lookup
Service lookup
Professional lookup
Professional-Service lookup
License lookup
Availability/conflict lookup
Assessment lookup conditional
```

Não precisa ter medição perfeita do provider, mas registrar query plan/quantidade lógica.

---

# 64. Evitar duplicação de reads

Verificar se `CheckAppointmentEligibility` faz:

```text
ServiceRepository.findById
```

duas vezes.

Ou:

```text
CustomerRepository.findById
```

para status e depois novamente para restriction.

Como `blockedForNewAppointments` já está em Customer:

```text
1 Customer read
```

deve resolver ambas as decisões.

---

# 65. License + Plan em uma leitura, quando possível

Se License já carrega:

```text
enabled capabilities
limits
```

evitar:

```text
LicenseRepository
+
PlanLimitRepository
```

fazendo consultas duplicadas se um único snapshot resolver.

Não sacrifique modelagem para evitar toda query, mas não crie fan-out acidental.

---

# 66. Não adicionar KV para otimizar ainda

Primeiro medir.

License é sensível a mudança de estado.

Customer restriction também.

Cache precoce pode criar autorização operacional stale.

---

# 67. Health regression

Para todos:

```text
operations
billing
clinical
```

provar:

```text
GET /health
→ 200
```

mesmo que:

```text
DB absent?
```

de acordo com o contrato atual de liveness.

E health nunca chama Service Binding.

---

# 68. Observabilidade cross-worker

Essa é uma boa oportunidade para validar:

```text
correlationId
```

Operations:

```text
correlation=A
```

Clinical:

```text
correlation=A
```

Billing:

```text
correlation=A
```

Cada chamada pode ter:

```text
requestId diferente
```

Isso prova a cadeia distribuída criada no PR-02.

---

# 69. Trace propagation

Se `@nestjs/observe`/runtime suportar, validar:

```text
Operations trace
  ↓
Clinical child/downstream
```

e:

```text
Operations
  ↓
Billing
```

Sem enviar PII.

---

# 70. Não logar Assessment

Nos testes de observabilidade, verificar que não aparecem:

```text
assessment content
allergies
medications
customer phone
customer email
document
JWT
```

---

# 71. Architecture tests

Agora devem provar também configs físicas.

Por exemplo:

```text
Operations imports Clinical domain
→ FAIL
```

```text
Operations imports Billing domain
→ FAIL
```

```text
Service Binding adapters
→ infrastructure only
```

```text
Clinical Domain imports D1
→ FAIL
```

---

# 72. Teste de Worker independence

Importante:

```text
nest build operations-worker
```

não deve compilar a implementação do Billing por import acidental.

Contratos compartilhados podem ser compilados, domínio alheio não.

---

# 73. Wrangler dry-run individual

Executar:

```bash
npx wrangler deploy \
  --dry-run \
  --config <operations-config>
```

Depois:

```bash
npx wrangler deploy \
  --dry-run \
  --config <billing-config>
```

E Clinical.

Todos PASS.

---

# 74. Validar tamanho dos bundles

Registrar o bundle resultante de cada Worker quando Wrangler fornecer.

Isso importa no modelo Free-first.

Não precisa otimizar prematuramente, mas compare:

```text
Operations
Billing
Clinical
```

---

# 75. Não fazer deploy

O Definition of Done termina no:

```text
dry-run
```

e runtime local.

Produção continua fora do escopo.

---

# 76. Atualizar documentação de Workers

`docs/architecture/workers.md` deve agora diferenciar:

```text
target
```

e:

```text
physically qualified
```

Ao final, esperamos:

```text
Operations → QUALIFIED
Billing    → QUALIFIED
Clinical   → QUALIFIED
```

---

# 77. Atualizar reliability docs

Registrar a prova real do D1:

```text
D1Database.batch semantics verified by test X
```

e limitações encontradas.

Não deixar documentação dizendo apenas “deverá ser testado futuramente”.

---

# 78. Atualizar scheduling docs

Registrar:

```text
ConcurrentReservationProof
PASS / FAIL
```

incluindo cenário e resultado.

---

# 79. Atualizar admission docs

Criar matriz física:

| Dependency           | Port                        | Adapter real     | Integration proven |
| -------------------- | --------------------------- | ---------------- | -----------------: |
| License              | `LicenseEligibilityPort`    | D1               |                  ✓ |
| Plan                 | `PlanLimitPort`             | D1               |                  ✓ |
| Customer restriction | `CustomerRestrictionPort`   | Operations repo  |                  ✓ |
| Assessment           | `AssessmentEligibilityPort` | Clinical binding |                  ✓ |
| Commercial Terms     | `CommercialTermsPort`       | Billing binding  |       ✓ transporte |

Mas diferenciar:

```text
Transport qualified
```

de:

```text
READY business policy
```

---

# 80. Matriz de readiness para CreateAppointment

Ao final do PR:

```text
Scheduling Core                PASS
Conflict physical proof        PASS
Reliability physical proof     PASS
Idempotency                    PASS
Tenant isolation               PASS

License                        PASS
Plan Admission                 PASS
Customer Restrictions          PASS
Assessment                     PASS

Clinical Binding               PASS
Billing Binding                PASS

Commercial Policy              READY/BLOCKED
```

---

# 81. Gate definitivo para PR-12

Só abrir diretamente PR-12 se:

```text
Commercial Policy = READY
```

for possível para uma configuração normativa válida.

Se continuar:

```text
CommercialTerms always BLOCKED
```

então abrir antes:

```text
PR-11.2
Commercial Policy Configuration
```

---

# 82. Não criar fixture permissiva como prova de readiness

Um fake:

```ts
return {
  status: 'READY',
  discountCents: 0,
  deposit: undefined,
}
```

não qualifica Production behavior.

Pode qualificar contrato, não regra real.

---

# 83. Definition of Done — toolchain

```text
[ ] dependency install deterministic

[ ] native Rolldown problem resolved

[ ] Vitest version works

[ ] Vitest suite runs

[ ] Oxlint works

[ ] lint suite runs

[ ] Wrangler local dependency available

[ ] Wrangler version recorded

[ ] tsc --build PASS
```

---

# 84. Definition of Done — D1

```text
[ ] migrations 0001–0004 detected

[ ] clean local DB created

[ ] all migrations applied successfully

[ ] schema inspected

[ ] required indexes present

[ ] no manual schema prerequisite

[ ] second migration run reports no pending corruption/error
```

---

# 85. Definition of Done — Workers

```text
[ ] Operations local runtime PASS

[ ] Billing local runtime PASS

[ ] Clinical local runtime PASS

[ ] Operations health PASS

[ ] Billing health PASS

[ ] Clinical health PASS

[ ] independent build PASS for all

[ ] independent Wrangler dry-run PASS for all
```

---

# 86. Definition of Done — bindings

```text
[ ] Operations → Clinical Service Binding configured

[ ] Operations → Billing Service Binding configured

[ ] no public HTTP Worker-to-Worker introduced

[ ] AssessmentEligibility integration PASS

[ ] CommercialTerms transport integration PASS

[ ] unavailable downstream remains fail-closed

[ ] correlation propagated
```

---

# 87. Definition of Done — Scheduling

```text
[ ] D1 concurrent reservation test executable

[ ] at least one concurrent contention proof PASS

[ ] no double booking observed

[ ] final row count = 1 per conflicting slot test

[ ] adjacent intervals still allowed

[ ] cross-tenant conflicts not mixed

[ ] ScheduleReservation uses real adapter
```

---

# 88. Definition of Done — Reliability

```text
[ ] mutation + idempotency + audit + outbox integration test PASS

[ ] successful atomic-group behavior proven

[ ] failure behavior proven

[ ] replay proof PASS

[ ] different-hash conflict proof PASS

[ ] audit remains append-only

[ ] outbox remains PENDING after append

[ ] health creates no reliability writes
```

---

# 89. Definition of Done — Admission

```text
[ ] Tenant ACTIVE scenario PASS
[ ] Customer ACTIVE scenario PASS
[ ] Customer restriction scenario PASS
[ ] Service ACTIVE scenario PASS
[ ] Professional ACTIVE scenario PASS
[ ] Professional-Service scenario PASS

[ ] License ACTIVE scenario PASS
[ ] License SUSPENDED scenario PASS

[ ] Plan capability allow scenario PASS
[ ] Plan deny scenario PASS

[ ] requiresAssessment=false avoids Clinical call

[ ] requiresAssessment=true + APTO passes

[ ] requiresAssessment=true + NAO_APTO blocks

[ ] Clinical unavailable blocks when required

[ ] Availability PASS

[ ] Conflict BLOCKED
```

---

# 90. Definition of Done — observability

```text
[ ] requestId present

[ ] correlationId propagated Operations→Clinical

[ ] correlationId propagated Operations→Billing

[ ] service identity correct for each Worker

[ ] no JWT leaked

[ ] no PII leaked

[ ] no assessment clinical payload leaked
```

---

# 91. Definition of Done — overall quality

```text
[ ] lint PASS

[ ] tsc --build PASS

[ ] Vitest PASS

[ ] integration tests PASS

[ ] D1 tests PASS

[ ] concurrency tests PASS

[ ] architecture tests PASS

[ ] Wrangler local PASS

[ ] Wrangler dry-runs PASS

[ ] health smoke PASS

[ ] git diff --check PASS
```

---

# 92. O que não entra neste PR

Rejeitar qualquer diff contendo implementação funcional de:

```text
POST /appointments

Payment
Refund
Package
Credit

Session
TechnicalRecord

Queue
Cron
Outbox consumer

R2
KV

new discount percentages
new deposit percentages

SaaS billing automation
```

---

# 93. Resultado esperado

Depois do PR-11.1:

```text
             Browser future
                   │
                   ▼
              Operations
           ┌───────┼────────┐
           │       │        │
           ▼       ▼        ▼
          D1    Clinical  Billing
           │       │        │
           └───────┼────────┘
                   │
                   ▼
             qualified runtime
```

E, conceitualmente:

```text
Scheduling       physically proven
Reliability      physically proven
Eligibility      integrated
Clinical         integrated
Billing          transport-integrated
```

---

# 94. Relatório pós-implementação obrigatório

O relatório deve ser mais objetivo que os anteriores:

```text
PR-11.1 — Runtime Qualification + Integration Proofs

Toolchain
- Node:
- package manager:
- Vitest:
- Oxlint:
- Wrangler:

Migrations
0001 PASS
0002 PASS
0003 PASS
0004 PASS

Workers
Operations build/runtime/health
Billing build/runtime/health
Clinical build/runtime/health

Bindings
Operations → Clinical PASS/FAIL
Operations → Billing PASS/FAIL

Scheduling Proof
iterations:
successful reservations:
conflicts:
double bookings:

Reliability Proof
atomic success:
failure/rollback:
replay:
hash conflict:

Admission Proof
License:
Plan:
Restriction:
Assessment:

CommercialTerms
Transport:
Business READY achievable: YES/NO

Observability
Correlation:
PII review:

Cloudflare Free
Worker-call estimate:
D1-read estimate:
bundle sizes:

Remaining blockers

Next PR
```

---

# 95. Decisão do próximo PR

Existem dois caminhos possíveis após essa qualificação.

### Caminho A — CommercialTerms consegue `READY`

Se uma configuração real e normativa já conseguir produzir:

```text
CommercialTerms = READY
```

e todos os gates acima estiverem verdes:

> **PR-12 — CreateAppointment Authoritative Flow**

Finalmente.

### Caminho B — CommercialTerms continua sempre `BLOCKED`

Se `DiscountPolicyPort` e `DepositPolicyPort` continuarem sem adapter real:

> **PR-11.2 — Commercial Policy Configuration**

antes do PR-12.

Esse segundo caminho é bastante provável considerando o relatório do PR-10, que explicitamente informa que nenhuma regra de desconto/sinal foi inventada e que policies indisponíveis continuam `BLOCKED`.

A sequência, portanto, deve ficar:

```text
PR-10
Billing Foundation
        ↓
PR-11
Admission Dependencies
        ↓
PR-11.1
Runtime + Integration Qualification
        ↓
        ├── CommercialTerms READY
        │        ↓
        │      PR-12
        │  CreateAppointment
        │
        └── CommercialTerms BLOCKED
                 ↓
              PR-11.2
        Commercial Policies
                 ↓
               PR-12
```

Essa é a mudança mais importante em relação ao roadmap anterior: **neste momento o maior risco do projeto não é faltar outra classe de domínio; é existirem muitas fundações logicamente corretas que ainda não foram provadas juntas no runtime real escolhido — D1 + Cloudflare Workers + Service Bindings.** Portanto, eu faria do próximo PR um **PR de qualificação executável**, e não adicionaria mais funcionalidade antes desses gates estarem verdes.
