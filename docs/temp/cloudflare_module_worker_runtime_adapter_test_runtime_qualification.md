Considerando o estado atual, o próximo PR não deve ser o `PR-12 — CreateAppointment Authoritative Flow`. O blocker agora é mais fundamental: **os Workers ainda não são Module Workers Cloudflare válidos no bundle real**.

O próximo PR deve ser:

# PR-11.2 — Cloudflare Module Worker Runtime Adapter + Test Runtime Qualification

Objetivo:

```text
Nest modules/domínio já implementados
        ↓
Cloudflare-compatible entrypoint
        ↓
Module Worker default export
        ↓
Wrangler bundle real
        ↓
Service Bindings reais
        ↓
Vitest/Workers runtime
        ↓
provas físicas
```

A razão é objetiva: Cloudflare Workers em ES Modules precisam expor um `default export` com `fetch()` ou uma classe `WorkerEntrypoint`; o `main.ts` Nest tradicional com `app.listen()` não atende esse modelo. ([Documentação do Desenvolvedor Cloudflare][1]) E Service Bindings suportam RPC/HTTP diretamente entre Workers, sem URL pública, exatamente como a arquitetura planejada precisa. ([Documentação do Desenvolvedor Cloudflare][2])

Há um cuidado importante: simplesmente substituir `NestFactory.create()` por `createApplicationContext()` não resolve todo o problema, porque aplicações Nest standalone não executam automaticamente o pipeline HTTP de controllers, middleware, guards, pipes e interceptors. ([NestJS Docs][3])

Por isso este PR precisa definir explicitamente **como Nest participa do runtime Cloudflare**, e não apenas trocar o entrypoint.

---

## 1. Escopo exato

Implementar:

```text
Cloudflare Module Worker entrypoints
Worker Env typing
Nest runtime bootstrap compatível
HTTP dispatch strategy
RPC/service-binding entrypoints
per-worker Wrangler main
Workers runtime tests
Vitest config corrigida
Cloudflare local runtime
Operations ↔ Clinical integration
Operations ↔ Billing integration
physical concurrency proof
physical reliability proof
```

Não implementar:

```text
POST /appointments
novas regras comerciais
Payment
Session
R2
KV
Queue
Cron
Outbox consumer
```

---

# 2. Primeira decisão arquitetural do PR

Antes de código, criar/atualizar ADR, por exemplo:

```text
docs/adr/
0010-cloudflare-module-worker-runtime.md
```

O ADR deve congelar:

```text
Node entrypoint
≠
Cloudflare Worker entrypoint
```

e:

```text
NestJS permanece composition/application framework

Cloudflare Worker
é o runtime adapter externo
```

A topologia fica:

```text
Cloudflare fetch/RPC
       ↓
Runtime Adapter
       ↓
Nest composition
       ↓
Application
       ↓
Domain
```

---

# 3. Não tentar executar `app.listen()` dentro do Worker

Os entrypoints atuais provavelmente fazem algo semelhante a:

```ts
const app = await NestFactory.create(Module);
await app.listen(...);
```

Isso é apropriado para Node HTTP server, não para Workers.

O Module Worker precisa ser chamado pelo runtime através de:

```ts
export default {
  async fetch(request, env, ctx) {}
}
```

ou `WorkerEntrypoint`. ([Documentação do Desenvolvedor Cloudflare][1])

Logo, o `main.ts` Node não deve ser apontado diretamente como `wrangler.main`.

---

# 4. Preservar entrypoint Node para smoke/local quando útil

Não precisa apagar imediatamente:

```text
apps/operations-worker/src/main.ts
```

Pode ficar como:

```text
Node/dev entrypoint
```

enquanto adicionamos:

```text
apps/operations-worker/src/worker.ts
```

para Cloudflare.

Isso evita quebrar os smoke tests atuais.

Depois, quando Cloudflare runtime estiver totalmente qualificado, podemos avaliar se o Node entrypoint ainda é necessário.

---

# 5. Criar `worker.ts` por Worker

Para:

```text
operations-worker
billing-worker
clinical-worker
```

criar:

```text
src/worker.ts
```

Não existe generator Nest específico para Cloudflare Worker, então aqui criação manual é legítima.

Estrutura:

```text
apps/operations-worker/src/
├── main.ts
├── worker.ts
└── operations-worker.module.ts
```

idem para Billing e Clinical.

---

# 6. Criar tipos de bindings via Wrangler

Agora que Wrangler funciona:

```bash
npx wrangler types \
  --config apps/operations-worker/wrangler.jsonc
```

E repetir para cada Worker.

Cloudflare atualmente recomenda gerar tipos a partir da configuração Wrangler, em vez de manter typings manuais desconectados. ([NPM][4])

O resultado deve fornecer tipos para:

```text
DB
CLINICAL_SERVICE
BILLING_SERVICE
```

onde aplicável.

---

# 7. Operations `Env`

Esperado conceitualmente:

```ts
interface Env {
  DB: D1Database;
  CLINICAL_SERVICE: ...;
  BILLING_SERVICE: ...;
}
```

Mas os tipos devem ser gerados/derivados da config real.

Não duplicar manualmente interfaces incompatíveis com Wrangler.

---

# 8. Billing deve ter apenas bindings necessários

Se Billing continua sem D1:

```text
Billing Env
≠ DB
```

Não adicionar binding só para uniformidade.

Clinical terá:

```text
DB
```

porque Assessment possui adapter D1.

---

# 9. Decisão crítica: HTTP Nest completo ou Nest application context?

Há duas opções.

### Opção A — implementar um HTTP adapter Cloudflare para Nest

Isso preservaria:

```text
@Controller
@UseGuards
Pipes
Interceptors
Filters
Middleware
```

como pipeline Nest real.

É arquiteturalmente a opção mais fiel ao projeto atual, mas tem custo de implementação alto porque Nest HTTP espera um `AbstractHttpAdapter` para a plataforma HTTP. A própria documentação do Nest deixa claro que HTTP é abstraído por adapters como Express/Fastify. ([NestJS Docs][5])

### Opção B — Worker roteia e Nest é apenas IoC/Application Context

```text
Worker fetch
    ↓
route
    ↓
Nest application context
    ↓
UseCases
```

Mais simples para Cloudflare, mas aí:

```text
Controllers
Guards
Pipes
Interceptors
Middleware
```

não são automaticamente executados, porque `createApplicationContext()` não oferece pipeline HTTP. ([NestJS Docs][3])

Como o projeto já investiu em controllers, guards, tenancy e observabilidade Nest, eu **não mudaria silenciosamente para a opção B**.

---

# 10. Gate arquitetural: escolher explicitamente

O PR deve inspecionar quanto dos endpoints atuais depende do pipeline Nest.

Pesquisar:

```bash
grep -R "@Controller" apps -n
grep -R "@UseGuards" apps -n
grep -R "ValidationPipe" apps libs -n
grep -R "Interceptor" apps libs -n
grep -R "Middleware" apps libs -n
```

Se os controllers existentes realmente dependem dessas camadas, a arquitetura deve preservar esse comportamento ou declarar uma migração explícita.

Não transformar controllers em código morto.

---

# 11. Recomendação: runtime adapter fino + bridge HTTP explícita

Eu trataria este PR como construção de:

```text
libs/cloudflare-runtime/
```

ou equivalente:

```text
CloudflareRuntimeAdapter
```

sem tocar no Domain.

Esse adapter é responsável por:

```text
Cloudflare Request
Cloudflare Env
ExecutionContext
Nest bootstrap/cache
HTTP dispatch
Response
```

---

# 12. Não colocar Cloudflare em Application/Domain

Architecture tests obrigatórios:

```text
domain → cloudflare:workers
FAIL

application → cloudflare:workers
FAIL

domain → D1Database
FAIL
```

Somente:

```text
worker entrypoints
runtime adapters
outbound adapters
```

podem conhecer bindings.

---

# 13. Bootstrap lazily

Não fazer bootstrap completo por módulo no global scope se isso usa APIs que exigem request context.

Cloudflare documenta que certas operações assíncronas devem acontecer dentro de handlers. ([Documentação do Desenvolvedor Cloudflare][6])

Preferir padrão:

```ts
let runtimePromise: Promise<Runtime> | undefined;

function getRuntime(env: Env) {
  return runtimePromise ??= bootstrapRuntime(env);
}
```

somente se o objeto bootstrap for realmente seguro para reuso entre invocações.

---

# 14. Cuidado com `env` capturado globalmente

Nunca:

```ts
let globalEnv: Env;
```

e sobrescrever por request.

Bindings devem ser associados à invocação ou a adapters imutáveis apropriadamente.

Especialmente porque Worker isolates podem reutilizar módulo entre requests.

---

# 15. Bindings como capabilities

Cloudflare trata bindings como capabilities disponibilizadas pelo runtime. ([Documentação do Desenvolvedor Cloudflare][7])

Portanto devemos converter:

```text
env.DB
```

em provider/adaptor da infraestrutura, não passá-lo arbitrariamente pelo domínio.

---

# 16. Criar runtime provider/factory

Por exemplo:

```text
CloudflareBindingsContext
```

mas sem singleton mutável por request.

Ele pode ser usado durante criação de request scope ou para construir adapters.

---

# 17. Request scope precisa ser revisto

Se Authentication/Tenancy usam estado request-local, verificar se dependem de:

```text
Express Request
```

ou APIs Node.

O Cloudflare runtime oferece:

```text
Request
Headers
URL
```

Web APIs.

Precisamos remover qualquer dependência exclusiva de Express/Node da camada compartilhada.

---

# 18. Inspecionar imports Node incompatíveis

Executar:

```bash
grep -R "from 'http'" apps libs -n
grep -R "from 'https'" apps libs -n
grep -R "from 'net'" apps libs -n
grep -R "from 'fs'" apps libs -n
grep -R "from 'path'" apps libs -n
grep -R "express" apps libs -n
```

Classificar:

```text
runtime critical
build only
Node local entrypoint
test only
```

Cloudflare atualmente fornece várias APIs Node compatíveis, especialmente com compatibility dates recentes, mas nem toda API npm/Node é garantida e alguns recursos são polyfills que falham ao serem usados. ([Documentação do Desenvolvedor Cloudflare][8])

Não confiar em compatibilidade implícita.

---

# 19. Wrangler compatibility date

Definir uma `compatibility_date` explícita e única por política do projeto.

Não deixar cada Worker com data arbitrária.

Algo como:

```text
docs/architecture/cloudflare-runtime.md
```

deve registrar a data e flags adotadas.

---

# 20. Não usar compatibility flags para mascarar arquitetura

Se Nest/Express depende de Node server sockets:

```text
nodejs_compat
```

não transforma automaticamente o Worker em servidor Node.

Workers continuam executados via `fetch()` do Module Worker.

---

# 21. `worker.ts` mínimo do Operations

Conceitualmente:

```ts
export default {
  async fetch(request, env, ctx) {
    return handleOperationsRequest(request, env, ctx);
  },
};
```

Isso é exatamente o formato esperado pelo runtime Cloudflare. ([Documentação do Desenvolvedor Cloudflare][1])

---

# 22. `worker.ts` do Billing

Além de `fetch`, Billing pode futuramente exportar RPC.

Para o PR atual precisamos materializar Service Binding.

Cloudflare recomenda RPC para a maioria dos Service Bindings atuais. ([Documentação do Desenvolvedor Cloudflare][9])

Então eu consideraria:

```ts
export default class BillingWorker extends WorkerEntrypoint<Env> {
  async calculateCommercialTerms(input) {
    ...
  }

  async fetch(request) {
    ...
  }
}
```

ou uma combinação com named entrypoint.

---

# 23. Clinical RPC

Mesma ideia:

```text
Clinical Worker
    └── checkAssessmentEligibility(...)
```

via `WorkerEntrypoint`.

Assim não precisamos criar endpoint público do tipo:

```http
POST /internal/assessment-eligibility
```

---

# 24. Preferir RPC para contratos internos

Cloudflare permite chamadas:

```ts
await env.CLINICAL_SERVICE.checkAssessmentEligibility(...)
```

diretamente entre Workers via Service Binding. ([Documentação do Desenvolvedor Cloudflare][2])

Isso casa muito bem com:

```text
AssessmentEligibilityPort
CommercialTermsPort
```

já existentes.

---

# 25. Não fazer controller interno só para RPC

Para RPC:

```text
WorkerEntrypoint
    ↓
Application Service
```

é aceitável.

Não precisa passar pelo HTTP Controller.

Isso não enfraquece autorização se o próprio Application Service valida contexto e contract apropriados.

---

# 26. Preservar contexto de segurança

Cloudflare alerta que contexto do Access não é automaticamente propagado entre Service Bindings. ([Documentação do Desenvolvedor Cloudflare][9])

Portanto Operations deve propagar explicitamente o contexto necessário:

```text
tenantId
actorId
correlationId
```

em contratos internos.

Mas o downstream não deve aceitar PII ou JWT completo se não precisar.

---

# 27. Contratos RPC explícitos

Exemplo conceitual:

```ts
interface CheckAssessmentEligibilityRequest {
  tenantId: string;
  customerId: string;
  serviceId: string;
  correlationId: string;
}
```

Não envie:

```text
full customer
Authorization header
entire ExecutionContext
```

---

# 28. Billing RPC

Contrato equivalente:

```text
calculateCommercialTerms
```

com contexto comercial mínimo.

Não expor entidade `CommercialTerms` interna diretamente como RPC type se isso amarrar runtimes ao Domain.

Usar contracts de `libs/contracts`.

---

# 29. Wrangler `main`

Trocar de:

```text
dist/.../main.js
```

ou Node entrypoint

para:

```text
src/worker.ts
```

ou bundle Cloudflare específico.

Wrangler bundla TypeScript diretamente, então apontar para entrypoint Worker é natural.

---

# 30. Eliminar erro `iife`

O erro:

```text
Top-level await is not supported with iife
```

é sintoma do entrypoint/bundle inadequado.

O Worker bundle deve ser ES Module, não IIFE Node tradicional.

Após `main=src/worker.ts`, o dry-run bundlado deve produzir Module Worker válido.

---

# 31. Eliminar erro `Worker has no default export`

O novo `worker.ts` precisa garantir:

```ts
export default ...
```

que implemente `fetch` ou `WorkerEntrypoint`.

Esse é um gate explícito de Cloudflare. ([Documentação do Desenvolvedor Cloudflare][10])

---

# 32. Wrangler dry-run agora sem `--no-bundle`

Depois da mudança:

```bash
npx wrangler deploy \
  --dry-run \
  --config apps/operations-worker/wrangler.jsonc
```

deve passar **com bundling normal**.

O mesmo para:

```text
billing
clinical
```

`--no-bundle` deixa de contar como prova.

---

# 33. Vitest: corrigir config separadamente

O erro:

```text
Cannot resolve entry module vitest.config.mts
```

deve ser tratado como tooling issue independente do runtime.

Primeiro localizar:

```bash
find . -maxdepth 3 \
  \( -name "vitest.config.*" -o -name "vite.config.*" \) \
  -print
```

Depois verificar script:

```bash
cat package.json
```

---

# 34. Não manter `.mts` se não há necessidade real

Se o problema é especificamente Vite/Rolldown + Windows/Node 24 e a configuração não depende de semântica MTS específica, uma solução legítima pode ser normalizar para:

```text
vitest.config.ts
```

Mas isso só deve ser feito após confirmar que a configuração é compatível.

Não renomear cegamente.

---

# 35. Config Vitest mínima

A configuração deve importar:

```ts
import { defineConfig } from 'vitest/config';
```

e ser pequena.

Não misturar configuração de build Nest/Worker no arquivo de unit tests se não necessário.

---

# 36. Separar unit tests de Worker integration tests

Ideal:

```text
vitest.config.ts
```

para:

```text
domain
application
architecture
```

e:

```text
vitest.config.workers.ts
```

ou equivalente para runtime Cloudflare.

Cloudflare/Hono/ecossistema Workers recomenda `@cloudflare/vitest-pool-workers` para testes dentro do Workers runtime. ([Hono][11])

---

# 37. Adicionar Workers test pool se necessário

Avaliar:

```bash
npm install -D @cloudflare/vitest-pool-workers
```

se essa for a abordagem adequada à versão do Wrangler/Vitest instalada.

Não substituir os testes unitários normais por worker runtime tests.

São camadas diferentes.

---

# 38. Matriz de testes

Após PR:

```text
Unit/domain tests
    → Node Vitest

D1/repository tests
    → Workers pool/local D1

Service Binding tests
    → Workers runtime

Concurrency proof
    → Workers/D1 runtime
```

---

# 39. Primeiro teste runtime: Health

Operations:

```text
Request GET /health
        ↓
Cloudflare worker.ts
        ↓
Nest/runtime adapter
        ↓
Health
        ↓
200
```

A resposta esperada continua a mesma.

---

# 40. O teste precisa atravessar Module Worker

Não vale chamar:

```ts
new HealthController().health()
```

como prova de runtime.

Precisa invocar:

```text
fetch()
```

do Worker empacotado/runtime simulado.

---

# 41. Billing Health

Mesmo teste pelo:

```text
BillingWorker.fetch
```

---

# 42. Clinical Health

Idem.

---

# 43. Testar 404

Uma rota inexistente:

```http
GET /does-not-exist
```

deve retornar:

```text
404
```

Isso prova roteamento básico.

---

# 44. Testar middleware/guards do Nest

Este é o gate que decide se o runtime adapter realmente preserva Nest.

Escolher um endpoint protegido existente de Operations.

Testar:

```text
sem auth
→ 401
```

Depois:

```text
auth válida
tenant inválido
→ 403
```

Se o runtime Worker passa direto para Application Context e esses guards não rodam, o teste vai revelar.

Esse resultado precisa orientar a arquitetura.

---

# 45. Não aceitar pipeline parcial silencioso

Se:

```text
@Controller funciona
mas @UseGuards não
```

isso é FAIL.

O projeto depende de auth/tenancy.

Não declarar runtime qualificado.

---

# 46. Testar ValidationPipe

Enviar DTO inválido para endpoint existente.

Esperado:

```text
400/422
```

conforme error contract.

Se entrar no UseCase sem validação, adapter incompleto.

---

# 47. Testar interceptor/observability

Confirmar:

```text
requestId
correlationId
```

e error mapping no runtime Worker.

---

# 48. Caso full Nest HTTP adapter fique inviável

O PR deve parar e emitir uma decisão arquitetural explícita:

### Caminho 1

Construir custom Cloudflare `AbstractHttpAdapter`.

### Caminho 2

Mover HTTP edge routing para framework Worker-native, mantendo Nest somente como IoC/Application layer.

Mas o segundo caminho exige refatorar:

```text
Controllers
Guards
Pipes
Interceptors
```

para contracts/adapters equivalentes.

Isso seria um PR arquitetural próprio, não uma “correção rápida”.

---

# 49. Não introduzir Hono silenciosamente

Cloudflare documenta Hono como framework Worker-native e ele funciona muito bem nesse runtime. ([Documentação do Desenvolvedor Cloudflare][12])

Mas adicionar Hono agora significaria mudar a fronteira HTTP escolhida anteriormente.

Isso só deve ocorrer por ADR explícito.

Não fazer:

```text
Nest Controller
+
Hono
+
Express
```

simultaneamente sem uma estratégia.

---

# 50. Minha preferência para este projeto

Como o domínio/application já está bem isolado, eu adotaria esta regra:

```text
Nest
→ composition, DI, application services

Cloudflare
→ HTTP/RPC runtime adapter
```

**somente se** ficar comprovado que reproduzir todo pipeline HTTP Nest no Worker causa complexidade excessiva.

Mas isso seria uma mudança relevante porque os controllers/guards atuais precisariam migrar para inbound adapters Worker-compatible.

Portanto primeiro tente preservar os contracts atuais por meio de adapter explícito e provas.

---

# 51. Service Binding RPC Clinical

Depois que Clinical for Module Worker válido, implementar entrada RPC:

```text
checkAssessmentEligibility()
```

que delega ao:

```text
CheckAssessmentEligibility
```

Application Service existente.

---

# 52. Service Binding RPC Billing

Implementar:

```text
calculateCommercialTerms()
```

delegando ao application service do PR-10.

---

# 53. Operations adapters

Trocar o runtime fail-closed quando binding está configurado por adapters reais:

```text
ClinicalServiceBindingAssessmentAdapter
BillingServiceBindingCommercialTermsAdapter
```

Sem remover fallback fail-closed para ambiente sem binding.

---

# 54. Teste local multi-worker

Cloudflare permite rodar múltiplos Workers localmente usando múltiplos configs e também reporta service bindings conectados/não conectados. ([Documentação do Desenvolvedor Cloudflare][9])

Usar, quando estável:

```bash
npx wrangler dev \
  -c apps/operations-worker/wrangler.jsonc \
  -c apps/clinical-worker/wrangler.jsonc \
  -c apps/billing-worker/wrangler.jsonc
```

A documentação observa que multi-config local ainda pode ser experimental; se houver problema, rodar um terminal por Worker. ([Documentação do Desenvolvedor Cloudflare][9])

---

# 55. Prova binding Clinical

Com todos rodando:

```text
Operations
→ CLINICAL_SERVICE
→ checkAssessmentEligibility()
```

PASS.

---

# 56. Prova binding Billing

```text
Operations
→ BILLING_SERVICE
→ calculateCommercialTerms()
```

PASS de transporte.

Ainda pode retornar:

```text
BLOCKED
```

por policy comercial ausente.

Isso é esperado.

---

# 57. Correlation propagation

Testar:

```text
Operations correlationId=A
Clinical correlationId=A
Billing correlationId=A
```

Cada Worker pode ter request/invocation id próprio.

---

# 58. D1 binding real

Agora o Worker entrypoint precisa construir/resolver adapters com:

```text
env.DB
```

e o teste deve provar uma operação repository real.

Não apenas migration CLI.

---

# 59. Teste D1 Operations

Escolher query segura:

```text
find Tenant
```

ou outra fixture.

Worker runtime:

```text
fetch/RPC
→ Nest/Application
→ repository port
→ D1 adapter
→ env.DB
```

PASS.

---

# 60. Teste D1 Clinical

```text
check Assessment eligibility
→ repository
→ env.DB
```

PASS.

---

# 61. Reexecutar concurrency proof

Agora com runtime válido:

```text
ScheduleReservationPort
→ D1
```

e 50/100 tentativas concorrentes independentes.

Gate:

```text
0 double bookings
```

---

# 62. Não usar concorrência via HTTP se desnecessário

A prova pode chamar diretamente o application/runtime entrypoint através do Workers test pool.

O importante é atravessar:

```text
real D1 adapter
real Workers runtime
```

---

# 63. Reliability proof

Reexecutar:

```text
domain mutation
+
idempotency
+
audit
+
outbox
```

usando `env.DB`.

Confirmar semântica real do batch.

---

# 64. Caso `D1Database.batch()` não cumpra a semântica esperada

Não prosseguir para PR-12.

O PR deverá ajustar:

```text
UnitOfWork docs
TransactionContext
mutation strategy
```

antes de seguir.

---

# 65. Vitest unit tests existentes

Após correção da config:

```bash
npm run test
```

deve executar todos os testes dos PRs:

```text
PR-07 reliability
PR-08 scheduling
PR-09 eligibility
PR-10 commercial terms
PR-11 licensing/assessment
```

---

# 66. Não considerar compile como teste

`tsc` prova tipos.

Não prova:

```text
FSM behavior
overlap
idempotency
fail-closed
```

Por isso Vitest é gate real.

---

# 67. Wrangler dry-run bundlado

Obrigatório:

```bash
npx wrangler deploy \
  --dry-run \
  --config apps/operations-worker/wrangler.jsonc
```

Sem:

```text
--no-bundle
```

E repetir.

---

# 68. Esperado após correção

Não pode mais aparecer:

```text
Worker has no default export
```

nem:

```text
Top-level await ... iife
```

---

# 69. Bundle size

Registrar:

```text
Operations bundle
Billing bundle
Clinical bundle
```

Isso importa para Cloudflare Free e cold-start.

---

# 70. Avaliar dependências Node pesadas

Se o bundle de Nest for muito grande ou depender de polyfills incompatíveis, registrar.

Não remover Nest apenas por tamanho sem medir.

---

# 71. Free-tier CPU

Testar latência aproximada de cold/warm bootstrap local.

Nest pode ter bootstrap mais pesado do que frameworks edge-native.

Não precisa otimizar neste PR, mas documentar:

```text
bootstrap duration
first request
subsequent request
```

Isso ajudará a decidir se o design Nest no edge permanece sustentável.

---

# 72. Cache de runtime Nest

Se seguro, inicializar Nest uma vez por isolate:

```text
runtimePromise
```

para evitar bootstrap por request.

Mas testar isolamento de:

```text
tenant
actor
requestId
```

para garantir que nada request-specific fica no singleton.

---

# 73. Teste obrigatório de context leakage

Executar requests:

```text
Request A
tenant=A
actor=A
```

logo depois:

```text
Request B
tenant=B
actor=B
```

Confirmar:

```text
B não enxerga contexto A
```

Isso é crítico se o Nest context for reutilizado pelo isolate.

---

# 74. Teste concorrente de context isolation

Executar A e B simultaneamente.

Confirmar:

```text
requestId A != requestId B
tenant A não vaza para B
actor A não vaza para B
```

---

# 75. Isso vale mais que performance

Não introduzir cache global de contexto para economizar bootstrap.

Segurança de tenant vem primeiro.

---

# 76. Documentar o runtime

Criar:

```text
docs/architecture/cloudflare-runtime.md
```

Com:

```text
Module Worker entrypoint
Nest bootstrap model
request lifecycle
bindings
RPC
context propagation
runtime caching
limitations
```

---

# 77. Atualizar Workers topology

`workers.md` deve mostrar:

```text
Operations
  public fetch
  outgoing RPC:
    Clinical
    Billing

Clinical
  health fetch
  assessment RPC

Billing
  health fetch
  commercial terms RPC
```

---

# 78. Atualizar ADR de Service Bindings

Se ainda não existir, criar/atualizar:

```text
Service Binding
→ RPC default for internal APIs
```

A documentação atual da Cloudflare recomenda RPC para a maioria desses usos. ([Documentação do Desenvolvedor Cloudflare][9])

---

# 79. Architecture test de entrypoints

Provar:

```text
worker.ts
→ default export
```

e que:

```text
wrangler.main
→ worker.ts
```

para os três.

---

# 80. Não misturar deployment configs

Cada Worker mantém:

```text
name
main
bindings
compatibility_date
```

próprios.

---

# 81. Deployment order documentada

Service Binding exige que o target exista antes do caller em primeiro deploy. ([Documentação do Desenvolvedor Cloudflare][9])

Portanto documentar futuro deployment:

```text
1 Clinical
2 Billing
3 Operations
```

quando Operations referencia os dois.

Ainda sem executar deploy neste PR.

---

# 82. CommercialTerms continua blocker funcional

Mesmo que Binding Billing passe:

```text
Transport = PASS
```

a policy pode continuar:

```text
BLOCKED
```

O relatório deve distinguir claramente esses estados.

---

# 83. Matriz final

Ao final:

| Capability               |       Logical |          Runtime |
| ------------------------ | ------------: | ---------------: |
| Operations Worker        |          PASS |             PASS |
| Clinical Worker          |          PASS |             PASS |
| Billing Worker           |          PASS |             PASS |
| D1                       |          PASS |             PASS |
| Service Binding Clinical |          PASS |             PASS |
| Service Binding Billing  |          PASS |             PASS |
| Scheduling concurrency   |   PASS lógico |      PASS físico |
| Reliability              |   PASS lógico |      PASS físico |
| Vitest                   | tests written |             PASS |
| Commercial Terms         |   implemented | READY ou BLOCKED |

---

# 84. Definition of Done — entrypoints

```text
[ ] operations worker.ts criado
[ ] billing worker.ts criado
[ ] clinical worker.ts criado

[ ] todos são ES Module Workers

[ ] todos possuem default export

[ ] nenhum app.listen() é entrypoint Cloudflare

[ ] wrangler.main aponta para Worker entrypoint

[ ] bundling normal PASS
```

---

# 85. Definition of Done — Nest/runtime

```text
[ ] Nest bootstrap strategy documentada

[ ] HTTP pipeline behavior comprovado

[ ] Guards comprovados no runtime
[ ] Validation comprovada
[ ] Error mapping comprovado
[ ] Observability comprovada

[ ] nenhum request state global mutável

[ ] concurrent context isolation PASS
```

Se o pipeline Nest não puder ser preservado:

```text
PR FAIL / architecture decision required
```

não “degradar” silenciosamente.

---

# 86. Definition of Done — Vitest

```text
[ ] vitest config resolve no Windows

[ ] Node 24 supported/configured

[ ] npm run test realmente executa

[ ] reliability tests PASS
[ ] scheduling tests PASS
[ ] eligibility tests PASS
[ ] billing tests PASS
[ ] clinical tests PASS
```

---

# 87. Definition of Done — Workers tests

```text
[ ] Workers runtime test infra criada

[ ] Operations fetch /health PASS
[ ] Billing fetch /health PASS
[ ] Clinical fetch /health PASS

[ ] unknown route 404

[ ] protected endpoint auth behavior PASS

[ ] D1 binding Operations PASS
[ ] D1 binding Clinical PASS
```

---

# 88. Definition of Done — RPC

```text
[ ] Clinical RPC exposed

[ ] Billing RPC exposed

[ ] Operations Clinical adapter real

[ ] Operations Billing adapter real

[ ] binding local connected

[ ] Assessment call PASS

[ ] CommercialTerms call PASS transport-wise

[ ] unavailable binding remains fail-closed

[ ] correlation propagated
```

---

# 89. Definition of Done — physical proofs

```text
[ ] scheduling concurrent proof PASS

[ ] zero double booking

[ ] reliability success proof PASS

[ ] reliability failure proof PASS

[ ] idempotency replay PASS

[ ] idempotency conflict PASS
```

---

# 90. Definition of Done — quality

```text
[ ] npm run lint PASS

[ ] npx tsc --build PASS

[ ] npm run test PASS

[ ] Worker runtime tests PASS

[ ] migrations PASS

[ ] wrangler types PASS

[ ] normal bundling dry-run PASS Operations

[ ] normal bundling dry-run PASS Billing

[ ] normal bundling dry-run PASS Clinical

[ ] health smoke PASS

[ ] git diff --check PASS
```

---

# 91. O que não deve aparecer

Ainda não:

```text
POST /appointments

Payment
Session
R2
KV
Queue
Cron

new discount %
new deposit %

Hono migration without ADR
Express server running inside Worker
mutex process-local
```

---

# 92. Relatório pós-PR

O Codex deve fechar com:

```text
PR-11.2 — Cloudflare Module Worker Runtime Adapter

Entrypoints
Operations:
Billing:
Clinical:

Nest bootstrap strategy:
HTTP pipeline preserved: YES/NO

Vitest:
Oxlint:
TypeScript:

Wrangler bundling:
Operations PASS/FAIL
Billing PASS/FAIL
Clinical PASS/FAIL

D1 runtime:
Operations:
Clinical:

Bindings:
Operations → Clinical
Operations → Billing

Context isolation:
sequential:
concurrent:

Scheduling physical proof:
iterations:
double bookings:

Reliability physical proof:
success:
rollback/failure:
replay:
conflict:

CommercialTerms:
transport:
business status READY/BLOCKED

Bundle sizes:

Remaining blockers:

Next PR:
```

---

# Próximo PR depois deste

Existem novamente dois caminhos.

Se:

```text
Module Worker runtime             PASS
Vitest                            PASS
D1 runtime                        PASS
Scheduling physical proof         PASS
Reliability physical proof        PASS
Clinical RPC                      PASS
Billing RPC                       PASS
CommercialTerms can become READY  PASS
```

então finalmente:

> **PR-12 — CreateAppointment Authoritative Flow**

Se tudo passar, exceto:

```text
CommercialTerms = always BLOCKED
```

então o próximo deve ser:

> **PR-11.3 — Commercial Policy Materialization**

e só depois PR-12.

A mudança principal é esta: **o próximo PR agora deve transformar o backend Nest compilável em Workers Cloudflare reais**. O erro de `default export` não é um detalhe de build; ele demonstra que a fronteira de runtime ainda não foi implementada. Cloudflare exige Module Worker entrypoints, enquanto Nest standalone por si só não preserva o pipeline HTTP. ([Documentação do Desenvolvedor Cloudflare][1]) Portanto esse PR precisa resolver essa fronteira explicitamente antes de qualquer novo endpoint de negócio.

[1]: https://developers.cloudflare.com/workers/reference/how-workers-works/?utm_source=chatgpt.com "How Workers works · Cloudflare Workers docs"
[2]: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/?utm_source=chatgpt.com "Service bindings - RPC (WorkerEntrypoint) · Cloudflare Workers docs"
[3]: https://docs.nestjs.com/application-context?utm_source=chatgpt.com "Standalone applications | NestJS - A progressive Node.js framework"
[4]: https://www.npmjs.com/package/%40cloudflare/workers-types?utm_source=chatgpt.com "@cloudflare/workers-types - npm"
[5]: https://docs.nestjs.com/faq/http-adapter?utm_source=chatgpt.com "HTTP adapter - FAQ | NestJS - A progressive Node.js framework"
[6]: https://developers.cloudflare.com/workers/runtime-apis/fetch/?utm_source=chatgpt.com "Fetch · Cloudflare Workers docs"
[7]: https://developers.cloudflare.com/workers/runtime-apis/bindings/?utm_source=chatgpt.com "Bindings (env) · Cloudflare Workers docs"
[8]: https://developers.cloudflare.com/workers/runtime-apis/nodejs/?utm_source=chatgpt.com "Node.js compatibility · Cloudflare Workers docs"
[9]: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/?utm_source=chatgpt.com "Service bindings - Runtime APIs · Cloudflare Workers docs"
[10]: https://developers.cloudflare.com/workers/get-started/guide/?utm_source=chatgpt.com "Get started - CLI · Cloudflare Workers docs"
[11]: https://hono.dev/docs/getting-started/cloudflare-workers?utm_source=chatgpt.com "Cloudflare Workers - Hono"
[12]: https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/?utm_source=chatgpt.com "Hono · Cloudflare Workers docs"
