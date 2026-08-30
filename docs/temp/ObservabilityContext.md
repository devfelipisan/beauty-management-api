O **PR-02 — Observabilidade + Execution Context** deve ser implementado imediatamente após o PR-01 porque, antes de introduzir `Tenant`, `Customer`, `Appointment`, D1 ou autenticação, precisamos garantir que **toda requisição e futura operação possa ser rastreada de ponta a ponta**.

Isso não é apenas conveniência operacional: os requisitos não funcionais já exigem logs, rastreamento de erros, métricas, identificação de requisições e monitoramento, além de proibir exposição de senhas, tokens, documentos completos e informações clínicas desnecessárias nos logs.  A proposta técnica também define como contexto observável `request_id`, `correlation_id`, `tenant_id`, `actor_id`, operação, rota, status e duração, e proíbe payload integral, token, senha, ficha técnica, alergia, medicamento, fotos, comprovantes e URLs assinadas na telemetria. 

# PR-02 — Observabilidade + Execution Context

O objetivo arquitetural é sair de:

```text
HTTP
 ↓
Controller
 ↓
Response
```

para:

```text
HTTP
 ↓
Request ID
 ↓
Correlation ID
 ↓
Trace
 ↓
Execution Context
 ↓
Controller
 ↓
future UseCase
 ↓
structured telemetry
 ↓
Response
```

Sem ainda introduzir domínio funcional.

Ao final:

```text
BFF Worker
Operations Worker
Clinical Worker
Billing Worker
Async Worker
       │
       └──── todos observáveis
```

---

# 1. Escopo exato

O PR deverá entregar:

```text
@nestjs/observe
+
ObservabilityModule
+
ExecutionContext
+
RequestId
+
CorrelationId
+
Trace correlation
+
PII sanitizer
+
Worker identity
+
structured telemetry
+
tests
```

Não implementar neste PR:

```text
TenantGuard
AuthenticationGuard
PermissionGuard

D1
KV
R2

Customer
Appointment
Deposit
Session
Payment

Audit
Outbox
Idempotency

Queue/Cron
```

Esses elementos podem usar o contexto criado agora posteriormente.

---

# 2. Relação com a arquitetura

A observabilidade pertence à infraestrutura/cross-cutting concern.

Portanto:

```text
Domain
   X
Observability SDK
```

e:

```text
Application
   X
@nestjs/observe
```

O desenho correto:

```text
Nest / Worker
      ↓
Observability Infrastructure
      ↓
ExecutionContext
      ↓
Application input futuramente
```

A proposta técnica mantém explicitamente `/observability` como pacote de logs, traces e métricas e exige a regra de dependência `interface → application → domain`, mantendo detalhes externos fora do domínio. 

---

# 3. Estado esperado antes do PR

Depois do PR-00 e PR-01, devemos encontrar aproximadamente:

```text
apps/
├── bff-worker/
├── operations-worker/
├── clinical-worker/
├── billing-worker/
└── async-worker/

libs/
├── kernel/
├── contracts/
├── config/
└── testing/
```

e cada Worker:

```text
AppModule
  └── HealthModule
```

com:

```http
GET /health
```

---

# 4. Primeiro passo: inventário

Antes de qualquer alteração:

```bash
pwd

git status

git branch --show-current

git log -10 --oneline
```

Depois:

```bash
find apps -maxdepth 5 -type f | sort
find libs -maxdepth 5 -type f | sort
```

Verificar Nest:

```bash
cat package.json
cat nest-cli.json
cat tsconfig.json
```

Verificar observabilidade existente:

```bash
npm ls @nestjs/observe
```

Pesquisar código já existente:

```bash
grep -R "ObserveModule" apps libs src 2>/dev/null || true
grep -R "createObserveModule" apps libs src 2>/dev/null || true
grep -R "correlationId" apps libs src 2>/dev/null || true
grep -R "requestId" apps libs src 2>/dev/null || true
```

Não duplicar implementação preexistente.

---

# 5. Criar duas responsabilidades separadas

Eu não colocaria `ExecutionContext` dentro de `observability`.

Criaria:

```text
libs/
├── execution-context/
└── observability/
```

Porque:

```text
ExecutionContext
```

é um conceito da execução da aplicação.

Enquanto:

```text
Observe
Tracing
Telemetry
```

são infraestrutura.

Assim futuramente poderemos trocar `@nestjs/observe` sem reescrever o contexto da aplicação.

---

# 6. Criar `execution-context`

Usar Nest CLI:

```bash
nest g library execution-context
```

Depois:

```bash
nest g interface execution-context --project execution-context
```

Se a CLI gerar o arquivo em localização inadequada, mover/refatorar somente depois de inspecioná-lo.

Estrutura pretendida:

```text
libs/execution-context/src/
├── execution-context.ts
├── execution-source.ts
├── execution-context.factory.ts
└── index.ts
```

---

# 7. Contrato do ExecutionContext

Eu definiria:

```ts
export interface ExecutionContext {
  requestId: string;

  correlationId: string;

  traceId?: string;

  source:
    | 'web'
    | 'bff'
    | 'worker'
    | 'job';

  service: string;

  operation?: string;

  tenantId?: string;

  actorId?: string;
}
```

Importante:

```text
tenantId
actorId
```

já existem no contrato porque serão necessários.

Mas **não são resolvidos neste PR**.

Isso será PR-03.

---

# 8. Não confiar em `tenantId` vindo de header

Ainda não implementar algo como:

```ts
tenantId = request.headers['x-tenant-id'];
```

como identidade confiável.

Isso seria errado.

O sistema é multiempresa e o tenant confiável precisa ser determinado pela Business API/autorização, não por informação arbitrária enviada pelo navegador. O isolamento entre empresas é uma invariância obrigatória do produto. 

Neste PR:

```text
tenantId = undefined
actorId = undefined
```

até que a camada de identidade resolva esses dados.

---

# 9. Source do contexto

Para HTTP recebido pelo BFF:

```text
source = web
```

ou conceitualmente:

```text
source = bff
```

para chamadas internas.

Uma nomenclatura consistente pode ser:

```ts
export type ExecutionSource =
  | 'web'
  | 'bff'
  | 'worker'
  | 'job';
```

Não criar dezenas de tipos agora.

---

# 10. Criar `ExecutionContextFactory`

Utilizar CLI:

```bash
nest g class execution-context.factory --project execution-context --no-spec
```

Responsabilidade:

```text
dados técnicos
      ↓
ExecutionContext
```

Exemplo conceitual:

```ts
export class ExecutionContextFactory {
  create(input: {
    requestId: string;
    correlationId: string;
    traceId?: string;
    source: ExecutionSource;
    service: string;
    operation?: string;
  }): ExecutionContext {
    return {
      ...input,
    };
  }
}
```

Ainda sem autenticação.

---

# 11. Não usar AsyncLocalStorage imediatamente

Eu não introduziria neste PR:

```text
AsyncLocalStorage
```

como requisito arquitetural obrigatório.

Também não começaria com:

```text
REQUEST scoped provider
```

para todos os services.

Em Workers isso pode adicionar complexidade e custo desnecessários.

A solução inicialmente mais limpa é:

```text
Inbound Adapter
      ↓
ExecutionContext
      ↓
UseCase.execute(context, ...)
```

quando os UseCases começarem a existir.

Isso também deixa Application independente do Nest.

---

# 12. Criar library de observabilidade

Executar:

```bash
nest g library observability
```

Depois:

```bash
nest g module observability --project observability
```

E quando houver responsabilidade real:

```bash
nest g service observability --project observability
```

Estrutura:

```text
libs/observability/src/
├── observability.module.ts
├── observability.service.ts
│
├── middleware/
│   ├── request-id.middleware.ts
│   └── correlation-id.middleware.ts
│
├── interceptors/
│   └── http-observability.interceptor.ts
│
├── sanitization/
│   └── telemetry-sanitizer.ts
│
└── index.ts
```

---

# 13. Instalar Observe

Se ainda não existir:

```bash
npm i @nestjs/observe
```

Depois:

```bash
npm ls @nestjs/observe
```

Confirmar versão instalada.

Não implementar configuração usando propriedades encontradas em exemplos antigos sem verificar se existem na versão instalada.

---

# 14. Regra de configuração do Observe

Seguir a decisão já estabelecida:

```ts
createObserveModule({
  ...
})
```

deve controlar principalmente:

```text
Trace ID generation
Error source context
```

Enquanto:

```ts
ObserveModule.forRoot({
  ...
})
```

deve concentrar as demais configurações suportadas pelo SDK.

Não misturar essas responsabilidades.

---

# 15. Criar factory/config do Observe

Pode ser gerada como provider:

```bash
nest g provider observe-options --project observability
```

ou classe:

```bash
nest g class observe-options.factory --project observability --no-spec
```

Preferência:

```text
config
  ↓
Observe configuration
```

e não:

```text
process.env
```

espalhado pelos Workers.

---

# 16. Configuração das credenciais

Definir explicitamente:

```text
OBSERVE_ENABLED
OBSERVE_APP_KEY
OBSERVE_APP_SECRET
```

e, se necessário:

```text
OBSERVE_TRACE_SAMPLE_RATE
```

Não espalhar:

```ts
process.env.OBSERVE_APP_SECRET
```

pela aplicação.

A library `config` do PR-01 deve ser o ponto de leitura/validação.

---

# 17. Comportamento local

Eu adotaria:

```text
local/test
OBSERVE_ENABLED=false
```

por padrão.

Assim desenvolvimento local não depende de credenciais externas.

Se:

```text
OBSERVE_ENABLED=true
```

então:

```text
OBSERVE_APP_KEY
OBSERVE_APP_SECRET
```

devem ser obrigatórios.

Não fazer fallback silencioso com credenciais vazias.

---

# 18. Configuração fail-fast

Se observabilidade remota estiver explicitamente habilitada:

```text
OBSERVE_ENABLED=true
```

e faltar:

```text
APP_KEY
APP_SECRET
```

o bootstrap deve falhar claramente.

Não deixar a aplicação iniciar e descobrir depois que as credenciais estão inválidas.

Isso é melhor que:

```text
start
 ↓
telemetry 401
 ↓
spam/retries
```

---

# 19. Service identity

Cada Worker deve possuir identidade própria:

```text
beauty-bff-worker

beauty-operations-worker

beauty-clinical-worker

beauty-billing-worker

beauty-async-worker
```

Isso deve vir da configuração do Worker, não de strings espalhadas.

Exemplo conceitual:

```text
SERVICE_NAME
SERVICE_VERSION
```

O PR-01 já deveria ter preparado essa identidade.

---

# 20. Versão

Usar:

```text
APP_VERSION
```

ou equivalente existente.

Fallback local:

```text
development
```

Em CI:

```text
commit SHA
```

Exemplo:

```text
serviceVersion = git SHA
```

Isso permitirá correlacionar:

```text
erro
→ Worker
→ versão
→ commit
```

---

# 21. Request ID Middleware

Gerar via CLI:

```bash
nest g middleware middleware/request-id --project observability
```

O middleware deve:

```text
request
 ↓
x-request-id existe e é válido?
 ├─ sim → reutilizar
 └─ não → crypto.randomUUID()
```

Depois:

```text
request.requestId
```

ou objeto equivalente de contexto técnico.

E retornar:

```http
x-request-id: <id>
```

na resposta.

---

# 22. Validar request ID

Não aceitar qualquer string ilimitada enviada externamente.

Uma política simples:

```text
máximo 128 chars
charset limitado
```

ou gerar novo UUID se inválido.

Exemplo:

```ts
const SAFE_ID =
  /^[A-Za-z0-9._:-]{1,128}$/;
```

Não usar diretamente uma string de vários megabytes enviada pelo cliente como identificador de log.

---

# 23. Correlation ID Middleware

Criar:

```bash
nest g middleware middleware/correlation-id --project observability
```

Fluxo:

```text
x-correlation-id válido?
     │
     ├─ sim → preservar
     │
     └─ não → requestId
```

Uma estratégia simples:

```text
correlationId =
    inboundCorrelationId
    ?? requestId
```

Assim uma requisição isolada começa com:

```text
requestId == correlationId
```

---

# 24. Diferença entre IDs

Formalizar:

```text
requestId
=
uma requisição específica
```

```text
correlationId
=
cadeia completa de operações
```

Por exemplo:

```text
Browser
   │
   │ correlation=A
   ▼
BFF request
requestId=B
   │
   │ correlation=A
   ▼
Operations
requestId=C
correlation=A
   │
   ▼
Billing
requestId=D
correlation=A
```

Esse desenho é particularmente importante agora que os Workers serão separados.

---

# 25. Propagação BFF → Worker

O BFF deve propagar:

```http
x-correlation-id
```

para Services internos.

Pode gerar um novo:

```text
requestId
```

para a chamada downstream.

Não reutilizar obrigatoriamente o mesmo Request ID em toda a cadeia.

O que conecta tudo é:

```text
correlationId
```

---

# 26. Trace ID

Trace deve preferencialmente ser responsabilidade do SDK Observe.

O `ExecutionContext` pode receber:

```text
traceId
```

quando disponível.

Não criar manualmente um pseudo-trace distribuído separado se o SDK já resolver isso.

---

# 27. `createObserveModule()`

Criar uma instância compartilhada em `libs/observability`.

Conceitualmente:

```ts
export const {
  ObserveModule,
  ObserveInstrument,
} = createObserveModule({
  // trace id configuration
  // error source context
});
```

Não duplicar:

```text
createObserveModule()
```

cinco vezes.

---

# 28. Source context

Configurar error source context de forma controlada.

Em produção, evitar configurações que:

```text
capturem arquivos enormes
capturem código excessivo
aumentem CPU desnecessariamente
```

A configuração deve ser suficiente para diagnosticar exceções sem transformar Workers Free em processadores de stack trace.

---

# 29. ObserveModule.forRoot

Cada Worker importa o mesmo ObserveModule, mas fornece identidade própria.

Conceitualmente:

```text
ObserveModule.forRoot(
  config(serviceName)
)
```

Não duplicar configuração inteira em cinco AppModules.

---

# 30. ObservabilityModule global ou explícito?

Eu evitaria tornar tudo global automaticamente.

Prefiro:

```text
AppModule
  ↓
ObservabilityModule
```

explicitamente em cada Worker.

Isso deixa a composição evidente.

---

# 31. Integrar no BFF Worker

`AppModule` passa a conter:

```text
Config
Observability
Health
```

Conceitualmente:

```ts
@Module({
  imports: [
    ConfigModule,
    ObservabilityModule,
    HealthModule,
  ],
})
export class AppModule {}
```

O mesmo vale para os demais.

---

# 32. Integrar nos cinco Workers

Aplicar a:

```text
bff-worker
operations-worker
clinical-worker
billing-worker
async-worker
```

Cada um com:

```text
service identity diferente
```

mas implementação compartilhada.

---

# 33. Middleware em todos os HTTP Workers

Registrar:

```text
RequestIdMiddleware
CorrelationIdMiddleware
```

para HTTP.

Fluxo:

```text
Request
 ↓
RequestIdMiddleware
 ↓
CorrelationIdMiddleware
 ↓
Observe
 ↓
Controller
```

---

# 34. Async Worker

O `async-worker` futuramente receberá:

```text
cron
queue
outbox events
```

Por isso `ExecutionContext` já suporta:

```text
source = job
```

Mas **não implementar cron/queue neste PR**.

Quando esses eventos chegarem posteriormente:

```text
jobId
eventId
correlationId
```

poderão originar o contexto.

---

# 35. Interceptor de observabilidade

Gerar:

```bash
nest g interceptor interceptors/http-observability --project observability
```

Responsabilidade permitida:

```text
route
method
status
duration
requestId
correlationId
service
```

Não incluir:

```text
body
JWT
cookies
full query
clinical payload
```

---

# 36. Medir duração

No início:

```ts
const start = performance.now();
```

Depois:

```text
durationMs =
performance.now() - start
```

Se o próprio Observe já fornecer latência HTTP automaticamente, não produzir métrica duplicada.

O interceptor deve ser usado para **enriquecimento que o SDK não forneça**, não para replicar o SDK.

---

# 37. Operação

Enquanto ainda só existe Health:

```text
operation = HealthCheck
```

No futuro:

```text
CreateAppointment
ConfirmDeposit
CompleteSession
```

A proposta técnica prevê exatamente esse tipo de operação como atributo de observabilidade. 

---

# 38. Não usar URL completa como operation

Evitar:

```text
operation =
POST /customers/19e87f...
```

Preferir:

```text
CreateCustomer
```

ou rota parametrizada:

```text
POST /customers/:id
```

Isso reduz cardinalidade.

---

# 39. Telemetry sanitizer

Criar:

```bash
nest g class sanitization/telemetry-sanitizer --project observability --no-spec
```

Responsabilidade:

```text
metadata
 ↓
redaction
 ↓
safe metadata
```

---

# 40. Campos proibidos

No mínimo:

```text
password
passwd
secret

authorization
cookie
set-cookie

token
accessToken
refreshToken

cpf
document

email
phone

medical
allergy
medication

technicalRecord
technicalNotes

photo
file

proof
receipt

signedUrl
presignedUrl
```

A especificação determina explicitamente logs seguros e proíbe senhas, tokens, dados sensíveis completos, documentos completos e informações clínicas desnecessárias. 

---

# 41. Não serializar request body

Uma regra forte:

```text
HTTP body
   X
logs
```

Não fazer:

```ts
logger.info({
  body: request.body,
});
```

Mesmo se existir sanitizer.

Melhor não coletar do que coletar e tentar limpar depois.

---

# 42. Headers permitidos

Não enviar todos os headers.

Pode registrar alguns elementos técnicos controlados:

```text
method
route
content-length
user-agent opcional/truncado
requestId
correlationId
```

Nunca:

```text
Authorization
Cookie
Set-Cookie
```

---

# 43. Actor ID

Futuramente pode existir:

```text
actorId
```

Mas deve ser:

```text
identificador interno opaco
```

Não:

```text
nome
email
CPF
telefone
```

---

# 44. Tenant ID

`tenantId` pode aparecer como identificador técnico porque será importante para detectar:

```text
noisy neighbor
```

e problemas isolados por empresa.

A proposta técnica inclui consumo por tenant como indicador de observabilidade. 

Mas neste PR ele continua:

```text
undefined
```

até o PR-03 resolver tenancy.

---

# 45. Logs estruturados

Formato conceitual futuro:

```json
{
  "event": "http.request.completed",
  "service": "beauty-operations-worker",
  "version": "abc123",
  "requestId": "...",
  "correlationId": "...",
  "traceId": "...",
  "operation": "HealthCheck",
  "route": "GET /health",
  "status": 200,
  "durationMs": 3
}
```

Evitar texto:

```text
deu ruim na chamada do usuário
```

---

# 46. Convenção de nomes de eventos

Definir catálogo simples:

```text
http.request.started
http.request.completed
http.request.failed

worker.job.started
worker.job.completed
worker.job.failed
```

Não inventar centenas de eventos.

---

# 47. Erros

Quando ocorrer erro:

```json
{
  "event": "http.request.failed",
  "errorCode": "INTERNAL_ERROR",
  "requestId": "...",
  "correlationId": "..."
}
```

Não registrar automaticamente:

```text
payload completo
```

---

# 48. Error source context

O Observe pode capturar source context segundo a configuração de `createObserveModule()`.

Mas isso não significa enviar:

```text
request body
tokens
business snapshots
```

Source code context e business/request context são preocupações diferentes.

---

# 49. Health

O `/health` deve continuar:

```text
sem banco
sem auth
sem tenant
sem audit
sem outbox
```

Como definido no PR-00.

---

# 50. Health deve gerar trace?

Idealmente não em produção.

Configurar, quando suportado pela versão utilizada:

```text
/health
→ ignored / unsampled
```

porque probes recorrentes criariam ruído.

---

# 51. Mas middleware continua funcionando

Mesmo que Observe ignore `/health`, ainda podemos devolver:

```http
x-request-id
x-correlation-id
```

Isso é útil para consistência da superfície HTTP.

---

# 52. Sampling

Para permanecer eficiente no Free Tier, eu não começaria produção com:

```text
100% traces
```

Meta inicial razoável:

```text
production
5–10%
```

e erros:

```text
100% quando suportado
```

Mas isso deve ser controlado por configuração:

```text
OBSERVE_TRACE_SAMPLE_RATE
```

e não hardcoded.

---

# 53. Cloudflare Free

A documentação original já destaca o orçamento apertado de CPU dos Workers Free e recomenda manter a API orientada a I/O e evitar processamento pesado por request. 

Portanto observabilidade deve ser:

```text
structured
bounded
sampled
non-blocking quando possível
```

e nunca:

```text
serialização gigante
stack processing excessivo
PII scanning do payload inteiro
```

---

# 54. Métricas iniciais

Neste PR, no máximo:

```text
request count
HTTP error count
duration
status
service
operation
```

Não implementar ainda:

```text
db_duration
lock wait
D1 reads
D1 writes
outbox backlog
```

porque essas infraestruturas ainda não existem.

---

# 55. Métricas futuras já previstas

A arquitetura já prevê posteriormente indicadores de:

```text
API
Banco
Agenda
Idempotência
Outbox
Arquivos
Auth
Tenant
Negócio
Continuidade
```

incluindo latência, erros, conflitos, retries e consumo por empresa. 

Mas não implementar antecipadamente.

---

# 56. Request context no Controller

Para os Controllers futuros, deve ser possível obter:

```text
ExecutionContext
```

sem duplicar:

```text
header parsing
UUID generation
service identity
```

em cada Controller.

Pode ser criado posteriormente um decorator:

```bash
nest g decorator current-execution-context --project execution-context
```

Porém eu somente o implementaria agora se realmente houver uma forma clara e estável de armazenar o contexto no request.

Caso contrário, adiar para o primeiro UseCase HTTP.

---

# 57. Não transformar ExecutionContext em singleton mutável

Proibido:

```ts
let currentTenant;
let currentRequestId;
```

em módulo global.

Workers podem processar múltiplas execuções concorrentes.

Contexto nunca deve ficar em variável global mutável.

---

# 58. Não usar Service singleton para estado da request

Também não:

```ts
@Injectable()
export class ContextService {
  currentRequestId: string;
}
```

como singleton.

Isso cria risco de mistura entre requests.

---

# 59. Estratégia inicial recomendada

Neste PR:

```text
Request
 ↓
middleware resolve IDs
 ↓
request-local metadata
 ↓
interceptor lê
 ↓
telemetry
```

E no futuro:

```text
Controller
 ↓
ExecutionContextFactory
 ↓
UseCase input
```

Sem global mutable state.

---

# 60. Propagação downstream

Criar helper somente se já houver comunicação Worker → Worker.

Por exemplo:

```text
buildPropagationHeaders(context)
```

retorna:

```http
x-correlation-id
x-request-id
```

Mas cuidado:

para chamada downstream, eu prefiro novo:

```text
requestId
```

e manutenção do:

```text
correlationId
```

Se ainda não há Service Bindings implementados, não criar client apenas para este PR.

---

# 61. Architecture tests

Atualizar testes do PR-01 para impedir:

```text
domain imports @nestjs/observe
application imports @nestjs/observe
domain imports observability infrastructure
```

Exemplo:

```text
Domain
  X
@nestjs/observe
```

e:

```text
Application
  X
ObserveModule
```

---

# 62. Testes do RequestIdMiddleware

Cobrir:

```text
sem x-request-id
→ UUID gerado
```

```text
x-request-id válido
→ preservado
```

```text
x-request-id inválido
→ novo ID
```

```text
response
→ x-request-id presente
```

---

# 63. Testes do correlation ID

Cobrir:

```text
sem correlation
→ correlation = requestId
```

```text
correlation válida
→ preservada
```

```text
correlation inválida
→ substituída
```

---

# 64. Testes do sanitizer

Testar:

```ts
{
  password: 'secret',
  token: 'abc',
  customerId: 'c-1'
}
```

Resultado:

```ts
{
  password: '[REDACTED]',
  token: '[REDACTED]',
  customerId: 'c-1'
}
```

Mas, novamente, o ideal é nunca fornecer password/token ao logger.

---

# 65. Teste de metadata segura

Criar um teste que garanta que o logging HTTP não inclui:

```text
Authorization
Cookie
request.body
```

---

# 66. Teste por Worker

Cada Worker deve provar que:

```http
GET /health
```

continua retornando:

```text
200
```

e:

```http
x-request-id
x-correlation-id
```

quando a stack HTTP utilizada permitir isso.

---

# 67. Credenciais em testes

Testes não devem depender do servidor Observe.

Portanto:

```text
OBSERVE_ENABLED=false
```

em testes.

Não realizar chamadas externas durante unit tests.

---

# 68. Observability failure não deve quebrar regra de negócio

Uma preocupação futura:

```text
telemetry unavailable
```

não deve causar:

```text
CompleteSession rollback
```

ou:

```text
RegisterPayment failure
```

por si só.

Observabilidade técnica não faz parte da transação de negócio.

---

# 69. Mas configuração inválida deve ser detectada no bootstrap

Diferente de:

```text
serviço remoto temporariamente indisponível
```

uma configuração explicitamente habilitada e inválida deve ser detectada cedo.

Exemplo:

```text
OBSERVE_ENABLED=true
APP_KEY ausente
```

→ falha de configuração.

---

# 70. Arquivos esperados

Algo próximo de:

```text
libs/
├── execution-context/
│   └── src/
│       ├── execution-context.ts
│       ├── execution-source.ts
│       ├── execution-context.factory.ts
│       └── index.ts
│
└── observability/
    └── src/
        ├── observability.module.ts
        ├── observability.service.ts
        ├── observe-options.factory.ts
        │
        ├── middleware/
        │   ├── request-id.middleware.ts
        │   └── correlation-id.middleware.ts
        │
        ├── interceptors/
        │   └── http-observability.interceptor.ts
        │
        ├── sanitization/
        │   └── telemetry-sanitizer.ts
        │
        └── index.ts
```

Não é necessário forçar exatamente esses nomes se o código existente já tiver convenção melhor.

---

# 71. AppModules

Depois do PR:

```text
BffAppModule
├── Config
├── Observability
└── Health
```

```text
OperationsAppModule
├── Config
├── Observability
└── Health
```

e assim por diante.

Ainda não:

```text
CustomerModule
AppointmentModule
BillingModule
```

---

# 72. Fluxo HTTP resultante

```text
Browser
   │
   ▼
Cloudflare
   │
   ▼
Nest Worker
   │
   ├── RequestIdMiddleware
   │
   ├── CorrelationIdMiddleware
   │
   ├── Observe trace
   │
   ├── HTTP Observability
   │
   ▼
HealthController
   │
   ▼
200
```

---

# 73. Fluxo futuro já preparado

Depois:

```text
Browser
   ↓
BFF
request=B
correlation=A
   ↓
Operations Worker
request=C
correlation=A
   ↓
CreateAppointment
   ↓
D1
```

Todos correlacionáveis.

---

# 74. Comandos principais

Depois da inspeção:

```bash
nest g library execution-context

nest g interface execution-context --project execution-context

nest g class execution-context.factory \
  --project execution-context \
  --no-spec
```

Depois:

```bash
nest g library observability

nest g module observability \
  --project observability

nest g service observability \
  --project observability
```

Middleware:

```bash
nest g middleware middleware/request-id \
  --project observability

nest g middleware middleware/correlation-id \
  --project observability
```

Interceptor:

```bash
nest g interceptor interceptors/http-observability \
  --project observability
```

Sanitizer:

```bash
nest g class sanitization/telemetry-sanitizer \
  --project observability \
  --no-spec
```

Observe:

```bash
npm i @nestjs/observe
```

Somente executar comandos de geração para artefatos realmente necessários após inspecionar o repositório.

---

# 75. Lint

Executar:

```bash
npm run lint
```

Corrigir apenas problemas do escopo.

---

# 76. Unit tests

Executar:

```bash
npm run test
```

Ou:

```bash
npm run test -- observability
```

conforme scripts reais.

---

# 77. Build individual

```bash
nest build bff-worker

nest build operations-worker

nest build clinical-worker

nest build billing-worker

nest build async-worker
```

Cada resultado deve ser registrado.

---

# 78. Wrangler

Quando aplicável:

```bash
npx wrangler types
```

Depois:

```bash
npx wrangler deploy --dry-run
```

Nunca:

```bash
npx wrangler deploy
```

neste PR.

---

# 79. Verificar bundle

Como estamos no Cloudflare Free, verificar se `@nestjs/observe` e a nova infraestrutura não criaram explosão inesperada no bundle.

Usar os outputs do:

```bash
npx wrangler deploy --dry-run
```

quando fornecerem tamanho final.

Registrar antes/depois, se disponível.

---

# 80. Cloudflare budget

Esse PR deve continuar aproximadamente:

| Recurso             | Health |
| ------------------- | -----: |
| Worker requests     |      1 |
| D1 reads            |      0 |
| D1 writes           |      0 |
| KV reads            |      0 |
| KV writes           |      0 |
| R2                  |      0 |
| chamadas de negócio |      0 |

Observabilidade deve adicionar apenas pequeno overhead de CPU/memória.

---

# 81. Definition of Done

Eu congelaria:

```text
[ ] PR-00 continua íntegro
[ ] PR-01 continua íntegro

[ ] @nestjs/observe instalado

[ ] ExecutionContext criado
[ ] requestId definido
[ ] correlationId definido
[ ] traceId suportado
[ ] service identificado
[ ] source definido
[ ] tenantId preparado, mas não confiado ainda
[ ] actorId preparado, mas não resolvido ainda

[ ] ObservabilityModule criado
[ ] createObserveModule centralizado
[ ] ObserveModule.forRoot configurado corretamente
[ ] configuração via Config
[ ] credenciais não hardcoded

[ ] OBSERVE_ENABLED controlável
[ ] testes não dependem de Observe remoto
[ ] configuração inválida falha cedo quando habilitada

[ ] RequestIdMiddleware criado via CLI
[ ] CorrelationIdMiddleware criado via CLI

[ ] IDs propagáveis entre Workers
[ ] IDs seguros/limitados

[ ] interceptor HTTP implementado somente se necessário
[ ] request duration observável
[ ] status observável
[ ] route/operation observável

[ ] payload HTTP não é logado
[ ] Authorization não é logado
[ ] Cookie não é logado
[ ] tokens não são logados
[ ] PII não é logada
[ ] dados clínicos não são logados

[ ] telemetry sanitizer testado

[ ] /health continua sem DB
[ ] /health continua sem tenant
[ ] /health continua sem auth
[ ] /health não produz tracing excessivo

[ ] Domain não depende de @nestjs/observe
[ ] Application não depende de @nestjs/observe

[ ] architecture tests PASS
[ ] unit tests PASS
[ ] lint PASS

[ ] bff build PASS
[ ] operations build PASS
[ ] clinical build PASS
[ ] billing build PASS
[ ] async build PASS

[ ] wrangler types PASS quando aplicável
[ ] wrangler dry-run PASS quando aplicável

[ ] impacto Cloudflare Free documentado

[ ] diff revisado
```

# 82. O que explicitamente NÃO deve aparecer no diff

Eu rejeitaria o PR se surgirem:

```text
CustomerRepository
AppointmentRepository
D1Database
R2Bucket
KVNamespace

TenantGuard
AuthenticationGuard

AuditWriter
OutboxWriter

CreateAppointmentUseCase
```

porque seriam escopo dos PRs seguintes.

Também rejeitaria:

```ts
@Injectable()
export class DomainSomething
```

somente para integrar com Observe.

A arquitetura exige domínio desacoplado da infraestrutura/framework. 

# 83. Relatório final obrigatório

O Codex deverá terminar com:

```text
PR-02 — Observabilidade + Execution Context
```

e informar:

```text
Estado anterior

Implementado

Comandos Nest CLI utilizados

Execution Context

Observability

Trace correlation

Request ID

Correlation ID

PII sanitization

Workers integrados

Arquivos criados/alterados

Testes

Builds

Wrangler

Cloudflare Free impact

Pendências reais

Próximo PR recomendado
```

Sem implementar o próximo.

---

# Próximo PR

Depois desse PR, a base estará assim:

```text
Worker
  │
  ├── Config
  ├── Health
  ├── Observability
  │      ├── logs
  │      ├── traces
  │      └── metrics
  │
  └── ExecutionContext
         ├── requestId
         ├── correlationId
         ├── traceId
         ├── service
         ├── source
         ├── tenantId?
         └── actorId?
```

Só então eu abriria:

> **PR-03 — Tenancy + Authentication Foundation**

porque nesse momento identidade, membership e tenant poderão ser adicionados ao mesmo `ExecutionContext`, em vez de criarmos uma segunda infraestrutura paralela de contexto. Isso também respeita a arquitetura do projeto, na qual request/correlation ID pertencem à camada técnica/BFF enquanto autorização definitiva e tenant confiável pertencem à Business API. 
