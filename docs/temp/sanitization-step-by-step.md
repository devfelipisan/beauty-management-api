Sim. Antes de iniciar os bounded contexts e endpoints funcionais, eu faria uma **sanitização arquitetural explícita do `beauty-management-api`**, deixando cada Worker em um estado mínimo, executável, observável e verificável, com **somente o endpoint de Health como superfície HTTP inicial**.

Isso é coerente com a estratégia de construir primeiro a fundação e só depois acelerar os módulos funcionais.  Também reduz o risco de carregar para a nova arquitetura controllers, services e endpoints gerados por scaffold que acabem virando dependências acidentais. A arquitetura deve preservar a separação `interface → application → domain`, mantendo infraestrutura e framework fora do domínio. 

Eu trataria isso como um PR independente:

# PR-00 — Sanitização da API e Health Baseline

O objetivo do PR seria:

```text
estado atual
    ↓
inventário
    ↓
identificar scaffolding / endpoints temporários
    ↓
remover Controller/Service sem responsabilidade real
    ↓
remover rotas de demonstração
    ↓
preservar infraestrutura transversal
    ↓
criar HealthModule
    ↓
GET /health
    ↓
observabilidade
    ↓
build/test
    ↓
baseline limpo
```

O ponto central é que **sanitização não significa apagar tudo**. Significa remover código sem responsabilidade arquitetural definida e preservar fundações que serão necessárias pelos Workers.

---

## 1. O que deve existir ao final da sanitização

Inicialmente, cada Worker deveria ficar próximo de:

```text
apps/
├── bff-worker/
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       └── health/
│           ├── health.module.ts
│           └── health.controller.ts
│
├── operations-worker/
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       └── health/
│
├── clinical-worker/
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       └── health/
│
├── billing-worker/
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       └── health/
│
└── async-worker/
    └── src/
        ├── main.ts
        ├── app.module.ts
        └── health/
```

Enquanto as bibliotecas fundacionais permanecem:

```text
libs/
├── observability/
├── contracts/
├── kernel/
├── config/
├── database/
├── tenancy/
├── authentication/
├── audit/
├── idempotency/
└── outbox/
```

Mesmo que algumas ainda estejam vazias ou parcialmente implementadas.

---

# 2. O que deve ser removido

No scaffold padrão do NestJS normalmente aparecem:

```text
app.controller.ts
app.controller.spec.ts
app.service.ts
```

e algo semelhante a:

```ts
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
```

com:

```ts
@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
```

Esse código não possui significado no domínio nem na infraestrutura do projeto.

Deve ser eliminado.

Por exemplo:

```bash
rm apps/operations-worker/src/app.controller.ts
rm apps/operations-worker/src/app.controller.spec.ts
rm apps/operations-worker/src/app.service.ts
```

Repetir somente onde esses arquivos realmente existirem.

Não remova arquivos por nome sem antes verificar o conteúdo.

---

# 3. Primeiro faça inventário

Antes de remover qualquer coisa:

```bash
pwd

git status

git branch --show-current

git log -10 --oneline
```

Inspecione as aplicações:

```bash
find apps -maxdepth 5 -type f | sort
```

Inspecione controllers:

```bash
find . -type f -name "*.controller.ts" | sort
```

Services:

```bash
find . -type f -name "*.service.ts" | sort
```

Modules:

```bash
find . -type f -name "*.module.ts" | sort
```

E procure decorators HTTP:

```bash
grep -R "@Get(" apps libs src 2>/dev/null || true

grep -R "@Post(" apps libs src 2>/dev/null || true

grep -R "@Put(" apps libs src 2>/dev/null || true

grep -R "@Patch(" apps libs src 2>/dev/null || true

grep -R "@Delete(" apps libs src 2>/dev/null || true
```

A decisão de remover deve ser feita pelo **comportamento real**, não só pelo nome do arquivo.

---

# 4. Classificação obrigatória antes da exclusão

Eu classificaria todo endpoint existente em quatro grupos.

| Tipo                                        | Ação                               |
| ------------------------------------------- | ---------------------------------- |
| Scaffold Nest (`Hello World`)               | remover                            |
| Endpoint temporário/mock                    | remover da runtime                 |
| Endpoint funcional já aprovado pelo domínio | não remover sem migração planejada |
| Endpoint de infraestrutura                  | avaliar/preservar                  |

Exemplo:

```text
GET /
Hello World
```

→ remover.

```text
GET /users
retorna array hardcoded
```

→ remover.

Mas se existir algo como:

```text
POST /appointments
```

com regra, teste e documentação funcional real, não apagar simplesmente porque estamos sanitizando.

A especificação do produto já define agendamento, sinal, sessão, pagamento e demais operações como partes reais do MVP.

A sanitização deve limpar **scaffolding**, e não destruir trabalho de domínio validado.

---

# 5. O que não deve ser removido

Especialmente, eu preservaria qualquer base real de:

```text
ConfigModule
Observability
Exception filters
Request context
Correlation ID
Validation pipes
Security headers
Database configuration
Repository ports
Migration infrastructure
Wrangler
Cloudflare bindings
Environment validation
```

Mesmo que ainda não estejam utilizados por endpoints funcionais.

Esses elementos pertencem à fundação.

---

# 6. Remover `AppService` genérico

Um ponto que eu considero importante para esse projeto:

> não deveria existir um `AppService` central como “serviço da aplicação”.

Porque tende a se transformar nisso:

```text
AppService
├── customers
├── appointments
├── deposits
├── payments
├── sessions
└── ...
```

e rapidamente vira um God Service.

O padrão desejado será:

```text
CreateAppointmentUseCase

ConfirmDepositUseCase

StartSessionUseCase

CompleteSessionUseCase

RegisterPaymentUseCase
```

A proposta arquitetural já prevê casos de uso explícitos como `CreateAppointment`, `ConfirmDeposit`, `StartSession`, `CompleteSession`, `RegisterPayment` e outros, desacoplados do framework. 

Por isso o scaffold:

```text
app.service.ts
```

não tem utilidade arquitetural.

---

# 7. Remover o `AppController`

O mesmo vale para:

```text
AppController
```

Não haverá um controller gigante:

```text
AppController
├── customers
├── services
├── appointments
├── sessions
├── payments
└── health
```

Cada capability terá seu próprio inbound adapter.

Por exemplo futuramente:

```text
AppointmentsController
CustomersController
SessionsController
PaymentsController
```

Por enquanto:

```text
HealthController
```

---

# 8. AppModule deve ser somente composition root

Depois da sanitização:

```ts
@Module({
  imports: [
    HealthModule,
  ],
})
export class AppModule {}
```

Posteriormente:

```ts
@Module({
  imports: [
    ConfigModule,
    ObservabilityModule,
    HealthModule,
    AppointmentsModule,
    CustomersModule,
  ],
})
export class AppModule {}
```

O `AppModule` não deve possuir:

```text
business logic
SQL
repository
calculation
HTTP manipulation
```

---

# 9. Criar Health usando Nest CLI

Como a regra do projeto é utilizar a Nest CLI sempre que existir generator compatível:

```bash
nest g module health --project operations-worker
```

Depois:

```bash
nest g controller health --project operations-worker --no-spec
```

Se preferir manter teste gerado:

```bash
nest g controller health --project operations-worker
```

Eu manteria o teste, portanto não usaria `--no-spec` se a configuração atual tiver Jest operacional.

Para os demais:

```bash
nest g module health --project bff-worker
nest g controller health --project bff-worker

nest g module health --project clinical-worker
nest g controller health --project clinical-worker

nest g module health --project billing-worker
nest g controller health --project billing-worker

nest g module health --project async-worker
nest g controller health --project async-worker
```

---

# 10. Não criar `HealthService` sem necessidade

Aqui eu faria uma exceção importante.

Não criaria:

```bash
nest g service health
```

apenas porque estamos usando Nest.

Se o endpoint inicialmente responde somente:

```text
process is alive
```

não existe uma responsabilidade real para um Service.

O Controller pode ser:

```ts
@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      status: 'ok',
    };
  }
}
```

Criar:

```text
HealthController
→ HealthService
→ return "ok"
```

é uma abstração sem benefício.

SOLID não significa “cada Controller precisa de Service”.

---

# 11. Contrato mínimo do Health

Eu usaria inicialmente:

```http
GET /health
```

Resposta:

```json
{
  "status": "ok",
  "service": "operations-worker",
  "version": "..."
}
```

Não exponha:

```text
hostname
environment variables
database URL
Cloudflare account
credentials
secrets
internal stack
dependency topology
```

---

# 12. Modelo comum

Poderíamos ter contrato compartilhado:

```ts
export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
}
```

Em:

```text
libs/contracts/src/health/
```

Mas eu somente faria isso se os cinco Workers efetivamente reutilizarem o contrato.

Não crie biblioteca para um único objeto prematuramente.

---

# 13. Um Health por Worker

A topologia final exige que cada Worker seja implantável separadamente.

Portanto:

```text
BFF
GET /health
```

```text
Operations
GET /health
```

```text
Clinical
GET /health
```

```text
Billing
GET /health
```

```text
Async
GET /health
```

Isso é importante porque:

```text
BFF saudável
```

não significa necessariamente:

```text
Billing saudável
```

Cada deployment precisa ter identidade operacional própria.

---

# 14. Não fazer Health fan-out

Especialmente no BFF, eu **não faria**:

```text
GET /health
    │
    ├── Operations /health
    ├── Clinical /health
    ├── Billing /health
    └── Database ping
```

Isso parece conveniente, mas é ruim para nosso cenário.

Transforma:

```text
1 health request
```

em:

```text
4+ requests
```

e cria dependência em cascata.

No Cloudflare Free isso também consome requisições desnecessariamente.

O Health local deve responder:

```text
"este Worker está vivo"
```

e não:

```text
"todo o sistema mundial está saudável"
```

---

# 15. Liveness primeiro

Nesta PR eu faria somente **liveness**.

```text
GET /health
```

significa:

```text
Worker carregou
Nest bootstrap ocorreu
router responde
runtime está funcional
```

Resultado:

```json
{
  "status": "ok",
  "service": "billing-worker",
  "version": "development"
}
```

Não precisa consultar D1.

---

# 16. Não testar banco no `/health`

Especialmente importante considerando a preocupação anterior de não sobrecarregar comunicação com banco.

Evitar:

```text
GET /health
 ↓
SELECT 1
 ↓
D1
```

a cada probe.

Isso gera:

```text
health traffic
      ↓
database traffic
```

sem valor para liveness.

A arquitetura está sendo segmentada justamente para limitar acoplamento e pressão sobre a persistência.

---

# 17. Readiness será outra preocupação

Quando realmente necessário, poderemos adicionar posteriormente:

```text
GET /health/ready
```

Mas com semântica distinta.

```text
/health
    =
process/runtime alive


/health/ready
    =
capacidade de atender determinada classe de operação
```

Ainda assim, não colocaria readiness profundo neste PR.

Primeiro:

```text
PR-00
Health/liveness
```

Mais tarde:

```text
Observability/Operational readiness
```

---

# 18. Health não precisa de banco

Portanto o fluxo da primeira etapa será:

```text
HTTP
 ↓
HealthController
 ↓
response
```

e não:

```text
HTTP
 ↓
HealthController
 ↓
HealthService
 ↓
Repository
 ↓
D1
```

Essa distinção é importante para preservar custo e responsabilidade.

---

# 19. Health não precisa de tenant

Outro detalhe importante:

```text
GET /health
```

não deve depender de:

```text
TenantGuard
AuthenticationGuard
PermissionGuard
```

O endpoint precisa estar disponível para infraestrutura.

Mas deve permanecer extremamente limitado.

---

# 20. Health não deve gerar auditoria

Também não:

```text
GET /health
→ audit_event
```

Porque auditoria é para:

```text
appointment.created
deposit.confirmed
session.completed
payment.refunded
```

e outros fatos de negócio.

Health é telemetria técnica.

A arquitetura distingue claramente rastreabilidade/auditoria de infraestrutura e regras de negócio. 

---

# 21. Health e observabilidade

Aqui, sim, existe relação.

O Worker deve estar instrumentado com:

```text
@nestjs/observe
```

Mas eu excluiria `/health` de tracing detalhado quando a configuração permitir:

```ts
http: {
  ignore: ['/health'],
}
```

Porque probe pode gerar ruído enorme.

O objetivo é:

```text
Business request
→ trace
```

não:

```text
health
health
health
health
health
```

ocupando a telemetria.

---

# 22. Middleware de correlation

Podemos ter:

```text
request
 ↓
RequestIdMiddleware
 ↓
CorrelationIdMiddleware
 ↓
Observability
 ↓
HealthController
```

Mas o Health não precisa produzir audit/outbox/idempotency.

---

# 23. Health como adapter inbound

Na arquitetura hexagonal, Health fica conceitualmente:

```text
Infrastructure concern

Inbound HTTP Adapter
```

e não:

```text
Domain
```

Portanto:

```text
health/
├── health.controller.ts
└── health.module.ts
```

é suficiente.

Não precisamos de:

```text
health/domain/
health/application/
health/ports/
```

porque não existe domínio de negócio chamado Health.

Essa é uma distinção importante para evitar “hexagonalização” artificial.

---

# 24. Estrutura após PR-00

Exemplo de `operations-worker`:

```text
apps/operations-worker/
└── src/
    ├── main.ts
    │
    ├── app.module.ts
    │
    └── health/
        ├── health.controller.ts
        ├── health.controller.spec.ts
        └── health.module.ts
```

E as futuras capacidades serão inseridas depois:

```text
src/
├── health/
│
├── customers/
├── professionals/
├── services/
└── appointments/
```

---

# 25. Sanitização de routes

Depois da remoção, execute novamente:

```bash
grep -R "@Get(" apps 2>/dev/null || true
grep -R "@Post(" apps 2>/dev/null || true
grep -R "@Put(" apps 2>/dev/null || true
grep -R "@Patch(" apps 2>/dev/null || true
grep -R "@Delete(" apps 2>/dev/null || true
```

Resultado desejado nesta etapa:

```text
@Get()
HealthController
```

e nenhum endpoint de negócio, **caso realmente estejamos zerando o scaffold antes da implementação funcional**.

---

# 26. Sanitização de providers

Procure:

```bash
grep -R "@Injectable()" apps 2>/dev/null
```

Investigue:

```text
AppService
ExampleService
MockService
TestService
DemoService
```

Não remova automaticamente providers estruturais reais.

---

# 27. Sanitização de imports

Depois de remover files:

```bash
npm run build
```

Isso geralmente revela:

```text
Cannot find module AppService
Cannot find module AppController
```

Ajuste `app.module.ts`.

Antes:

```ts
@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

Depois:

```ts
@Module({
  imports: [
    HealthModule,
  ],
})
export class AppModule {}
```

---

# 28. Sanitização de dependências

Não sairia removendo packages nessa PR só porque ainda não são usados.

Mas executaria:

```bash
npm ls --depth=0
```

e avaliaria:

```text
dependency realmente utilizada
dependency futura já aprovada
dependency abandonada
dependency scaffold
```

Remoção de dependência deve ser consciente.

---

# 29. Sanitização de variáveis

Inspecionar:

```bash
find . -name ".env*" -type f -print
```

e:

```bash
grep -R "process.env" apps libs src 2>/dev/null || true
```

Eliminar referências a variáveis abandonadas, mas preservar configuração necessária para:

```text
Cloudflare
Observe
Database
Application identity
```

Nunca colocar segredo no Health.

---

# 30. Sanitização do Wrangler

Inspecionar:

```bash
find . -name "wrangler.toml" -o -name "wrangler.jsonc"
```

e depois:

```bash
npx wrangler types
```

No fim:

```bash
npx wrangler deploy --dry-run
```

Não realizar:

```bash
npx wrangler deploy
```

nesta PR.

---

# 31. Health e versionamento

Eu permitiria:

```json
{
  "status": "ok",
  "service": "operations-worker",
  "version": "local"
}
```

Em produção:

```text
version = git SHA/build version
```

Mas sem falhar caso `GIT_SHA` não exista localmente.

Por exemplo:

```ts
version:
  process.env.APP_VERSION ??
  'development'
```

---

# 32. Contrato recomendado

Mais precisamente:

```ts
type HealthStatus = 'ok';

interface HealthResponse {
  status: HealthStatus;
  service: string;
  version: string;
}
```

Nada além disso no PR inicial.

---

# 33. Health test

Se o controller for puro:

```ts
describe('HealthController', () => {
  it('should report worker as healthy', () => {
    const result = controller.health();

    expect(result).toEqual({
      status: 'ok',
      service: 'operations-worker',
      version: expect.any(String),
    });
  });
});
```

Depois criar E2E:

```text
GET /health
→ 200
```

---

# 34. Não usar banco em teste de Health

O teste também deve funcionar:

```text
sem PostgreSQL
sem D1
sem KV
sem R2
```

Isso comprova que é uma verificação de liveness.

---

# 35. Não inicializar módulos de domínio só para Health

Outro ponto relevante para Worker Free.

Se possível:

```text
Health request
```

não deve exigir:

```text
carregar catálogo
carregar repository
fazer migration
aquecer cache
buscar tenant
```

O bootstrap pode carregar composição da aplicação, mas a própria operação de Health deve ser mínima.

---

# 36. Ordem de sanitização recomendada

Eu seguiria:

```text
PR-00.1
Inventory

PR-00.2
Remove scaffold endpoint

PR-00.3
Remove scaffold service

PR-00.4
Clean AppModule

PR-00.5
Generate HealthModule

PR-00.6
Generate HealthController

PR-00.7
Add observability baseline

PR-00.8
Add tests

PR-00.9
Validate Workers

PR-00.10
Freeze baseline
```

---

# 37. Passo a passo operacional

### 1. Analisar

```bash
git status
git branch --show-current
find apps -maxdepth 5 -type f | sort
```

### 2. Localizar scaffold

```bash
find apps -name "app.controller.ts"
find apps -name "app.service.ts"
find apps -name "app.controller.spec.ts"
```

### 3. Inspecionar

```bash
cat apps/operations-worker/src/app.controller.ts
cat apps/operations-worker/src/app.service.ts
cat apps/operations-worker/src/app.module.ts
```

### 4. Remover apenas scaffold comprovado

```bash
rm apps/operations-worker/src/app.controller.ts
rm apps/operations-worker/src/app.controller.spec.ts
rm apps/operations-worker/src/app.service.ts
```

### 5. Criar Health

```bash
nest g module health --project operations-worker
nest g controller health --project operations-worker
```

### 6. Ajustar AppModule

Somente:

```text
HealthModule
+
fundação transversal já aprovada
```

### 7. Testar

```bash
npm run lint
npm run test
nest build operations-worker
```

### 8. Cloudflare

```bash
npx wrangler types
npx wrangler deploy --dry-run
```

### 9. Revisar

```bash
git status

git diff --stat

git diff
```

---

# 38. Repetir por Worker

Somente após o primeiro baseline estar correto.

```bash
nest g module health --project bff-worker
nest g controller health --project bff-worker

nest g module health --project clinical-worker
nest g controller health --project clinical-worker

nest g module health --project billing-worker
nest g controller health --project billing-worker

nest g module health --project async-worker
nest g controller health --project async-worker
```

Mas evite copiar e colar grandes implementações.

Se a implementação começar a crescer, aí sim extraímos um contrato/common helper.

---

# 39. O que eu não colocaria no PR-00

Não misturaria sanitização com:

```text
Customers
Appointments
Professionals
Services
Sessions
Payments
D1 repositories
R2 upload
KV
Auth completo
RBAC completo
Outbox consumer
Cron
```

Mesmo essas funcionalidades fazendo parte real do MVP. O produto efetivamente precisa de agenda, sinal, histórico, sessão, pagamentos e demais fluxos, mas isso deve ser introduzido incrementalmente depois da fundação.

---

# 40. Definition of Done do PR-00

Eu congelaria exatamente este checklist:

```text
[ ] inventário do código realizado

[ ] nenhum endpoint removido sem inspeção

[ ] AppController scaffold removido

[ ] AppService scaffold removido

[ ] Hello World removido

[ ] endpoints mock/demo removidos

[ ] AppModule limpo

[ ] HealthModule criado via Nest CLI

[ ] HealthController criado via Nest CLI

[ ] GET /health retorna 200

[ ] health não acessa banco

[ ] health não acessa KV

[ ] health não acessa R2

[ ] health não exige tenant

[ ] health não exige autenticação

[ ] health não gera AuditEvent

[ ] health não gera OutboxEvent

[ ] health não usa Idempotency

[ ] health não faz fan-out

[ ] health não expõe configuração sensível

[ ] health identificado por Worker

[ ] observabilidade configurada

[ ] /health excluído de tracing ruidoso quando apropriado

[ ] unit tests PASS

[ ] lint PASS

[ ] build PASS

[ ] wrangler types PASS

[ ] wrangler dry-run PASS

[ ] diff final revisado
```

## Estado arquitetural esperado

Ao fechar essa sanitização, teremos:

```text
Cloudflare
    │
    ▼
Worker
    │
    ▼
NestJS Bootstrap
    │
    ├── Config
    ├── Observability
    └── Health
          │
          ▼
      GET /health
```

e **não ainda**:

```text
Worker
├── Customers
├── Appointments
├── Billing
├── Clinical
└── ...
```

Depois disso, cada PR poderá introduzir verticalmente uma capacidade real:

```text
HTTP Adapter
    ↓
Application
    ↓
Domain
    ↓
Port
    ↓
Adapter
```

Essa abordagem é particularmente adequada para este projeto porque as regras funcionais reais são numerosas e críticas — multi-tenancy, histórico imutável, sinal independente da presença, idempotência, rastreabilidade e estados próprios de agendamento/sessão.  Começar a nova arquitetura sobre um runtime limpo reduz bastante a possibilidade de reaproveitar acidentalmente handlers ou services incompatíveis com essas fronteiras.

**Portanto: sim, eu faria a sanitização antes do PR-01 funcional, mas trataria a remoção como cirúrgica: limpar scaffold/demo e preservar qualquer fundação ou domínio já válido. O primeiro contrato público de cada Worker seria apenas `GET /health`, barato, sem banco e sem fan-out.**
