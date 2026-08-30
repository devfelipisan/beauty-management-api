# Implementação — Observability Foundation com NestJS Observe

Atue como um engenheiro de software sênior, especialista em NestJS, TypeScript, arquitetura hexagonal, sistemas distribuídos, observabilidade e segurança.

Sua tarefa é implementar a fundação de observabilidade do projeto utilizando `@nestjs/observe`, seguindo estritamente a documentação oficial do NestJS:

* `https://docs.nestjs.com/observability/overview`
* `https://docs.nestjs.com/observability/sdk`
* `https://docs.nestjs.com/observability/manual-instrumentation`
* `https://docs.nestjs.com/observability/distributed-tracing`
* `https://docs.nestjs.com/cli/usages`

A observabilidade deve ser tratada como preocupação arquitetural transversal e obrigatória para API, workers, jobs, integrações e operações relevantes.

Não transforme observabilidade em dependência do domínio.

---

# 1. Objetivo

Implementar uma fundação reutilizável que permita identificar e correlacionar:

* HTTP requests;
* traces;
* logs;
* erros não tratados;
* erros tratados;
* jobs;
* workers;
* integrações externas;
* runtime metrics;
* releases;
* contexto técnico da requisição;
* contexto semântico das operações;
* propagação de trace entre serviços.

A arquitetura final deve seguir conceitualmente:

```text
                     NestJS Observe
                           │
                    @nestjs/observe
                           │
                  ObserveInstrument
                           │
                           ▼
                  NestJS Application
                           │
         ┌─────────────────┼──────────────────┐
         │                 │                  │
   Middleware         Interceptor           Jobs
         │                 │                  │
 technical context    semantic context    job context
         │                 │                  │
         └─────────────────┼──────────────────┘
                           │
                      Application
                           │
                  ObservabilityPort
                           ▲
                           │
                    ObserveAdapter
                           │
                     TracerService
```

---

# 2. Restrições arquiteturais

Estas regras são obrigatórias.

## 2.1 Domain

O diretório de domínio:

```text
src/domain
```

NÃO pode importar:

```typescript
@nestjs/observe
```

NÃO pode depender de:

```text
TracerService
ObserveModule
ObserveInstrument
NestJS Logger
```

O domínio deve permanecer puro.

---

## 2.2 Application

A camada de aplicação não deve conhecer diretamente `@nestjs/observe`.

Quando instrumentação manual for necessária, utilizar uma porta abstrata:

```text
ObservabilityPort
```

A infraestrutura deverá fornecer o adapter concreto.

---

## 2.3 Infrastructure

Toda implementação específica do NestJS Observe deve ficar em:

```text
src/infrastructure/observability
```

---

# 3. Antes de alterar código

Execute inicialmente:

```bash
pwd
```

```bash
git status --short
```

Leia:

```bash
cat README.md
```

Liste documentação existente:

```bash
find docs -maxdepth 3 -type f 2>/dev/null | sort
```

Liste a estrutura:

```bash
find src -maxdepth 4 -type f | sort
```

Verifique os scripts:

```bash
cat package.json
```

Verifique versões:

```bash
npm list @nestjs/core
npm list @nestjs/common
npm list @nestjs/observe
npm list @nestjs/graphql
```

Não assuma a arquitetura existente.

Inspecione o código real antes de decidir onde alterar.

Não reestruture módulos fora do necessário para esta feature.

---

# 4. Compatibilidade

Confirmar:

```text
@nestjs/core >= 11.1.4
```

Caso GraphQL seja utilizado:

```text
@nestjs/graphql >= 13.4.4
```

Não atualizar dependências major de forma indiscriminada.

Caso a versão atual não suporte Observe, documentar o bloqueio antes de modificar versões.

---

# 5. Instalação

Caso ainda não esteja instalado:

```bash
npm install @nestjs/observe
```

Não adicionar outra biblioteca de APM nesta implementação.

---

# 6. Estrutura desejada

Criar preferencialmente através do Nest CLI.

Execute:

```bash
nest g module infrastructure/observability
```

Execute:

```bash
nest g middleware infrastructure/observability/middleware/request-context
```

Execute:

```bash
nest g interceptor infrastructure/observability/interceptors/observability
```

Crie diretórios auxiliares quando necessário:

```bash
mkdir -p src/infrastructure/observability/config
mkdir -p src/infrastructure/observability/contracts
mkdir -p src/infrastructure/observability/adapters
mkdir -p src/infrastructure/observability/policies
mkdir -p src/infrastructure/observability/decorators
```

A estrutura desejada é aproximadamente:

```text
src/
├── domain/
├── application/
├── presentation/
└── infrastructure/
    └── observability/
        ├── observability.module.ts
        ├── config/
        │   └── observe.factory.ts
        ├── middleware/
        │   └── request-context.middleware.ts
        ├── interceptors/
        │   └── observability.interceptor.ts
        ├── contracts/
        │   ├── observability-context.ts
        │   └── observability.port.ts
        ├── adapters/
        │   └── observe-observability.service.ts
        ├── policies/
        │   ├── observability-attribute.policy.ts
        │   └── sensitive-data.policy.ts
        └── decorators/
            └── observable-operation.decorator.ts
```

Adapte nomes somente se o projeto já possuir convenção equivalente.

Não crie uma arquitetura paralela desnecessariamente.

---

# 7. Configuração de ambiente

Adicionar ao `.env.example`, preservando valores reais fora do repositório:

```env
NODE_ENV=development

SERVICE_ID=beauty-management-api
SERVICE_VERSION=local

OBSERVE_APP_KEY=
OBSERVE_APP_SECRET=

OBSERVE_DEBUG=true
OBSERVE_FORWARD_LOGS=true
OBSERVE_RUNTIME_METRICS=true

OBSERVE_TRACE_SAMPLE_RATE=1
OBSERVE_FLUSH_INTERVAL=5000
OBSERVE_MAX_TRACES_PER_BATCH=1000
```

Nunca adicionar credenciais reais.

Não usar fallback como:

```text
fake-key
local-key
default-secret
```

Credenciais ausentes devem resultar em comportamento explícito e previsível.

---

# 8. Identidade dos serviços

Cada aplicação ou worker deve utilizar `SERVICE_ID` próprio.

Exemplos:

```text
beauty-management-api
beauty-management-scheduler-worker
beauty-management-notification-worker
beauty-management-file-worker
beauty-management-report-worker
```

Não codificar esses nomes diretamente no código se puderem vir de configuração.

`SERVICE_VERSION` deve ser configurável por ambiente/deploy.

Local:

```text
local
```

CI/CD:

```text
git SHA
```

---

# 9. Observe factory

Criar:

```text
src/infrastructure/observability/config/observe.factory.ts
```

Utilizar `createObserveModule()`.

A configuração deve contemplar:

```text
traceIdKey
attachTraceIdToLogs
sourceContext
```

Preferir o comportamento padrão do SDK para `x-request-id` enquanto não existir necessidade concreta de um generator customizado.

Exportar:

```text
ObserveModule
ObserveInstrument
```

---

# 10. Bootstrap

Modificar o bootstrap real da aplicação.

Configurar:

```typescript
instrument: ObserveInstrument
```

em:

```typescript
NestFactory.create(...)
```

Caso o projeto utilize Fastify com adapter explícito, respeitar a assinatura correta do NestJS e colocar as opções de instrumentação no argumento adequado.

Não implementar tracing HTTP manual para substituir `ObserveInstrument`.

---

# 11. ObserveModule

Registrar:

```typescript
ObserveModule.forRootAsync(...)
```

Utilizar:

```text
ConfigModule
ConfigService
```

Evitar `process.env` espalhado pela aplicação.

Configurar através de `ConfigService`:

```text
appKey
appSecret
serviceId
serviceVersion
runtimeMetrics
runtimeMetricsInterval
forwardLogs
tracesSampleRate
maxTracesPerBatch
flushInterval
debug
```

Defaults desejados:

```text
runtimeMetrics=true
runtimeMetricsInterval=60000
tracesSampleRate=1
maxTracesPerBatch=1000
flushInterval=5000
```

`debug` somente para desenvolvimento.

---

# 12. RequestContextMiddleware

Implementar middleware global responsável exclusivamente pelo contexto técnico de entrada.

Responsabilidades:

```text
garantir x-request-id
reutilizar x-request-id existente
gerar UUID quando ausente
retornar x-request-id no response
```

Não colocar nele:

```text
regra de negócio
autorização
PII
logs de body
medição manual de performance
```

Fluxo:

```text
Client
  │
  │ x-request-id
  ▼
RequestContextMiddleware
  │
  ├── preserve
  └── generate
       │
       ▼
NestJS Observe
  traceId
```

---

# 13. Contexto tipado

Criar contrato equivalente a:

```typescript
export interface ObservabilityContext {
  traceId: string;

  requestId?: string;

  tenantId?: string;

  principalId?: string;

  operation?: string;

  entityId?: string;

  provider?: string;

  retryCount?: number;
}
```

Adaptar aos nomes reais existentes no projeto.

Não adicionar atributos de PII.

---

# 14. ObservabilityInterceptor

Criar interceptor global.

Registrar preferencialmente usando:

```typescript
APP_INTERCEPTOR
```

para permitir Dependency Injection.

O interceptor NÃO deve criar manualmente o trace principal.

O interceptor NÃO deve recriar APM usando:

```typescript
Date.now()
performance.now()
```

sem necessidade específica.

Sua responsabilidade é adicionar contexto semântico seguro ao trace existente.

Exemplos:

```text
operation
tenantId
principalId
entityId
outcome
```

---

# 15. ObservableOperation

Criar decorator:

```typescript
@ObservableOperation('appointment.create')
```

Utilizar metadata do NestJS.

O interceptor deve ler o valor com:

```typescript
Reflector
```

e adicionar a operação ao contexto observável.

Não adicionar esse decorator indiscriminadamente.

Usar apenas para operações relevantes de negócio.

Exemplos:

```text
company.create
professional.create
professional.activate

service.create
service.update

appointment.create
appointment.cancel
appointment.complete

customer.create

session.start
session.complete

payment.register

notification.send
```

---

# 16. ObservabilityPort

Criar um port independente do fornecedor.

Contrato mínimo:

```typescript
export interface ObservabilityPort {
  createSpan<T>(
    name: string,
    callback: () => Promise<T>,
  ): Promise<T>;

  captureHandledError(
    error: unknown,
    attributes?: Record<string, string | number | boolean>,
  ): Promise<void>;

  setAttribute(
    key: string,
    value: string | number | boolean,
  ): void;

  currentTraceId(): string | null;
}
```

Criar token de DI:

```typescript
OBSERVABILITY_PORT
```

A camada de aplicação deverá depender dessa abstração quando observabilidade manual for realmente necessária.

---

# 17. Observe adapter

Criar implementação:

```text
ObserveObservabilityService
```

que implementa:

```text
ObservabilityPort
```

internamente utilizando:

```text
TracerService
```

Não inventar métodos do `TracerService`.

Consultar a API real disponível na versão instalada antes de implementar.

---

# 18. Manual instrumentation

Usar spans manuais somente quando semanticamente úteis.

Exemplos permitidos:

```text
appointment.availability.check
appointment.persist

notification.enqueue
provider.notification.send

storage.image.upload
storage.document.upload

provider.http.call

database.reconciliation
```

Não criar spans automaticamente para todo método de:

```text
service
repository
mapper
validator
controller
```

quando o SDK já fornece auto-instrumentação suficiente.

---

# 19. Erros

## Não tratados

Erros que escapam do lifecycle devem ser capturados automaticamente pelo Observe.

Não duplicar captura.

## Tratados

Se houver:

```typescript
try {
  ...
} catch (error) {
  // fallback / retry / suppression
}
```

e o erro não for relançado, usar a abstração de observabilidade para registrar explicitamente o erro tratado.

O registro deve incluir somente atributos seguros.

Exemplo:

```text
provider
retryable
operation
```

Nunca incluir payload sensível.

---

# 20. Logs

Padronizar logs estruturados utilizando o logger já adotado pelo projeto.

Formato conceitual:

```typescript
logger.log({
  event: 'appointment.creation.started',
  appointmentId,
});
```

Convenção:

```text
<domain>.<operation>.<state>
```

Exemplos:

```text
appointment.creation.started
appointment.creation.completed
appointment.creation.failed

notification.send.started
notification.send.completed
notification.send.retry

storage.upload.started
storage.upload.completed
storage.upload.failed
```

Não logar:

```text
DTO inteiro
request.body
response.body
Authorization
cookie
token
senha
CPF
email
telefone
endereço
documento
imagem
```

---

# 21. Trace ID nos logs

Configurar:

```text
attachTraceIdToLogs=true
```

Garantir que logs possam ser correlacionados ao trace.

Se `forwardLogs` estiver habilitado, utilizar o mecanismo oficial do SDK.

Não implementar outro sistema de forward log em paralelo.

---

# 22. Política de atributos

Criar whitelist explícita.

Permitidos inicialmente:

```text
traceId
requestId

tenantId
principalId

operation
entityId

serviceId
serviceVersion

queueName
jobName
jobId

provider

retryCount
attempt

status
outcome
```

A política deve ser fail-closed.

Qualquer atributo desconhecido:

```text
DENY
```

até ser explicitamente aprovado.

---

# 23. SensitiveDataPolicy

Criar política específica de proteção de dados.

Bloquear explicitamente:

```text
password

authorization
cookie

accessToken
refreshToken

secret
apiKey

cpf

email
phone

name
address

rawRequest
rawResponse

document
documentContents

image
imageContents

creditCard
paymentToken
```

A regra fundamental é:

```text
unknown telemetry attribute
        ↓
      DENY
```

---

# 24. Redaction

Configurar o mecanismo oficial do Observe.

Utilizar:

```text
enabled=true
useDefaultPatterns=true
replacement=[REDACTED]
```

Adicionar keys relevantes do projeto:

```text
password
authorization
cookie

accessToken
refreshToken

token
secret
apiKey

cpf
email
phone
```

Redaction é proteção adicional.

Ela NÃO autoriza o envio indiscriminado de payloads.

---

# 25. Requests

Configurar observabilidade HTTP utilizando o suporte oficial.

Adicionar tags estáticas seguras, como:

```text
project=beauty-management
environment=<NODE_ENV>
```

Quando o usuário estiver autenticado, utilizar somente identificador interno/UUID como `userId`.

Não utilizar:

```text
email
CPF
telefone
nome
```

como user identifier.

---

# 26. Multi-tenancy

Quando houver tenant, enviar somente identificador técnico interno.

Exemplo:

```text
tenantId=<UUID>
```

Não enviar:

```text
nome da empresa
CNPJ
email da empresa
endereço
```

---

# 27. Query parameters

Configurar obfuscation para parâmetros sensíveis.

Cobrir pelo menos:

```text
token
password
secret
cpf
email
phone
```

Não assumir que redaction de query substitui validação de atributos.

---

# 28. Health endpoints

Identificar as rotas reais existentes.

Ignorar da telemetria endpoints equivalentes a:

```text
/health
/live
/ready
```

somente se existirem.

Não inventar endpoints.

O objetivo é evitar ruído de probes.

---

# 29. Runtime metrics

Habilitar:

```text
runtimeMetrics=true
runtimeMetricsInterval=60000
```

Validar captura de:

```text
CPU
memory
GC
event loop latency
heartbeat
```

---

# 30. ServiceVersion

Garantir que:

```text
SERVICE_VERSION
```

seja lido da configuração.

Não chamar Git em runtime da aplicação para descobrir versão.

O CI/CD deve poder injetar:

```text
Git SHA
```

---

# 31. Sampling

Configurar via:

```text
OBSERVE_TRACE_SAMPLE_RATE
```

Desenvolvimento:

```text
1
```

Staging:

```text
1
```

Produção:

começar configurável, sem hardcode.

Não introduzir sampling complexo nesta primeira implementação sem evidência de necessidade.

---

# 32. Batching

Utilizar inicialmente:

```text
maxTracesPerBatch=1000
flushInterval=5000
```

Não alterar os defaults sem motivo mensurável.

---

# 33. Debug

Ativar somente em ambiente development.

Não deixar:

```text
debug=true
```

fixo em produção.

---

# 34. Jobs

Inspecionar a implementação real de filas/workers antes de modificar.

Para cada worker NestJS, garantir instrumentação via:

```text
ObserveInstrument
```

utilizando corretamente:

```typescript
NestFactory.createMicroservice(...)
```

ou:

```typescript
NestFactory.createApplicationContext(...)
```

de acordo com o código real.

Não transformar workers existentes em outro tipo apenas por causa da observabilidade.

---

# 35. Contexto de jobs

Adicionar atributos seguros:

```text
queueName
jobName
jobId

tenantId
entityId

attempt
retryCount

operation
```

Nunca enviar automaticamente:

```text
job.payload
```

---

# 36. Distributed tracing

Toda chamada outbound relevante deve considerar propagação do trace.

Utilizar a API oficial para recuperar o trace atual.

Propagar por HTTP usando:

```text
x-request-id
```

quando compatível com o serviço downstream.

Fluxo esperado:

```text
WEB
 │
 │ x-request-id=A
 ▼
API
 │
 │ trace=A
 │
 │ x-request-id=A
 ▼
downstream service
 │
 │ trace=A
 ▼
worker / integration
```

---

# 37. Queue propagation

Ao publicar um job interno, incluir um identificador de trace técnico no envelope quando necessário.

Formato conceitual:

```typescript
{
  traceId,
  entityId,
  ...
}
```

Não copiar:

```text
request inteiro
headers inteiros
user object inteiro
DTO inteiro
```

para o job.

---

# 38. Integrações externas

Identificar adapters/providers reais.

Para integrações importantes, considerar span semântico como:

```text
provider.notification.send
provider.storage.upload
provider.payment.request
provider.http.call
```

Adicionar:

```text
provider
operation
outcome
```

Nunca registrar segredo ou payload bruto.

---

# 39. Repositories

Não adicionar span manual a cada método de repository.

Adicionar somente onde houver operação tecnicamente relevante, como:

```text
reconciliation
lock
transaction
aggregate pesado
```

Não registrar SQL completo se ele puder conter PII ou valores sensíveis.

---

# 40. Métricas customizadas

Usar somente quando representarem informação não coberta automaticamente.

Possíveis counters:

```text
appointments.created
appointments.cancelled

notifications.sent
notifications.failed

jobs.retry

provider.failure
```

Possíveis gauges:

```text
queue.depth
active.jobs
active.uploads
```

Possíveis summaries:

```text
appointment.processing.duration
upload.size
provider.latency
```

Antes de adicionar cada métrica, confirmar se ela não duplica métricas HTTP/runtime já fornecidas pelo SDK.

---

# 41. Auditoria não é observabilidade

Não alterar o sistema de auditoria existente para depender do Observe.

Manter:

```text
Observability
→ diagnóstico operacional
```

Separado de:

```text
Audit
→ histórico persistente
```

Observe não é storage normativo de auditoria.

---

# 42. Eventos de domínio não são logs

Não substituir Domain Events por logs.

Exemplo:

```text
AppointmentCreated
```

é evento de domínio.

```text
appointment.creation.completed
```

é telemetria.

Manter responsabilidades distintas.

---

# 43. Testes do middleware

Criar testes para:

```text
incoming x-request-id → preserve

missing x-request-id → generate

response contains same x-request-id
```

---

# 44. Testes do interceptor

Testar:

```text
ObservableOperation metadata → attribute

tenantId → attribute

principalId → attribute

missing optional context → does not fail

sensitive attribute → blocked
```

---

# 45. Testes das políticas

Criar testes obrigatórios:

```text
allows tenantId
allows principalId
allows operation
allows entityId
allows provider

denies password
denies authorization
denies cookie
denies accessToken
denies refreshToken
denies CPF
denies email
denies phone

unknown key → deny
```

---

# 46. Testes do adapter

Mockar `TracerService`.

Validar delegação de:

```text
createSpan
captureHandledError
setAttribute
currentTraceId
```

Não testar implementação interna do SDK.

---

# 47. Teste de integração de request

Criar teste ou procedimento reproduzível para:

```bash
curl \
  -H "x-request-id: observe-test-request-001" \
  http://localhost:<PORT>/<ROTA_EXISTENTE>
```

Validar:

```text
request visível
trace visível
traceId preservado
serviceId correto
serviceVersion correto
```

Não inventar rota apenas se já existir uma adequada.

Se for criada rota de teste, ela deve ser exclusivamente development/test e claramente isolada.

---

# 48. Teste de erro não tratado

Validar que um erro não tratado aparece em:

```text
Errors
```

correlacionado com:

```text
trace
request
service
serviceVersion
stack
```

---

# 49. Teste de erro tratado

Executar fluxo de teste onde um erro é capturado e não relançado.

Validar que:

```text
captureHandledError
```

o registra.

---

# 50. Teste de logs

Gerar log estruturado não sensível.

Validar correlação com trace.

---

# 51. Teste de redaction

Usar fixtures sintéticas.

Nunca usar segredo real.

Exemplo:

```text
token=synthetic-secret-value
email=observe@example.test
phone=21999999999
cpf=00000000000
```

Critério:

```text
rawSensitiveValueFound = 0
```

---

# 52. Teste de health ignore

Caso existam endpoints de health:

```bash
curl http://localhost:<PORT>/health
```

Validar que não produz trace quando configurado como ignorado.

---

# 53. Teste de job

Executar job real ou fixture apropriada.

Validar:

```text
job visible
queueName visible
jobName visible
duration visible
errors correlated
logs correlated
```

---

# 54. Teste de trace distribuído

Criar ou utilizar integração interna existente.

Validar:

```text
originTraceId == downstreamTraceId
```

quando o protocolo permitir correlação pelo `x-request-id`.

---

# 55. Teste de runtime metrics

Validar no ambiente configurado:

```text
CPU
memory
GC
event loop
heartbeat
```

---

# 56. Critérios de aceite

A implementação somente pode ser considerada concluída quando:

```text
ObserveInstrumentAttached = true

RequestTraceVisible = true
JobTraceVisible = true

TraceIdGenerated = true
TraceIdPreserved = true
TraceIdPropagated = true

LogsCorrelated = true

UnhandledErrorCaptured = true
HandledErrorCaptured = true

RuntimeMetricsVisible = true

ServiceIdVisible = true
ServiceVersionVisible = true

HealthNoiseIgnored = true

SensitiveValueObserved = 0

RawAuthorizationObserved = 0
RawTokenObserved = 0
RawCpfObserved = 0
RawEmailObserved = 0
RawPhoneObserved = 0
```

---

# 57. Gates locais

Ao final, executar os scripts existentes equivalentes a:

```bash
npm run build
```

```bash
npm run lint
```

```bash
npm test
```

Se existirem:

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
```

Não inventar scripts.

Consultar `package.json` e utilizar somente comandos disponíveis ou justificar novos scripts adicionados.

---

# 58. Verificação de arquitetura

Executar busca:

```bash
grep -R "@nestjs/observe" src/domain src/application 2>/dev/null || true
```

Esperado:

```text
src/domain → zero imports
```

Na application, imports diretos devem ser zero se `ObservabilityPort` estiver sendo utilizado corretamente.

---

# 59. Verificação de secrets

Executar:

```bash
git diff
```

Inspecionar explicitamente:

```text
OBSERVE_APP_KEY
OBSERVE_APP_SECRET
Authorization
password
token
```

Nenhum segredo real pode aparecer no diff.

---

# 60. Mudanças pequenas

Não implemente toda a instrumentação avançada indiscriminadamente em uma única passagem.

Prioridade:

```text
1. SDK/bootstrap
2. request tracing
3. errors
4. runtime metrics
5. request context
6. interceptor semântico
7. logs
8. PII/redaction
9. ObservabilityPort
10. handled errors
11. custom spans
12. workers/jobs
13. distributed tracing
14. custom metrics
```

Se alguma etapa depender de infraestrutura ainda inexistente, não inventá-la.

Documentar como pendência.

---

# 61. Fora de escopo

Não fazer:

```text
deploy
alteração de produção
criação de credenciais reais
migração de banco
mudança de dados reais
troca de sistema de auditoria
troca de logger sem necessidade
troca de queue
troca de framework HTTP
refatoração ampla sem relação com a feature
```

---

# 62. Documentação

Criar ou atualizar:

```text
docs/observability.md
```

Documentar:

```text
objetivo
arquitetura
responsabilidades por camada
configuração
variáveis de ambiente
requests
trace IDs
middleware
interceptor
logs
errors
handled errors
jobs
workers
distributed tracing
runtime metrics
PII/redaction
service IDs
service versions
sampling
troubleshooting
testes
```

Adicionar seção:

```text
Observability Rules for New Features
```

com as perguntas obrigatórias:

```text
1. Qual operação está sendo executada?

2. Já existe auto-instrumentação suficiente?

3. É necessário um span semântico?

4. O fluxo possui erro tratado?

5. Existe integração externa?

6. Existe job?

7. O trace cruza um boundary?

8. O traceId precisa ser propagado?

9. Quais atributos são realmente necessários?

10. Existe risco de PII ou segredo?
```

---

# 63. Atualizar instruções do Codex

Se existir:

```text
.codex/
```

adicionar esta regra às instruções apropriadas:

```text
Toda nova feature deve considerar observabilidade desde o desenho.

Não adicionar logs, spans, métricas ou atributos automaticamente.

Utilizar auto-instrumentação do NestJS Observe primeiro.

Utilizar ObservabilityPort para instrumentação manual na camada de aplicação.

Não importar @nestjs/observe no domínio.

Propagar trace quando houver boundary entre serviços/workers.

Erros tratados precisam de estratégia explícita de observabilidade.

Atributos de telemetria seguem whitelist e fail-closed.

PII, secrets e payloads brutos nunca devem entrar em telemetria.
```

---

# 64. Resultado arquitetural esperado

HTTP:

```text
Client
 │
 │ x-request-id
 ▼
ObserveInstrument
 │
 ▼
RequestContextMiddleware
 │
 ├── requestId
 └── traceId
 │
 ▼
Authentication / Guards
 │
 ├── principalId
 └── tenantId
 │
 ▼
ObservabilityInterceptor
 │
 ├── operation
 └── safe attributes
 │
 ▼
Controller
 │
 ▼
Application
 │
 ├── ObservabilityPort
 │
 ├── custom spans
 │
 └── handled errors
 │
 ▼
Repository / Integration
 │
 ▼
PostgreSQL / Provider
```

Async:

```text
API
 │
 │ trace=A
 ▼
enqueue
 │
 │ traceId=A
 ▼
Worker
 │
 ├── ObserveInstrument
 ├── job trace
 ├── queueName
 ├── jobName
 ├── operation
 ├── retry attributes
 └── handled/unhandled errors
 │
 ▼
Application
```

---

# 65. Definition of Done

A implementação somente está concluída quando:

```text
[ ] @nestjs/observe instalado e compatível

[ ] ObserveInstrument conectado ao bootstrap

[ ] ObserveModule.forRootAsync configurado

[ ] ConfigService utilizado

[ ] SERVICE_ID configurável

[ ] SERVICE_VERSION configurável

[ ] middleware de request context implementado

[ ] x-request-id preservado/gerado

[ ] x-request-id retornado ao cliente

[ ] interceptor semântico global implementado

[ ] contexto observável tipado

[ ] ObservableOperation implementado

[ ] ObservabilityPort implementado

[ ] Observe adapter implementado

[ ] domain sem dependência de Observe

[ ] requests observáveis

[ ] logs correlacionáveis

[ ] erros não tratados capturados

[ ] erros tratados capturados

[ ] runtime metrics habilitadas

[ ] redaction habilitada

[ ] PII policy implementada

[ ] whitelist de atributos implementada

[ ] comportamento fail-closed comprovado

[ ] health noise removido quando aplicável

[ ] sampling configurável

[ ] workers instrumentados quando existirem

[ ] jobs observáveis

[ ] trace propagation implementada onde aplicável

[ ] integrações relevantes instrumentadas

[ ] testes unitários passando

[ ] testes de integração passando

[ ] build passando

[ ] lint passando

[ ] documentação atualizada

[ ] nenhum segredo real no diff
```

---

# 66. Formato obrigatório do relatório final

Ao terminar, responda utilizando exatamente esta estrutura:

```text
## 1. Estado inicial encontrado

- arquitetura real
- versão NestJS
- status prévio do Observe
- workers encontrados
- integrações relevantes encontradas
- gaps identificados

## 2. Arquivos criados

- caminho
- responsabilidade

## 3. Arquivos alterados

- caminho
- mudança
- motivo

## 4. Observabilidade implementada

### Requests
...

### Traces
...

### Logs
...

### Errors
...

### Handled Errors
...

### Jobs
...

### Runtime Metrics
...

### Distributed Tracing
...

### PII / Redaction
...

## 5. Arquitetura final

Descrever dependências entre:
domain
application
ObservabilityPort
ObserveAdapter
TracerService
middleware
interceptor
workers

## 6. Testes executados

Comando:
Resultado:

## 7. Gates

Build:
Lint:
Unit:
Integration:
E2E:

## 8. Critérios de aceite

PASS / FAIL para cada critério.

## 9. Pendências

Somente pendências realmente verificadas.

## 10. Riscos ou decisões futuras

Somente itens que não pertencem ao escopo atual.

## 11. Git diff resumido

Listar somente alterações relevantes.
```

---

# 67. Regra final

Não declare algo como implementado apenas porque o código foi criado.

Verifique fisicamente através de:

```text
build
lint
tests
runtime local quando possível
dashboard Observe quando as credenciais estiverem disponíveis
```

Quando uma validação depender de credencial externa indisponível, classificar como:

```text
IMPLEMENTED_BUT_NOT_PHYSICALLY_VERIFIED
```

e não como:

```text
PASS
```

Não invente sucesso.

Priorize sempre:

```text
SOLID
Clean Code
arquitetura hexagonal
segurança
baixo acoplamento
mudanças pequenas
reversibilidade
testabilidade
observabilidade por padrão
proteção de PII
fail-closed
```
