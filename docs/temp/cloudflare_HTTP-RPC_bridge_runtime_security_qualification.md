Considerando o estado após o **PR-11.2**, o próximo PR deve resolver exatamente a lacuna que ainda impede considerar os Workers como runtime de produção válido:

> **PR-11.3 — Cloudflare HTTP/RPC Bridge + Runtime Security Qualification**

O objetivo não é adicionar domínio novo. É fazer o `worker.ts` deixar de ser apenas um shell que responde `/health` e `404` e passar a encaminhar requisições reais para a aplicação, preservando autenticação, tenancy, validação, error mapping, observabilidade e os contratos internos entre Workers.

A arquitetura a perseguir é:

```text
Cloudflare Module Worker
        │
        ├── public fetch()
        │       ↓
        │   HTTP Bridge
        │       ↓
        │   Authentication
        │       ↓
        │   Tenancy
        │       ↓
        │   Validation
        │       ↓
        │   Application
        │
        └── internal RPC
                ↓
          Application Services
```

Ainda **sem `POST /appointments`**.

# PR-11.3 — Cloudflare HTTP/RPC Bridge + Runtime Security Qualification

## 1. Objetivos obrigatórios

O PR deve entregar quatro coisas:

```text
1. HTTP bridge real
2. Security/validation pipeline real
3. RPC Clinical/Billing real
4. Runtime integration proofs
```

Ao final, precisamos provar:

```text
Cloudflare Request
       ↓
Operations Worker
       ↓
auth
       ↓
tenant
       ↓
validation
       ↓
existing use case
       ↓
D1
```

e:

```text
Operations
   ├── RPC → Clinical
   └── RPC → Billing
```

---

# 2. O que NÃO entra

Bloquear explicitamente:

```text
POST /appointments

Payment
Refund
Credit
Package

Session

R2
KV

Queue
Cron
Outbox consumer

novas regras de Discount
novas regras de Deposit

novas regras de License
novas regras de Assessment
```

Este PR é runtime/integration.

---

# 3. Gate inicial — congelar o estado real

Executar:

```bash
pwd
git status
git branch --show-current
git log --oneline -20
```

Depois:

```bash
find apps/operations-worker -maxdepth 7 -type f | sort
find apps/billing-worker -maxdepth 7 -type f | sort
find apps/clinical-worker -maxdepth 7 -type f | sort
find libs/cloudflare-runtime -maxdepth 7 -type f | sort
```

Inspecionar os entrypoints:

```bash
cat apps/operations-worker/src/worker.ts
cat apps/billing-worker/src/worker.ts
cat apps/clinical-worker/src/worker.ts
```

E os módulos:

```bash
cat apps/operations-worker/src/operations-worker.module.ts
cat apps/billing-worker/src/billing-worker.module.ts
cat apps/clinical-worker/src/clinical-worker.module.ts
```

---

# 4. Inventariar a superfície HTTP já existente

Antes de construir bridge, descobrir exatamente quais Controllers precisam ser suportados.

```bash
grep -R "@Controller" apps/operations-worker/src -n
grep -R "@Get(" apps/operations-worker/src -n
grep -R "@Post(" apps/operations-worker/src -n
grep -R "@Patch(" apps/operations-worker/src -n
grep -R "@Delete(" apps/operations-worker/src -n
```

Esperado existir pelo menos:

```text
Tenant
Professional
Service
Customer
Availability
Health
```

O bridge precisa suportar a superfície real já implementada.

---

# 5. Inventariar recursos do pipeline Nest usados hoje

Pesquisar:

```bash
grep -R "@UseGuards" apps libs -n
grep -R "ValidationPipe" apps libs -n
grep -R "ExceptionFilter" apps libs -n
grep -R "Interceptor" apps libs -n
grep -R "Middleware" apps libs -n
grep -R "CurrentTenant" apps libs -n
grep -R "CurrentActor" apps libs -n
grep -R "RequirePermission" apps libs -n
```

Criar matriz:

| Recurso        | Existe | Deve funcionar no Worker |
| -------------- | -----: | -----------------------: |
| Authentication |      ✓ |              obrigatório |
| Tenancy        |      ✓ |              obrigatório |
| Permission     |      ✓ |              obrigatório |
| Validation     |      ✓ |              obrigatório |
| Error mapping  |      ✓ |              obrigatório |
| Correlation    |      ✓ |              obrigatório |
| Observe        |      ✓ |              obrigatório |
| Controllers    |      ✓ |              obrigatório |

---

# 6. Decisão arquitetural central

O PR-11.2 já deixou claro que o Module Worker é o runtime externo.

Agora temos de evitar duas arquiteturas paralelas:

```text
Nest HTTP
```

e:

```text
Cloudflare custom routing
```

com regras diferentes.

Eu adotaria uma regra:

> **Toda regra de segurança e transformação deve existir em componentes independentes do servidor Node, mesmo quando exposta através de Guards/Pipes Nest.**

Isso permite que o Worker bridge reutilize a mesma lógica.

---

# 7. Não tentar simular Express dentro do Worker

Evitar transformar Cloudflare Request artificialmente em:

```text
Express.Request
Express.Response
```

e carregar Express apenas para reutilizar controllers.

Isso tende a gerar:

* bundle maior;
* abstrações incompatíveis;
* dependência de APIs de servidor Node;
* comportamento difícil de provar.

O runtime Cloudflare deve trabalhar com Web APIs:

```text
Request
Response
Headers
URL
```

---

# 8. Extrair segurança dos Guards quando necessário

Hoje pode existir algo como:

```text
AuthenticationGuard
     ↓
IdentityProvider
```

Isso é bom.

O Guard é apenas adapter Nest.

A lógica central deve estar em:

```text
AuthenticationService / IdentityResolver
```

ou port equivalente.

Então teremos:

```text
Nest Guard
       │
       ▼
shared auth application service
       ▲
       │
Cloudflare HTTP Bridge
```

Não duplicar validação JWT.

---

# 9. Fazer o mesmo para Tenant

Desejado:

```text
TenantGuard
       │
       ▼
TenantMembershipResolver
       ▲
       │
Cloudflare Bridge
```

O bridge não deve possuir regra:

```ts
if (tenantId === ...)
```

própria.

Ele apenas coordena componentes existentes.

---

# 10. E Permission

Mesma regra:

```text
PermissionGuard
       │
       ▼
PermissionEvaluator
       ▲
       │
Cloudflare Bridge
```

O objetivo é ter uma autoridade única de autorização.

---

# 11. Criar um pipeline HTTP próprio do runtime

Dentro de:

```text
libs/cloudflare-runtime
```

criar algo equivalente a:

```text
http/
├── cloudflare-http-router.ts
├── cloudflare-request-context.ts
├── cloudflare-auth-pipeline.ts
├── cloudflare-validation-pipeline.ts
└── cloudflare-error-mapper.ts
```

Não precisa usar exatamente esses nomes.

O importante é separar responsabilidades.

---

# 12. Não criar um router gigantesco

Evitar:

```ts
if pathname === ...
else if pathname === ...
else if ...
```

em `worker.ts`.

O `worker.ts` deve continuar mínimo:

```text
fetch()
  ↓
runtime.handle(request)
```

---

# 13. Criar definição de rota declarativa

Algo conceitualmente equivalente a:

```ts
{
  method: 'GET',
  path: '/tenants/:tenantId/customers',
  authentication: true,
  tenantRequired: true,
  permission: 'customer.read',
  handler: ...
}
```

Mas não duplicar decorators e metadata sem necessidade.

Idealmente, o bridge deve construir essa configuração a partir de uma fonte compartilhada ou de adapters pequenos.

---

# 14. Não criar duas fontes de verdade de rotas

Esse é um risco importante.

Não deixar:

```text
Nest Controller routes
```

e:

```text
Cloudflare route table
```

evoluírem separadamente.

Há duas opções aceitáveis.

### Opção A

Migrar os atuais Controllers para pequenos inbound adapters compartilháveis.

### Opção B

Declarar contratos de rota numa camada comum e fazer:

```text
Nest Controller → route contract
Cloudflare → route contract
```

Eu recomendaria B se a refatoração for pequena.

---

# 15. Criar `RouteDefinition`

Em `libs/contracts` ou runtime, dependendo da natureza:

```ts
interface RouteDefinition {
  method: HttpMethod;
  path: string;
  operation: string;
}
```

Mas não colocar funções Nest ou Cloudflare dentro do contract.

---

# 16. Primeiro vertical runtime: Customer read

Não tente migrar todos os controllers simultaneamente.

Escolha um endpoint simples existente, por exemplo:

```text
GET /tenants/:tenantId/customers/:id
```

Provar:

```text
Cloudflare fetch
   ↓
request ID
   ↓
auth
   ↓
tenant
   ↓
permission
   ↓
GetCustomer
   ↓
D1
   ↓
Response
```

Só depois generalizar.

---

# 17. Segundo vertical: Customer mutation

Escolha:

```text
PATCH /tenants/:tenantId/customers/:id
```

ou outro comando existente.

Provar adicionalmente:

```text
JSON parsing
validation
application command
error mapping
```

Não utilizar Appointment ainda.

---

# 18. DTO validation precisa ser reutilizável

Se DTOs atuais usam:

```text
class-validator
class-transformer
```

podem continuar sendo usados sem depender necessariamente do servidor Express.

Criar helper compartilhado que invoque a validação.

Assim:

```text
Nest ValidationPipe
```

e:

```text
Cloudflare Validation Adapter
```

produzem a mesma semântica.

---

# 19. Não fazer validação manual duplicada

Não escrever:

```ts
if (!body.name) ...
```

no Worker se o DTO já contém regras normativas.

Ter uma única fonte.

---

# 20. Mapear erros consistentemente

O bridge deve converter:

```text
DomainError
ApplicationError
AuthenticationError
TenantAccessError
ValidationError
```

nos mesmos contratos HTTP utilizados anteriormente.

Exemplo:

```text
AuthenticationRequired → 401
PermissionDenied       → 403
ResourceNotFound       → 404
Validation             → 400/422 conforme contrato
Conflict               → 409
```

Não retornar stack.

---

# 21. Criar `CloudflareErrorMapper`

Ele deve receber erro conhecido e produzir:

```ts
new Response(...)
```

com:

```text
code
message
requestId
correlationId
```

quando previsto pelo contrato.

---

# 22. Erros desconhecidos

Devem retornar:

```text
500
INTERNAL_ERROR
```

sem revelar:

```text
SQL
binding
secret
stack
internal paths
```

A stack fica na observabilidade sanitizada.

---

# 23. Criar request context por invocação

O PR-11.2 já possui runtime compartilhado.

Agora cada request precisa gerar um contexto imutável:

```text
requestId
correlationId
service
source
actorId?
tenantId?
traceId?
```

Não armazenar isso em singleton global.

---

# 24. Bootstrap Nest pode ser compartilhado

Pode continuar cacheado por isolate:

```text
runtimePromise
```

para reduzir custo.

Mas apenas providers stateless/safe podem ser singleton.

---

# 25. Request state jamais pode ser singleton

Proibido:

```ts
class ExecutionContextService {
  actorId;
  tenantId;
}
```

singleton mutável.

Prefira passar:

```text
ExecutionContext
```

explicitamente para Application Service.

---

# 26. Adaptar use cases para contexto explícito quando necessário

Exemplo:

```ts
execute(command, executionContext)
```

ou:

```ts
execute({
  ...command,
  context,
})
```

conforme padrão já adotado.

Evitar que Application leia headers.

---

# 27. Implementar authentication no HTTP bridge

Fluxo:

```text
Authorization header
       ↓
IdentityProvider
       ↓
AuthenticatedIdentity
```

Sem token:

```text
401
```

Token inválido:

```text
401
```

---

# 28. Não confiar no BFF

Mesmo quando futuramente houver BFF:

```text
Operations Worker
```

continua autenticando requests conforme arquitetura definida.

Não aceitar:

```text
x-user-id
```

como identidade autoritativa.

---

# 29. Tenant resolution

Para rota:

```text
/tenants/:tenantId/customers
```

o path fornece:

```text
candidateTenantId
```

Depois:

```text
candidate
+
authenticated actor
+
membership
       ↓
trustedTenantId
```

Só então Application recebe `tenantId`.

---

# 30. Permission pipeline

Após tenancy:

```text
requiredPermission
       ↓
PermissionEvaluator
       ↓
allow / deny
```

Sem permission:

```text
403
```

---

# 31. Health continua exceção

`GET /health` deve ignorar:

```text
auth
tenant
permission
D1
Service Bindings
```

O pipeline precisa tratar Health antes da cadeia protegida ou como rota explicitamente pública.

---

# 32. Teste HTTP obrigatório: Health

Cloudflare runtime real:

```text
GET /health
→ 200
```

Sem DB.

---

# 33. Teste HTTP obrigatório: rota inexistente

```text
GET /not-found
→ 404
```

---

# 34. Teste HTTP obrigatório: endpoint protegido sem token

Escolha um endpoint existente:

```text
GET /tenants/:tenantId/customers
```

Sem auth:

```text
401
```

---

# 35. Teste: token inválido

```text
Authorization: Bearer invalid
```

Resultado:

```text
401
```

---

# 36. Teste: tenant incorreto

Actor de:

```text
Tenant A
```

tenta:

```text
Tenant B
```

Resultado:

```text
403
```

---

# 37. Teste: permission ausente

Actor autenticado + tenant válido, mas sem:

```text
customer.read
```

Resultado:

```text
403
```

---

# 38. Teste: DTO inválido

Enviar payload com:

```text
campo obrigatório ausente
campo extra proibido
tipo incorreto
```

Resultado consistente com o ValidationPipe atual.

---

# 39. Teste: DTO válido

Deve atravessar:

```text
HTTP
→ Application
→ D1
```

PASS.

---

# 40. Context isolation sequencial

Request A:

```text
tenant=A
actor=A
```

Depois:

```text
tenant=B
actor=B
```

Confirmar que B nunca recebe contexto de A.

---

# 41. Context isolation concorrente

Executar:

```text
Promise.all([
 requestA,
 requestB,
])
```

através do runtime Workers.

Validar:

```text
tenant A stays A
tenant B stays B
```

e IDs distintos.

Esse é um gate de segurança.

---

# 42. Observability bridge

Cada HTTP request deve registrar/enriquecer:

```text
service
requestId
correlationId
operation
method
route
status
duration
tenantId
actorId
```

quando disponíveis.

---

# 43. Não registrar headers completos

Não enviar:

```text
Authorization
Cookie
```

ao Observe.

---

# 44. Não registrar body completo

Especialmente Customer e Clinical.

Payload de negócio não deve ser enviado automaticamente.

---

# 45. Correlation response

Responder:

```http
x-request-id
x-correlation-id
```

conforme fundação já criada.

---

# 46. Agora implementar RPC real

Depois do HTTP vertical PASS, avançar para RPC.

Clinical Worker deve expor uma operação interna equivalente a:

```text
checkAssessmentEligibility
```

Não precisa ser endpoint HTTP.

---

# 47. Criar adapter RPC do Clinical

O `worker.ts` Clinical deve delegar:

```text
RPC request
     ↓
shared contract validation
     ↓
CheckAssessmentEligibility
     ↓
AssessmentRepository
```

Não colocar regra clínica no entrypoint.

---

# 48. Entrada RPC mínima

Receber apenas:

```text
tenantId
customerId
serviceId
correlationId
```

e, se necessário:

```text
actorId
```

Não enviar JWT ou Customer inteiro.

---

# 49. Validar input RPC

Mesmo sendo comunicação interna, não assumir input válido.

Validar:

```text
IDs presentes
formato
tenant
```

antes do use case.

Service Binding reduz superfície pública, mas não remove necessidade de contract validation.

---

# 50. Contexto RPC

Criar:

```text
source = worker
```

ou nomenclatura já definida.

Preservar:

```text
correlationId
```

Gerar novo request/invocation id para Clinical.

---

# 51. Billing RPC

Implementar:

```text
calculateCommercialTerms
```

delegando ao:

```text
CalculateCommercialTerms
```

existente.

---

# 52. Não expor Discount/Deposit diretamente

Não criar RPC:

```text
calculateDiscount()
calculateDeposit()
```

Operations continua consumindo apenas:

```text
CommercialTermsPort
```

Uma chamada.

---

# 53. Adapters Operations

Criar/ativar:

```text
ClinicalServiceBindingAssessmentEligibilityAdapter
```

e:

```text
BillingServiceBindingCommercialTermsAdapter
```

em Infrastructure.

---

# 54. Composition root escolhe adapters

Quando bindings existem:

```text
AssessmentEligibilityPort
→ Clinical Service Binding adapter
```

e:

```text
CommercialTermsPort
→ Billing Service Binding adapter
```

Sem bindings:

```text
Unavailable*
```

continua fail-closed.

---

# 55. Não detectar binding ausente silenciosamente em produção

Se configuração de produção declara que Clinical/Billing são obrigatórios:

```text
binding ausente
→ startup/config failure
```

pode ser preferível a esperar primeiro request.

Mas isso deve respeitar a estratégia de Config atual.

---

# 56. Teste Operations → Clinical

Cenário:

```text
requiresAssessment=false
```

Resultado:

```text
Clinical calls = 0
```

---

# 57. Teste requiresAssessment=true

Com Assessment:

```text
APTO
```

Resultado:

```text
Eligibility continues
```

---

# 58. Assessment NAO_APTO

Resultado:

```text
BLOCKED
```

---

# 59. Clinical indisponível

Resultado:

```text
BLOCKED
```

Nunca allow.

---

# 60. Teste Operations → Billing

Chamar CommercialTerms.

Enquanto policies reais estiverem indisponíveis:

```text
BLOCKED
```

é esperado.

O gate é:

```text
RPC works
contract preserved
failure semantics preserved
```

---

# 61. Billing indisponível

Resultado:

```text
CommercialTerms unavailable
→ BLOCKED
```

---

# 62. Correlation RPC Clinical

Testar:

```text
Operations correlation = X
Clinical correlation = X
```

---

# 63. Correlation RPC Billing

Mesma prova.

---

# 64. Não exigir mesmo trace/request ID

`requestId` pode mudar por Worker.

O importante é:

```text
correlationId
```

preservar a cadeia.

---

# 65. Reexecutar D1 proof

Agora através do HTTP/RPC bridge real.

Operations:

```text
HTTP
→ Customer use case
→ D1
```

Clinical:

```text
RPC
→ Assessment use case
→ D1
```

---

# 66. Executar Scheduling concurrency novamente

Com runtime bridge agora funcionando:

```text
real D1
real scheduling adapter
```

Executar novamente a prova física pendente.

---

# 67. Não precisa expor Appointment endpoint

Pode chamar:

```text
ScheduleReservationPort
```

por integration harness.

Ainda sem API pública.

---

# 68. Gate concorrente

Rodar N pares de operações independentes.

Exemplo:

```text
iterations = 50
```

Esperado:

```text
successful reservations = 50
conflicts = 50
double bookings = 0
```

O número exato de iterações pode ser ajustado.

---

# 69. Testar intervalo adjacente

```text
09:00–10:00
10:00–11:00
```

ambos devem poder ser reservados.

---

# 70. Testar overlap parcial

```text
09:00–10:00
09:30–10:30
```

um deve falhar.

---

# 71. Reexecutar Reliability proof

Com D1 runtime:

```text
mutation
+ idempotency
+ audit
+ outbox
```

agora pela infraestrutura real.

---

# 72. Success proof

Esperado:

```text
business row = 1
audit = 1
outbox = 1
idempotency = COMPLETED
```

---

# 73. Failure proof

Forçar erro antes da conclusão.

Confirmar a semântica documentada.

Não presumir rollback se D1 batch tiver comportamento diferente.

---

# 74. Replay proof

Mesma:

```text
tenant
operation
idempotencyKey
requestHash
```

Resultado:

```text
same logical response
no duplicate mutation
```

---

# 75. Conflict proof

Mesma key, hash diferente:

```text
IDEMPOTENCY_KEY_CONFLICT
```

---

# 76. Vitest ainda precisa ser resolvido neste PR

O PR-11.2 não resolveu:

```text
UNRESOLVED_ENTRY vitest.config.mts
```

Agora isso vira gate obrigatório.

---

# 77. Diagnosticar config

Executar:

```bash
find . -maxdepth 4 \
  \( -name "vitest.config.*" -o -name "vite.config.*" \) \
  -print

cat package.json
```

Verificar:

```text
script path
config path
working directory
ESM resolution
Node 24 behavior
```

---

# 78. Normalizar config se necessário

Se `.mts` não traz benefício específico e for confirmado como causa, migrar de maneira controlada para:

```text
vitest.config.ts
```

Atualizar script.

Mas manter comportamento.

---

# 79. Não misturar unit e Worker runtime

Ter pelo menos:

```text
npm run test
```

para unit/application.

E um script separado:

```text
npm run test:workers
```

para runtime Cloudflare, se essa divisão for adotada.

---

# 80. Workers pool

Se necessário, adicionar suporte específico de Vitest para Workers.

Mas isso deve ser utilizado para:

```text
D1
Service Bindings
Workers runtime
```

não para unit tests puros.

---

# 81. Unit tests continuam rápidos

Domain:

```text
TimeInterval
Appointment FSM
License policy
Assessment policy
CommercialTerms
Eligibility
```

não precisam Miniflare/Workers runtime.

---

# 82. Integration tests usam runtime

Repositories/bindings/concurrency:

```text
Workers runtime
```

---

# 83. Scripts recomendados

Ao final, package.json deveria possuir algo conceitualmente equivalente a:

```text
test
test:unit
test:integration
test:workers
lint
typecheck
```

Somente se fizer sentido com a estrutura existente.

Não inventar scripts duplicados sem necessidade.

---

# 84. Wrangler dry-run continua obrigatório

Para os três Workers:

```bash
npx wrangler deploy --dry-run \
  --config apps/operations-worker/wrangler.jsonc

npx wrangler deploy --dry-run \
  --config apps/billing-worker/wrangler.jsonc

npx wrangler deploy --dry-run \
  --config apps/clinical-worker/wrangler.jsonc
```

Com bundling normal.

---

# 85. Wrangler dev multi-worker

Depois:

```text
Clinical
Billing
Operations
```

rodando simultaneamente.

Operations deve reportar bindings conectados.

Não aceitar:

```text
not connected
```

como qualificação final.

---

# 86. Ordem local

Subir primeiro:

```text
Clinical
Billing
```

depois:

```text
Operations
```

se a ferramenta/local configuration exigir.

---

# 87. Health continua local por Worker

Provar individualmente:

```text
Operations /health 200
Billing /health    200
Clinical /health   200
```

---

# 88. Não criar BFF agora

O BFF fica fora do PR.

O objetivo é qualificar Business Workers.

---

# 89. Free Tier — medir custo do bridge

Registrar aproximadamente:

```text
Operations HTTP request
+
Clinical RPC conditional
+
Billing RPC future
```

O runtime bridge não deve fazer chamadas externas só para montar contexto.

---

# 90. Não fazer Service Binding no Health

Explicitamente testar:

```text
GET /health
```

não chama:

```text
Clinical
Billing
D1
```

---

# 91. Bootstrap performance

Medir:

```text
first request
warm request
```

em `wrangler dev`.

Não precisa fazer benchmark científico.

Só registrar se Nest bootstrap causa custo exagerado.

---

# 92. Não bootstrap Nest por request

Se a implementação atual recria application context para toda request, isso deve ser corrigido se possível.

Estratégia:

```text
one application container per isolate
```

com contexto da request passado explicitamente.

---

# 93. Testar memória/context leak

Executar várias requests sequenciais com tenants diferentes.

Nenhum provider singleton pode guardar:

```text
actorId
tenantId
requestId
```

---

# 94. Teste de 100 requests alternando tenant

Por exemplo:

```text
A
B
A
B
...
```

e validar respostas/telemetria.

Esse é um bom regression test.

---

# 95. Architecture docs

Atualizar:

```text
docs/architecture/cloudflare-runtime.md
```

com:

```text
HTTP bridge
RPC bridge
request context lifecycle
application container lifecycle
Service Binding contracts
security pipeline
error mapping
```

---

# 96. Atualizar ADR-0010

Se o PR-11.2 dizia apenas:

```text
Module Worker entrypoint
```

agora atualizar consequência:

```text
Cloudflare runtime adapter is responsible for public HTTP dispatch
and internal RPC dispatch.
```

---

# 97. Documentar Nest responsibility

Algo como:

```text
NestJS remains responsible for:

- dependency injection
- module composition
- application services
- reusable guards/policies where runtime-neutral

Cloudflare Runtime Adapter is responsible for:

- Request/Response
- HTTP routing bridge
- Worker entrypoint
- bindings
- RPC
```

Isso evita confusão futura.

---

# 98. Não deixar Controller como autoridade

Controllers continuam adapters.

Se partes da lógica precisarem sair deles para permitir runtime Cloudflare:

```text
Controller
      ↓
shared application adapter/service
      ↑
Cloudflare route
```

Isso é saudável.

---

# 99. Definition of Done — HTTP bridge

```text
[ ] HTTP bridge implementado

[ ] route dispatch real

[ ] existing Operations endpoint atravessa bridge

[ ] auth real

[ ] tenancy real

[ ] permission real

[ ] validation real

[ ] error mapping real

[ ] observability real

[ ] health continua público

[ ] 404 continua correto
```

---

# 100. Definition of Done — Security

```text
[ ] sem token → 401

[ ] token inválido → 401

[ ] tenant inválido → 403

[ ] permission ausente → 403

[ ] cross-tenant access blocked

[ ] request state não global

[ ] concurrent context isolation PASS
```

---

# 101. Definition of Done — validation

```text
[ ] DTO inválido rejeitado

[ ] unknown field rejeitado quando política exigir

[ ] DTO válido aceito

[ ] sem validação duplicada manual
```

---

# 102. Definition of Done — RPC Clinical

```text
[ ] Clinical RPC implementado

[ ] Operations binding connected

[ ] AssessmentEligibility real via RPC

[ ] requiresAssessment=false não chama Clinical

[ ] APTO funciona

[ ] NAO_APTO bloqueia

[ ] Clinical failure bloqueia

[ ] correlationId propagado
```

---

# 103. Definition of Done — RPC Billing

```text
[ ] Billing RPC implementado

[ ] Operations binding connected

[ ] CommercialTermsPort usa RPC

[ ] RPC transport PASS

[ ] Billing failure = BLOCKED

[ ] nenhuma policy comercial inventada

[ ] correlationId propagado
```

---

# 104. Definition of Done — D1

```text
[ ] Operations D1 runtime query PASS

[ ] Clinical D1 runtime query PASS

[ ] migrations 0001–0004 permanecem PASS

[ ] no migration on bootstrap
```

---

# 105. Definition of Done — Scheduling

```text
[ ] concurrency proof usa D1 real

[ ] overlapping reservations create at most one

[ ] adjacent reservations allowed

[ ] no process-local mutex

[ ] cross-tenant isolation PASS
```

---

# 106. Definition of Done — Reliability

```text
[ ] mutation + reliability D1 proof PASS

[ ] idempotency replay PASS

[ ] hash conflict PASS

[ ] audit append-only preserved

[ ] outbox PENDING preserved

[ ] failure semantics documented and proven
```

---

# 107. Definition of Done — Vitest

```text
[ ] Vitest config resolves

[ ] unit suite executes

[ ] reliability tests execute

[ ] scheduling tests execute

[ ] eligibility tests execute

[ ] billing tests execute

[ ] clinical tests execute
```

---

# 108. Definition of Done — Worker runtime

```text
[ ] Operations bundling PASS

[ ] Billing bundling PASS

[ ] Clinical bundling PASS

[ ] Operations wrangler dev PASS

[ ] Billing wrangler dev PASS

[ ] Clinical wrangler dev PASS

[ ] bindings CONNECTED

[ ] no `--no-bundle` qualification workaround
```

---

# 109. Definition of Done — quality

```text
[ ] npm run lint PASS

[ ] tsc --build PASS

[ ] Vitest PASS

[ ] integration tests PASS

[ ] Workers runtime tests PASS

[ ] Wrangler dry-runs PASS

[ ] git diff --check PASS
```

---

# 110. Estado esperado ao final

Teremos finalmente:

```text
               Cloudflare Runtime
                      │
             Operations Worker
                      │
          ┌───────────┼────────────┐
          │           │            │
          ▼           ▼            ▼
         D1       Clinical RPC   Billing RPC
                      │            │
                      ▼            ▼
                     D1      CommercialTerms
```

Com a superfície pública:

```text
Request
 ↓
Cloudflare HTTP bridge
 ↓
Auth
 ↓
Tenant
 ↓
Permission
 ↓
Validation
 ↓
Application
 ↓
D1
```

---

# 111. O ponto mais importante: PR-12 ainda não é automático

Depois desse PR, montar esta matriz:

| Gate                   | Estado esperado |
| ---------------------- | --------------- |
| Module Worker          | PASS            |
| HTTP bridge            | PASS            |
| Auth                   | PASS            |
| Tenancy                | PASS            |
| Validation             | PASS            |
| D1                     | PASS            |
| Clinical RPC           | PASS            |
| Billing RPC            | PASS            |
| Scheduling concurrency | PASS            |
| Reliability            | PASS            |
| Vitest                 | PASS            |
| CommercialTerms        | ?               |

A última linha decide o próximo PR.

---

# 112. Se CommercialTerms ainda estiver sempre BLOCKED

Como o PR-10 afirmou:

```text
DiscountPolicyPort unavailable
DepositPolicyPort unavailable
```

existe forte possibilidade de após o PR-11.3 termos:

```text
Billing transport    PASS
CommercialTerms      BLOCKED
```

Nesse caso, **não abrir PR-12**.

O próximo será:

> **PR-11.4 — Commercial Policy Materialization**

Esse PR definirá, exclusivamente a partir das regras canônicas/configurações aprovadas:

```text
DiscountPolicy
DepositPolicy
```

sem valores inventados.

---

# 113. Se CommercialTerms consegue READY

Somente se uma configuração real e normativa permitir:

```text
CalculateCommercialTerms
→ READY
```

então:

> **PR-12 — CreateAppointment Authoritative Flow**

fica desbloqueado.

---

## Roadmap atualizado

```text
PR-11.1
Toolchain + initial runtime qualification
       ↓
PR-11.2
Module Worker entrypoints
       ↓
PR-11.3
HTTP/RPC Bridge
+ Security runtime
+ physical integration proofs
       ↓
       ├── CommercialTerms BLOCKED
       │         ↓
       │      PR-11.4
       │   Commercial Policies
       │         ↓
       └─────────┐
                 ▼
              PR-12
       CreateAppointment
       Authoritative Flow
```

A principal diferença neste momento é que **o runtime Cloudflare não pode ser considerado pronto apenas porque `worker.ts` bundla e `/health` responde**. O PR-11.3 deve provar a cadeia que realmente importa: `Request → Auth → Tenant → Permission → Validation → Application → D1`, além dos RPCs `Operations → Clinical/Billing` e das garantias físicas de concorrência/reliability que foram conscientemente adiadas nos PRs anteriores. Só depois disso a criação de Appointment deve ser colocada na superfície pública.
