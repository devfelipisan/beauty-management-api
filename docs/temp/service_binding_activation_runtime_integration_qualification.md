Com base no estado atual, o próximo PR deve ser:

# PR-11.4 — Service Binding Activation + Runtime Integration Qualification

O foco agora é substituir os adapters `Unavailable*` pelos adapters reais baseados em `CLINICAL_SERVICE` e `BILLING_SERVICE`, provar isolamento de contexto, validar D1/concorrência/reliability no runtime Cloudflare e fechar a pendência do Vitest.

Ainda **não** é hora de `POST /appointments`.

A meta é sair de:

```text
HTTP bridge real       PASS
RPC entrypoints        PASS
Bindings declarados    PASS
Bindings conectados    NÃO
Adapters reais         NÃO
Vitest                  NÃO
Concurrency physical   NÃO
Reliability physical   NÃO
```

para:

```text
HTTP bridge              QUALIFIED
Clinical RPC             CONNECTED
Billing RPC              CONNECTED
Context isolation        PROVEN
D1 runtime               PROVEN
Scheduling concurrency   PROVEN
Reliability runtime      PROVEN
Vitest                    PASS
```

---

# 1. Escopo exato

Implementar apenas:

```text
Operations → Clinical Service Binding adapter
Operations → Billing Service Binding adapter

RPC contracts/runtime validation

context propagation
context isolation proofs

D1 integration proofs

Scheduling concurrency proof

Reliability physical proofs

Vitest recovery

Cloudflare multi-worker local runtime

runtime documentation
```

Fora do escopo:

```text
POST /appointments

novas regras de Discount
novas regras de Deposit

Payment
Refund
Package

Session
Technical Record

Queue
Cron
Outbox consumer

KV
R2
```

---

# 2. Gate inicial

Antes de alterar:

```bash
pwd
git status
git branch --show-current
git log --oneline -20
```

Inventariar:

```bash
find apps/operations-worker -maxdepth 7 -type f | sort
find apps/billing-worker -maxdepth 7 -type f | sort
find apps/clinical-worker -maxdepth 7 -type f | sort
find libs/contracts -maxdepth 7 -type f | sort
find libs/cloudflare-runtime -maxdepth 7 -type f | sort
```

Pesquisar os adapters atuais:

```bash
grep -R "UnavailableAssessment" apps libs -n || true
grep -R "UnavailableCommercial" apps libs -n || true
grep -R "AssessmentEligibilityPort" apps libs -n
grep -R "CommercialTermsPort" apps libs -n
```

Não criar implementações paralelas.

---

# 3. Inspecionar bindings reais

Abrir:

```bash
cat apps/operations-worker/wrangler.jsonc
cat apps/billing-worker/wrangler.jsonc
cat apps/clinical-worker/wrangler.jsonc
```

Confirmar:

```text
CLINICAL_SERVICE
BILLING_SERVICE
```

e os nomes dos Workers alvo.

Não inventar aliases novos se os bindings já estão documentados.

---

# 4. Corrigir `not connected`

Esse é o primeiro blocker operacional.

Precisamos subir os três Workers de forma que os bindings sejam resolvidos no mesmo runtime local.

Preferencialmente testar multi-config:

```bash
npx wrangler dev \
  -c apps/clinical-worker/wrangler.jsonc \
  -c apps/billing-worker/wrangler.jsonc \
  -c apps/operations-worker/wrangler.jsonc
```

Se a versão atual do Wrangler não suportar adequadamente esse modo, usar três processos locais separados conforme a configuração oficial disponível.

Não substituir isso por HTTP público.

---

# 5. Gate dos bindings

O runtime precisa deixar de reportar:

```text
CLINICAL_SERVICE → not connected
BILLING_SERVICE  → not connected
```

e passar a reportar ambos conectados.

Se isso não acontecer:

```text
PR BLOCKED
```

até corrigir configuração.

---

# 6. Formalizar contratos RPC

O PR-11.3 já criou os entrypoints RPC.

Agora os contratos precisam ser inequívocos.

Em `libs/contracts`, garantir contratos semelhantes a:

```text
assessment-eligibility/
commercial-terms/
```

Sem compartilhar:

```text
Assessment entity
CommercialTerms entity
Customer entity
Service entity
```

Contratos de transporte apenas.

---

# 7. Assessment RPC request

Deve conter somente o necessário:

```ts
interface CheckAssessmentEligibilityRequest {
  tenantId: string;
  customerId: string;
  serviceId: string;
  correlationId: string;
}
```

Se `actorId` for necessário para auditoria/autorização interna, adicioná-lo explicitamente.

Não transmitir JWT por RPC se o Clinical não precisa dele.

---

# 8. Assessment RPC response

Algo como:

```ts
interface CheckAssessmentEligibilityResponse {
  status: 'READY' | 'BLOCKED';
  reason?: string;
}
```

ou o contrato já consolidado.

Não transportar Assessment completo.

---

# 9. CommercialTerms request

Deve utilizar o contrato já criado no PR-10.

Somente dados comerciais necessários:

```text
tenantId
customerId
serviceId
basePriceCents
relationshipProfile
correlationId
```

conforme contrato existente.

Não transmitir Customer inteiro.

---

# 10. Validar RPC no destino

Mesmo Service Binding sendo interno:

```text
input
→ contract validation
→ application service
```

Não assumir que comunicação interna é automaticamente confiável.

---

# 11. Criar adapter real Clinical no Operations

Se ainda não existir:

```bash
nest g provider \
  appointment-eligibility/adapters/clinical-service-binding-assessment-eligibility \
  --project operations-worker
```

Ele implementa:

```text
AssessmentEligibilityPort
```

Fluxo:

```text
AssessmentEligibilityPort
        ↓
Cloudflare Service Binding Adapter
        ↓
env.CLINICAL_SERVICE
        ↓
Clinical RPC
```

---

# 12. Adapter não deve conter regra clínica

Não fazer:

```ts
if (result === 'NAO_APTO') ...
```

no adapter se essa semântica pertence ao contrato/application policy.

O adapter deve traduzir transporte.

---

# 13. Criar adapter real Billing no Operations

```bash
nest g provider \
  appointments/adapters/billing-service-binding-commercial-terms \
  --project operations-worker
```

Implementa:

```text
CommercialTermsPort
```

Fluxo:

```text
CommercialTermsPort
      ↓
Billing Service Binding Adapter
      ↓
env.BILLING_SERVICE
      ↓
calculateCommercialTerms()
```

---

# 14. Composition root

O `Operations Worker` deve escolher:

```text
binding conectado
→ adapter real
```

e não mais `Unavailable*`.

Mas os adapters fail-closed continuam úteis para:

```text
tests
misconfiguration
environments without capability
```

Não removê-los sem motivo.

---

# 15. Produção deve falhar cedo se binding obrigatório estiver ausente

Em ambiente em que Clinical/Billing são obrigatórios:

```text
missing binding
→ configuration error
```

é preferível a descobrir no primeiro request.

Mas preserve `/health` conforme contrato atual, se ele precisa funcionar sem dependências.

Pode haver diferença entre:

```text
liveness
```

e:

```text
readiness
```

Não transformar `/health` em dependency fan-out.

---

# 16. Clinical RPC real

No Clinical Worker:

```text
checkAssessmentEligibility()
```

deve:

```text
validate request
↓
create execution context
↓
invoke CheckAssessmentEligibility
↓
D1 repository
↓
map result
```

Sem regra no `worker.ts`.

---

# 17. Billing RPC real

No Billing:

```text
calculateCommercialTerms()
```

deve:

```text
validate request
↓
create execution context
↓
CalculateCommercialTerms
↓
return READY/BLOCKED
```

O resultado pode continuar `BLOCKED`.

Isso não é falha de transporte.

---

# 18. Diferenciar dois conceitos no relatório

Obrigatoriamente:

```text
RPC transport status
```

e:

```text
business capability status
```

Exemplo:

```text
Operations → Billing RPC = PASS
CommercialTerms          = BLOCKED
```

Isso é um resultado legítimo.

---

# 19. Propagar correlationId

Operations recebe:

```text
correlationId = A
```

Ao chamar Clinical:

```text
correlationId = A
```

Ao chamar Billing:

```text
correlationId = A
```

Cada Worker gera seu próprio:

```text
requestId/invocationId
```

---

# 20. Não propagar contexto mutável inteiro

Não passar:

```text
ExecutionContext object completo
```

automaticamente.

Use contrato interno explícito.

---

# 21. Teste RPC Clinical — serviço sem Assessment

Esse teste é crucial para custo.

Dado:

```text
service.requiresAssessment = false
```

então:

```text
Clinical RPC call count = 0
```

O Operations deve decidir `NOT_REQUIRED` localmente.

---

# 22. Teste RPC Clinical — APTO

Dado:

```text
requiresAssessment = true
Assessment = APTO
```

Resultado:

```text
AssessmentEligibility = READY
```

---

# 23. APTO_COM_RESTRICOES

Provar o comportamento normativo implementado.

Não converter silenciosamente em `NAO_APTO`.

---

# 24. NAO_APTO

Resultado:

```text
BLOCKED
```

---

# 25. Clinical indisponível

Se o Service exige Assessment:

```text
Clinical binding failure
→ BLOCKED
```

Fail-closed obrigatório.

---

# 26. Teste Billing RPC

Operations chama:

```text
calculateCommercialTerms()
```

e recebe o resultado real do PR-10.

Se policies continuam indisponíveis:

```text
BLOCKED
```

é esperado.

---

# 27. Billing indisponível

Resultado:

```text
CommercialTerms unavailable
→ BLOCKED
```

Nunca assumir:

```text
discount = 0
deposit = none
```

---

# 28. Recuperar definitivamente Vitest

Isso continua pendente desde vários PRs.

Primeiro:

```bash
find . -maxdepth 4 \
  \( -name "vitest.config.*" -o -name "vite.config.*" \) \
  -print

cat package.json
```

Confirmar:

```text
script
config path
cwd
module type
Node 24
```

---

# 29. Isolar o problema da config

Executar:

```bash
npx vitest --version
```

Depois:

```bash
npx vitest run --config ./vitest.config.mts
```

Se o erro continuar:

```text
UNRESOLVED_ENTRY
```

inspecionar se o arquivo realmente existe e se o path usado pelo script é válido no Windows.

---

# 30. Normalizar para `.ts` se necessário

Se comprovado que `.mts` é a causa e a configuração não depende de semântica exclusiva de `.mts`:

```text
vitest.config.mts
→
vitest.config.ts
```

Atualizar script.

Não alterar conteúdo sem necessidade.

---

# 31. Criar configuração minimalista

O config de unit tests deve ser simples.

Não usar Wrangler/Vite Worker config se não necessário para domain tests.

Objetivo:

```text
Vitest Node
→ Domain/Application
```

---

# 32. Separar runtime tests

Criar, se necessário:

```text
vitest.config.workers.ts
```

para:

```text
D1
Cloudflare runtime
RPC
bindings
```

Não fazer todos os testes puros dependerem de Miniflare.

---

# 33. Scripts

Se fizer sentido:

```json
"test": "...",
"test:unit": "...",
"test:workers": "...",
"test:integration": "..."
```

Mas não duplicar scripts sem utilidade.

---

# 34. Unit tests que finalmente precisam rodar

No mínimo:

```text
Reliability
TimeInterval
AppointmentStateMachine
Availability
AppointmentEligibility
LicenseOperationalPolicy
AssessmentEligibilityPolicy
CommercialTerms
Idempotency
```

---

# 35. Isolamento de contexto sequencial

O PR-11.3 já criou bridge HTTP real.

Agora executar:

```text
Request A
tenant=A
actor=A
```

seguido de:

```text
Request B
tenant=B
actor=B
```

Confirmar:

```text
B nunca recebe:
tenant=A
actor=A
requestId=A
```

---

# 36. Isolamento concorrente

Executar simultaneamente:

```text
Request A tenant A
Request B tenant B
```

pela mesma instância/isolate quando possível.

Validar:

```text
A stays A
B stays B
```

---

# 37. Teste de stress leve de contexto

Executar, por exemplo:

```text
100 requests
alternando Tenant A / Tenant B
```

e confirmar ausência de vazamento.

Esse teste vale muito para o runtime Nest cacheado.

---

# 38. Verificar runtime cache

Se `libs/cloudflare-runtime` usa algo como:

```ts
let runtimePromise;
```

isso pode ser preservado.

Mas somente:

```text
Nest container
stateless services
```

podem ser compartilhados.

Nunca:

```text
actorId
tenantId
correlationId
```

---

# 39. D1 Operations integration proof

Atravessar:

```text
Cloudflare fetch
→ Authentication
→ Tenancy
→ Permission
→ Application
→ CustomerRepository
→ env.DB
```

Usar os endpoints Customer já qualificados.

---

# 40. Teste lista Customers

Com dados:

```text
Tenant A customer A
Tenant B customer B
```

Request A deve ver somente:

```text
Customer A
```

---

# 41. Teste Get Customer cross-tenant

Request:

```text
tenant A
customer B
```

Resultado:

```text
404 ou 403
```

conforme contrato existente.

Nunca Customer B.

---

# 42. PATCH Customer real

Usar o vertical já qualificado:

```text
PATCH /tenants/:tenantId/customers/:id
```

Provar:

```text
validation
security
D1 mutation
response
```

---

# 43. Reexecutar migrations

Não precisa recriá-las.

Mas como gate:

```bash
npx wrangler d1 migrations list <db> --local
```

Esperado:

```text
No migrations to apply
```

---

# 44. Scheduling concurrency proof

Ainda pendente desde PR-08.

Agora precisa virar gate impeditivo.

Preparar fixtures tenant-aware.

---

# 45. Concorrência no adapter real

Usar:

```text
ScheduleReservationPort
↓
D1 adapter
```

Não fake.

---

# 46. Cenário idêntico

Duas reservas:

```text
Professional P
09:00–10:00
```

simultâneas.

Resultado:

```text
1 reservation success
1 conflict
```

---

# 47. Repetir

Rodar N casos independentes.

Sugestão:

```text
50 pares
```

Resultado:

```text
50 successful
50 conflicts
0 double-bookings
```

Não precisa ser exatamente 50 se o ambiente ficar lento.

---

# 48. Adjacência

Provar:

```text
09:00–10:00
10:00–11:00
```

ambas permitidas.

---

# 49. Overlap parcial

```text
09:00–10:00
09:30–10:30
```

apenas uma.

---

# 50. Cross-tenant scheduling

Mesmo profissional ID em tenants distintos não deve causar conflito entre tenants se o modelo permitir identidades separadas por tenant.

Tenant deve participar da query de conflito.

---

# 51. Se `INSERT ... WHERE NOT EXISTS` produzir double booking

PR falha.

Não usar mutex em memória.

Precisaremos revisar a primitive de reserva D1.

---

# 52. Reliability proof física

Executar o `UnitOfWork` real contra D1.

Fluxo:

```text
idempotency reserve
business mutation
audit
outbox
idempotency completion
```

---

# 53. Success proof

Esperado:

```text
business mutation = 1
audit             = 1
outbox            = 1
idempotency       = COMPLETED
```

---

# 54. Failure proof

Forçar falha em uma statement.

Confirmar semântica do `D1Database.batch()` implementado.

O relatório deve dizer exatamente:

```text
o que persistiu
o que não persistiu
```

Não chamar de rollback se não for rollback.

---

# 55. Caso haja diferença da documentação

Atualizar:

```text
docs/reliability/unit-of-work.md
```

e implementação se necessário.

A documentação precisa representar comportamento físico, não intenção.

---

# 56. Replay de idempotência

Executar mesma operação duas vezes:

```text
same tenant
same operation
same key
same hash
```

Resultado:

```text
1 mutation
same logical response
```

---

# 57. Conflict

Mesmo key:

```text
hash diferente
```

Resultado:

```text
IDEMPOTENCY_KEY_CONFLICT
```

e nenhuma segunda mutation.

---

# 58. Outbox

Confirmar:

```text
new event status = PENDING
```

e nenhum consumer executa.

---

# 59. Audit

Confirmar append.

Não deve existir update/delete no path testado.

---

# 60. Health regression

Nos três Workers:

```text
GET /health → 200
```

E:

```text
D1 queries        0
Clinical RPC      0
Billing RPC       0
Audit writes      0
Outbox writes     0
```

---

# 61. Wrangler dev com bindings reais

Executar ambiente multi-worker e registrar:

```text
CLINICAL_SERVICE connected
BILLING_SERVICE connected
```

Isso é obrigatório.

---

# 62. Não aceitar mais `not connected`

Se local tooling tiver limitação comprovada:

* documentar exatamente a limitação;
* criar teste equivalente no Workers test runtime;
* não marcar binding como qualificado sem execução real em algum runtime compatível.

---

# 63. Wrangler dry-run

Continuar:

```bash
npx wrangler deploy --dry-run \
  --config apps/operations-worker/wrangler.jsonc
```

idem Billing/Clinical.

Bundling normal.

---

# 64. Worker runtime tests

Além de `wrangler dev`, ter testes automatizados para:

```text
health
404
401
403
validation
D1
RPC
context isolation
```

Se possível usando o runtime de Workers para Vitest.

---

# 65. Architecture test — bindings

Proibir:

```text
Operations Domain
→ Cloudflare binding
```

Permitido:

```text
Infrastructure adapter
→ binding
```

---

# 66. Architecture test — cross-worker imports

Proibir:

```text
Operations
→ Clinical domain entity

Operations
→ Billing domain entity

Clinical
→ Operations domain

Billing
→ Operations domain
```

Somente `libs/contracts`.

---

# 67. Correlation observability proof

Criar uma chamada Operations → Clinical.

Confirmar logs/traces:

```text
Operations correlationId = X
Clinical correlationId = X
```

Depois Billing.

---

# 68. PII review

Inspecionar logs da integração.

Não pode aparecer:

```text
JWT
customer email
customer phone
document
assessment content
```

---

# 69. Free Tier request cost

Agora será possível estimar melhor.

### Customer HTTP

```text
1 Operations Worker request
+ D1 reads
```

### Appointment eligibility sem assessment

```text
1 Operations request
+ 0 Clinical request
```

### Com assessment

```text
1 Operations
+ 1 Clinical service-binding invocation
```

### CommercialTerms futuro

```text
+ 1 Billing binding invocation
```

Documentar.

---

# 70. Evitar RPC desnecessário

Testar explicitamente:

```text
requiresAssessment=false
→ no Clinical invocation
```

Isso vira regression test de custo.

---

# 71. Não chamar Billing em eligibility

Preservar:

```text
Eligibility
≠
CommercialTerms
```

Billing será usado no CreateAppointment futuro, não em todo check de disponibilidade.

---

# 72. Bridge coverage

PR-11.3 qualificou apenas Customers.

Neste PR, eu **não migraria todos os controllers ainda**.

Esse trabalho pode continuar incrementalmente.

Mas devemos provar que o padrão é generalizável.

Adicionar no máximo um segundo bounded context simples, por exemplo:

```text
GET Services
```

se isso ajudar a provar reuso.

Não transformar PR em migração completa da API.

---

# 73. Route contract reuse

Se o bridge de Customers ainda estiver hardcoded, refatorar para um mecanismo reutilizável.

Mas não fazer framework interno gigantesco.

Objetivo:

```text
Customer route definition
Service route definition
```

com shared:

```text
auth
tenant
permission
validation
error mapping
```

---

# 74. Não reimplementar Nest inteiro

Evitar construir dentro de `cloudflare-runtime`:

```text
custom decorators
custom dependency injector
custom pipes framework
custom interceptor framework
```

Apenas runtime adapter necessário.

---

# 75. Estado esperado ao fim

```text
Cloudflare Module Workers
        │
        ▼
Operations HTTP Bridge
        │
        ├── Auth
        ├── Tenant
        ├── Permission
        ├── Validation
        ├── D1
        │
        ├── Clinical RPC ──► Clinical Worker ──► D1
        │
        └── Billing RPC ───► Billing Worker
```

Com runtime qualificado de verdade.

---

# 76. CreateAppointment readiness matrix

Ao final, preencher:

| Capability                | Status        |
| ------------------------- | ------------- |
| Cloudflare HTTP runtime   | PASS          |
| Auth                      | PASS          |
| Tenant isolation          | PASS          |
| Validation                | PASS          |
| D1                        | PASS          |
| Scheduling conflict       | PASS físico   |
| Reliability               | PASS físico   |
| Idempotency               | PASS físico   |
| Clinical binding          | PASS          |
| Assessment eligibility    | PASS          |
| Billing binding           | PASS          |
| CommercialTerms transport | PASS          |
| CommercialTerms business  | READY/BLOCKED |

---

# 77. O último item decide o roadmap

Se:

```text
CommercialTerms business = READY
```

para configuração real:

> próximo = **PR-12 — CreateAppointment Authoritative Flow**

Se:

```text
CommercialTerms business = BLOCKED
```

sempre:

> próximo = **PR-11.5 — Commercial Policy Materialization**

---

# 78. Definition of Done — RPC

```text
[ ] CLINICAL_SERVICE connected

[ ] BILLING_SERVICE connected

[ ] Operations Clinical adapter real

[ ] Operations Billing adapter real

[ ] adapters Unavailable não são composição principal

[ ] Clinical RPC executes application service

[ ] Billing RPC executes application service

[ ] RPC input validated

[ ] RPC failure remains fail-closed

[ ] correlation propagated
```

---

# 79. Definition of Done — context

```text
[ ] sequential tenant isolation PASS

[ ] concurrent tenant isolation PASS

[ ] 100-request alternating-tenant regression PASS

[ ] actor does not leak

[ ] requestId does not leak

[ ] correlation handling correct

[ ] no global mutable request state
```

---

# 80. Definition of Done — Vitest

```text
[ ] config resolved

[ ] npm run test executes

[ ] domain tests PASS

[ ] reliability tests PASS

[ ] scheduling tests PASS

[ ] eligibility tests PASS

[ ] billing tests PASS

[ ] clinical tests PASS
```

---

# 81. Definition of Done — D1

```text
[ ] migrations 0001–0004 PASS

[ ] no pending migrations unexpectedly

[ ] Operations repository proof PASS

[ ] Clinical repository proof PASS

[ ] tenant isolation physical proof PASS
```

---

# 82. Definition of Done — scheduling

```text
[ ] real D1 concurrency test PASS

[ ] conflicts detected

[ ] adjacent slots accepted

[ ] overlapping slots rejected

[ ] zero double bookings

[ ] no process-local lock
```

---

# 83. Definition of Done — reliability

```text
[ ] UnitOfWork real D1 success proof PASS

[ ] failure semantics proved

[ ] idempotency replay PASS

[ ] idempotency conflict PASS

[ ] audit append PASS

[ ] outbox PENDING PASS
```

---

# 84. Definition of Done — quality

```text
[ ] npm run lint PASS

[ ] tsc --build PASS

[ ] Vitest PASS

[ ] Worker runtime tests PASS

[ ] RPC integration tests PASS

[ ] D1 integration tests PASS

[ ] concurrency tests PASS

[ ] wrangler dry-run Operations PASS

[ ] wrangler dry-run Billing PASS

[ ] wrangler dry-run Clinical PASS

[ ] health smoke PASS

[ ] git diff --check PASS
```

---

# 85. O que não deve aparecer no diff

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

new discount %
new deposit %

HTTP público Operations→Clinical
HTTP público Operations→Billing
```

---

# 86. Relatório pós-implementação

O Codex deve responder em formato semelhante:

```text
PR-11.4 — Service Binding Activation + Runtime Integration Qualification

Toolchain
Vitest:
Oxlint:
TypeScript:
Wrangler:

Bindings
CLINICAL_SERVICE:
BILLING_SERVICE:

RPC
Operations → Clinical:
Operations → Billing:

Context Isolation
sequential:
concurrent:
stress:

D1
migrations:
Operations integration:
Clinical integration:

Scheduling
iterations:
successes:
conflicts:
double bookings:

Reliability
success:
failure:
replay:
hash conflict:

HTTP Bridge
health:
404:
401:
403:
validation:
D1 endpoint:

Observability
correlation Clinical:
correlation Billing:
PII review:

CommercialTerms
transport:
business result:

Cloudflare Free
estimated internal calls:
D1 read profile:

Remaining blockers:

Next PR:
```

---

# 87. Próximo passo provável

Pelo estado relatado do PR-10, há uma chance alta de termos ao fim deste PR:

```text
Billing RPC            PASS
CommercialTerms        BLOCKED
```

porque `DiscountPolicyPort` e `DepositPolicyPort` ainda não possuem regras reais configuradas.

Se isso acontecer, o próximo PR deverá ser:

# PR-11.5 — Commercial Policy Materialization

Ele será pequeno e focado em tornar:

```text
CalculateCommercialTerms
BLOCKED
```

em:

```text
READY
```

para pelo menos uma configuração comercial **normativamente válida**, sem inventar percentuais.

Somente depois:

# PR-12 — CreateAppointment Authoritative Flow

Assim a sequência fica:

```text
PR-11.3
HTTP/RPC bridge base
       ↓
PR-11.4
bindings reais
+ context isolation
+ D1/concurrency/reliability proofs
       ↓
       ├── CommercialTerms READY
       │           ↓
       │         PR-12
       │
       └── CommercialTerms BLOCKED
                   ↓
                PR-11.5
          Commercial Policies
                   ↓
                 PR-12
```

Esse é o próximo passo mais seguro porque o runtime já deixou de ser o blocker conceitual; agora precisamos **provar os bindings e as garantias físicas que sustentam a admissão do agendamento**. O próximo domínio novo só deve aparecer depois que essa infraestrutura estiver realmente qualificada.
