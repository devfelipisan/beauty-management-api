# PR-00 — Sanitização Arquitetural e Health Baseline

## Papel

Atue como Engenheiro de Software Sênior e Arquiteto de Soluções especialista em:

- Node.js;
- TypeScript;
- NestJS;
- Cloudflare Workers;
- arquitetura hexagonal;
- Clean Architecture;
- DDD pragmático;
- SOLID;
- observabilidade;
- sistemas multi-tenant;
- segurança;
- CI/CD;
- Cloudflare Free Tier.

Você está trabalhando no projeto:

`beauty-management-api`

A arquitetura oficial é:

Frontend
  ↓
BFF Worker
  ↓
Business Workers
  ↓
Application
  ↓
Domain
  ↓
Ports
  ↓
Infrastructure

A Business API é a única autoridade de negócio.

Não mover regra de negócio para:

- Controller;
- Middleware;
- Guard;
- Interceptor;
- BFF;
- Infrastructure.

Domain não pode depender de NestJS, Cloudflare, D1, KV ou R2.

---

# Objetivo desta tarefa

Executar SOMENTE o PR-00:

**Sanitização arquitetural + Health Baseline**

Objetivos:

1. inspecionar o estado real do repositório;
2. identificar endpoints/controllers/services de scaffold, demo ou mock temporário;
3. remover apenas artefatos sem responsabilidade arquitetural real;
4. preservar código funcional e infraestrutura válida;
5. deixar cada Worker em baseline mínimo;
6. criar `HealthModule`;
7. criar `HealthController`;
8. expor somente `GET /health` como endpoint inicial da sanitização;
9. garantir observabilidade básica;
10. garantir build/test/lint;
11. validar Wrangler sem fazer deploy;
12. parar.

Não implementar:

- Customers;
- Professionals;
- Services;
- Appointments;
- Deposits;
- Sessions;
- Billing;
- D1 repositories;
- R2;
- KV;
- autenticação completa;
- autorização de negócio;
- outbox consumer;
- cron;
- novas regras funcionais.

---

# Fonte de verdade

Antes de modificar qualquer arquivo, leia nesta ordem:

1. requisito desta tarefa;
2. `AGENTS.md`;
3. `README.md`;
4. `docs/business-rules.md`;
5. `docs/adr/*`;
6. `docs/architecture.md`;
7. documentação relacionada a Workers/observabilidade;
8. código real;
9. testes;
10. configuração Wrangler.

Não assumir que um arquivo é descartável apenas pelo nome.

Não remover endpoint funcional real sem inspeção.

---

# Regra principal da sanitização

Sanitização NÃO significa apagar o backend.

Sanitização significa:

- remover scaffold;
- remover Hello World;
- remover demo;
- remover endpoint temporário;
- remover service sem responsabilidade real;
- remover wiring morto;
- preservar fundação válida;
- preservar domínio válido;
- preservar testes válidos;
- preservar migrations/configuração;
- preservar observabilidade;
- preservar contratos úteis.

Classifique antes de remover.

---

# PASSO 1 — Verificar estado do Git

Execute:

```bash
pwd
git status
git branch --show-current
git log -10 --oneline
````

Se houver alterações locais não relacionadas:

* não sobrescrever;
* não resetar;
* não apagar;
* registrar no relatório.

Não usar:

```bash
git reset --hard
git clean -fd
```

---

# PASSO 2 — Inspecionar estrutura

Execute:

```bash
find . -maxdepth 3 -type f | sort
```

Depois:

```bash
find apps -maxdepth 5 -type f | sort 2>/dev/null || true
find libs -maxdepth 5 -type f | sort 2>/dev/null || true
find src -maxdepth 5 -type f | sort 2>/dev/null || true
```

Leia:

```bash
cat package.json
cat nest-cli.json
cat tsconfig.json
```

Quando existirem:

```bash
cat wrangler.toml
cat wrangler.jsonc
```

Não alterar ainda.

---

# PASSO 3 — Inventário de endpoints

Execute:

```bash
find . -type f -name "*.controller.ts" | sort
```

Procure decorators HTTP:

```bash
grep -R "@Get(" apps libs src 2>/dev/null || true
grep -R "@Post(" apps libs src 2>/dev/null || true
grep -R "@Put(" apps libs src 2>/dev/null || true
grep -R "@Patch(" apps libs src 2>/dev/null || true
grep -R "@Delete(" apps libs src 2>/dev/null || true
```

Criar mentalmente uma tabela:

| Endpoint        | Arquivo           | Tipo           | Ação                |
| --------------- | ----------------- | -------------- | ------------------- |
| `/`             | app.controller.ts | scaffold       | remover             |
| `/example`      | ...               | demo           | remover             |
| `/appointments` | ...               | funcional      | preservar/revisar   |
| `/health`       | ...               | infraestrutura | preservar/refatorar |

Não remover nada antes dessa classificação.

---

# PASSO 4 — Inventário de Services

Execute:

```bash
find . -type f -name "*.service.ts" | sort
```

Procure:

```bash
grep -R "@Injectable()" apps libs src 2>/dev/null || true
```

Inspecionar especialmente:

* `AppService`;
* `ExampleService`;
* `DemoService`;
* `MockService`;
* services que somente retornam string;
* services sem consumidor real.

Classificar:

```text
scaffold
demo
infraestrutura
application service
domínio real
```

Remover somente scaffold/demo comprovado.

---

# PASSO 5 — Inventário de Modules

Execute:

```bash
find . -type f -name "*.module.ts" | sort
```

Inspecionar todos os `AppModule`.

Identificar:

* controllers registrados;
* providers registrados;
* imports reais;
* módulos mortos;
* dependências transitórias.

Não manter `AppController` ou `AppService` apenas porque foram criados pelo Nest CLI.

---

# PASSO 6 — Identificar scaffold padrão

Se existir algo equivalente a:

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

e:

```ts
@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
```

classificar como:

```text
SCAFFOLD
```

Remover.

Também remover o spec correspondente se testar exclusivamente o scaffold removido.

---

# PASSO 7 — Remover scaffold de forma cirúrgica

Exemplo, somente se confirmado:

```bash
rm apps/operations-worker/src/app.controller.ts
rm apps/operations-worker/src/app.controller.spec.ts
rm apps/operations-worker/src/app.service.ts
```

Executar apenas para arquivos realmente existentes e previamente inspecionados.

Não usar glob destrutivo.

Não fazer:

```bash
rm -rf apps/*
```

---

# PASSO 8 — Limpar AppModule

Antes:

```ts
@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

Depois da sanitização:

```ts
@Module({
  imports: [],
})
export class AppModule {}
```

temporariamente, até gerar o Health.

Preservar imports transversais válidos já existentes, por exemplo:

* ConfigModule;
* ObservabilityModule;
* infraestrutura validada.

Não remover fundação válida.

---

# PASSO 9 — Validar build após remoção

Antes de criar Health, execute:

```bash
npm run build
```

ou, se for monorepo Nest:

```bash
nest build bff-worker
nest build operations-worker
nest build clinical-worker
nest build billing-worker
nest build async-worker
```

Corrigir apenas imports/wiring quebrados pela sanitização.

Não implementar funcionalidade nova para "fazer build passar".

---

# PASSO 10 — Criar Health via Nest CLI

Usar obrigatoriamente Nest CLI.

Para `bff-worker`:

```bash
nest g module health --project bff-worker
nest g controller health --project bff-worker
```

Para `operations-worker`:

```bash
nest g module health --project operations-worker
nest g controller health --project operations-worker
```

Para `clinical-worker`:

```bash
nest g module health --project clinical-worker
nest g controller health --project clinical-worker
```

Para `billing-worker`:

```bash
nest g module health --project billing-worker
nest g controller health --project billing-worker
```

Para `async-worker`:

```bash
nest g module health --project async-worker
nest g controller health --project async-worker
```

Após cada comando:

```bash
git diff --stat
```

e inspecionar os arquivos gerados.

---

# PASSO 11 — Não criar HealthService sem necessidade

Não executar:

```bash
nest g service health
```

somente para retornar `"ok"`.

O Health inicial é liveness técnico.

Controller simples é suficiente.

Criar Service apenas se surgir responsabilidade real posteriormente.

---

# PASSO 12 — Implementar contrato mínimo do Health

Cada Worker deve responder:

```http
GET /health
```

Resposta:

```json
{
  "status": "ok",
  "service": "operations-worker",
  "version": "development"
}
```

Estrutura sugerida:

```ts
@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok' as const,
      service: 'operations-worker',
      version:
        process.env.APP_VERSION ??
        'development',
    };
  }
}
```

Ajustar o nome do `service` por Worker.

---

# PASSO 13 — Não acessar banco no Health

É proibido nesta etapa:

```text
GET /health
→ SELECT 1
```

Também proibido:

```text
GET /health
→ D1
→ KV
→ R2
→ Service Binding
```

O `/health` é liveness.

Ele responde apenas:

```text
runtime carregou
Nest bootstrap ocorreu
router responde
```

---

# PASSO 14 — Não adicionar autenticação ao Health

Não aplicar:

* AuthenticationGuard;
* TenantGuard;
* PermissionGuard.

O Health precisa ser simples e acessível à infraestrutura.

Não retornar informações sensíveis.

---

# PASSO 15 — Não criar auditoria/outbox/idempotência

`GET /health` não deve:

* criar AuditEvent;
* criar OutboxEvent;
* reservar idempotency key;
* acessar UnitOfWork.

Health é observabilidade técnica.

Auditoria é rastreabilidade de negócio.

---

# PASSO 16 — Integrar HealthModule

Cada `AppModule` deve importar o Health:

```ts
@Module({
  imports: [
    HealthModule,
  ],
})
export class AppModule {}
```

Se já houver:

```ts
ConfigModule
ObservabilityModule
```

preservar:

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

Não adicionar módulos funcionais nesta PR.

---

# PASSO 17 — Observabilidade

Verificar se já existe `@nestjs/observe`.

Execute:

```bash
npm ls @nestjs/observe
```

Se não estiver instalado e a fundação definida exigir nesta PR:

```bash
npm i @nestjs/observe
```

Não inventar configuração.

Seguir a documentação já adotada pelo projeto:

```ts
createObserveModule({
  // trace id generation
  // error source context
})
```

e:

```ts
ObserveModule.forRoot({
  // remaining configuration
})
```

Preservar:

* requestId;
* correlationId;
* traceId;
* service;
* version.

---

# PASSO 18 — Excluir Health de tracing ruidoso

Quando suportado pela configuração existente:

```ts
http: {
  ignore: ['/health'],
}
```

Objetivo:

```text
health probe
≠
business trace
```

Não gerar volume inútil de telemetria.

---

# PASSO 19 — Garantir ausência de PII

Health não pode retornar:

* tenant;
* user;
* email;
* phone;
* CPF;
* tokens;
* database URL;
* secret;
* environment dump;
* Cloudflare binding names sensíveis.

Também não logar esses dados.

---

# PASSO 20 — Teste unitário do Health

Manter/criar teste gerado pela CLI.

Exemplo:

```ts
describe('HealthController', () => {
  it('should return health information', () => {
    const result = controller.getHealth();

    expect(result).toEqual({
      status: 'ok',
      service: 'operations-worker',
      version: expect.any(String),
    });
  });
});
```

Adaptar para cada Worker.

---

# PASSO 21 — E2E quando infraestrutura permitir

Se já existir estrutura E2E:

```bash
npm run test:e2e
```

Adicionar cenário:

```text
GET /health
→ HTTP 200
```

Não criar infraestrutura E2E gigantesca apenas para esta PR se o projeto ainda não tiver base.

Registrar a pendência.

---

# PASSO 22 — Validar novamente os endpoints

Execute:

```bash
grep -R "@Get(" apps 2>/dev/null || true
grep -R "@Post(" apps 2>/dev/null || true
grep -R "@Put(" apps 2>/dev/null || true
grep -R "@Patch(" apps 2>/dev/null || true
grep -R "@Delete(" apps 2>/dev/null || true
```

Esperado no baseline sanitizado:

```text
GET /health
```

e nenhum endpoint demo/scaffold.

Se endpoints funcionais reais foram preservados, documentar explicitamente por que não foram removidos.

---

# PASSO 23 — Validar Providers

Execute novamente:

```bash
grep -R "@Injectable()" apps libs src 2>/dev/null || true
```

Confirmar que não restaram:

* HelloWorldService;
* AppService sem função;
* DemoService;
* Provider morto.

Não remover providers de infraestrutura real.

---

# PASSO 24 — Validar imports mortos

Execute:

```bash
npm run lint
```

Corrigir:

* unused imports;
* dead providers;
* broken module references.

Não realizar refatoração ampla.

---

# PASSO 25 — Validar todos os testes

Execute:

```bash
npm run test
```

Se houver scripts específicos:

```bash
npm run test:unit
npm run test:e2e
```

Não declarar PASS sem executar.

---

# PASSO 26 — Validar builds por Worker

Executar:

```bash
nest build bff-worker
nest build operations-worker
nest build clinical-worker
nest build billing-worker
nest build async-worker
```

Registrar o resultado individual:

```text
bff-worker        PASS
operations-worker PASS
clinical-worker   PASS
billing-worker    PASS
async-worker      PASS
```

Se algum Worker ainda não existir, não inventar.

Registrar como:

```text
NOT PRESENT
```

---

# PASSO 27 — Validar Cloudflare

Localizar configurações:

```bash
find . -name "wrangler.toml" -o -name "wrangler.jsonc"
```

Executar quando aplicável:

```bash
npx wrangler types
```

Depois:

```bash
npx wrangler deploy --dry-run
```

Não executar:

```bash
npx wrangler deploy
```

Não criar recurso remoto.

Não alterar produção.

---

# PASSO 28 — Verificar dependências

Execute:

```bash
npm ls --depth=0
```

Não remover automaticamente dependências sem uso aparente.

Classificar:

```text
usada
planejada/aprovada
obsoleta
incerta
```

Remover apenas dependência inequivocamente associada ao scaffold eliminado e sem uso real.

---

# PASSO 29 — Verificar variáveis de ambiente

Execute:

```bash
find . -name ".env*" -type f -print
```

Depois:

```bash
grep -R "process.env" apps libs src 2>/dev/null || true
```

Não remover credenciais necessárias à fundação.

Não adicionar secrets ao código.

Não expor envs no Health.

---

# PASSO 30 — Revisão arquitetural

Antes de finalizar, confirmar:

```text
Health
→ HTTP adapter técnico
→ sem Application
→ sem Domain
→ sem Repository
→ sem Database
```

Isso é intencional.

Não criar:

```text
health/domain
health/application
health/repository
```

Hexagonal Architecture não exige camadas artificiais onde não existe domínio.

---

# PASSO 31 — Verificar Cloudflare Free

Avaliar impacto:

```text
Worker request:
1 / health probe

D1 reads:
0

D1 writes:
0

KV reads:
0

KV writes:
0

R2:
0
```

Classificar:

```text
Workers requests: OK
D1 reads: OK
D1 writes: OK
KV: OK
R2: OK
```

Não implementar health fan-out.

---

# PASSO 32 — Não fazer health agregado no BFF

Proibido:

```text
GET /health
├── operations /health
├── clinical /health
├── billing /health
└── async /health
```

Cada Worker reporta apenas sua própria liveness.

Se futuramente houver status global, criar endpoint/serviço específico e documentado, não reutilizar `/health`.

---

# PASSO 33 — Diff final

Execute:

```bash
git status
git diff --stat
git diff
```

Inspecionar completamente.

Remover:

* logs temporários;
* comentários temporários;
* arquivo demo;
* import morto;
* código comentado;
* TODO sem contexto;
* secret;
* artefato gerado acidentalmente.

---

# PASSO 34 — Definition of Done

A tarefa só pode ser marcada como concluída quando:

```text
[ ] inventário de endpoints realizado
[ ] inventário de services realizado
[ ] inventário de modules realizado

[ ] scaffold identificado antes da remoção
[ ] AppController demo removido
[ ] AppService demo removido
[ ] Hello World removido

[ ] nenhum endpoint funcional removido sem análise

[ ] AppModule sanitizado

[ ] HealthModule criado via Nest CLI
[ ] HealthController criado via Nest CLI

[ ] GET /health retorna 200
[ ] resposta contém status
[ ] resposta contém service
[ ] resposta contém version

[ ] health não acessa D1
[ ] health não acessa KV
[ ] health não acessa R2
[ ] health não faz Service Binding
[ ] health não exige tenant
[ ] health não exige auth
[ ] health não cria audit
[ ] health não cria outbox
[ ] health não usa idempotency

[ ] nenhuma informação sensível exposta

[ ] observabilidade preservada
[ ] /health não polui tracing quando possível

[ ] lint PASS
[ ] tests PASS
[ ] builds PASS
[ ] wrangler types PASS quando aplicável
[ ] wrangler dry-run PASS quando aplicável

[ ] Cloudflare Free impact avaliado
[ ] git diff revisado
```

---

# PASSO 35 — Relatório obrigatório

Ao terminar, responder exatamente com as seções:

## PR-00 executado

Sanitização Arquitetural + Health Baseline.

## Estado encontrado

Informar:

* Workers existentes;
* Controllers encontrados;
* Services encontrados;
* endpoints existentes;
* scaffold identificado;
* endpoints funcionais preservados.

## Removido

Listar arquivos efetivamente removidos.

Não listar o que não foi alterado.

## Preservado

Listar componentes importantes mantidos:

* config;
* observability;
* contracts;
* database foundation;
* migrations;
* business code.

## Criado

Listar:

* HealthModule;
* HealthController;
* testes.

## Endpoints finais

Exemplo:

```text
bff-worker
GET /health

operations-worker
GET /health

clinical-worker
GET /health

billing-worker
GET /health

async-worker
GET /health
```

## Arquitetura resultante

```text
Worker
 ↓
Nest bootstrap
 ↓
Config / Observability
 ↓
HealthModule
 ↓
GET /health
```

## Banco

Informar:

```text
D1 reads: 0
D1 writes: 0
```

por requisição de Health.

## Observabilidade

Informar:

* trace correlation;
* requestId;
* correlationId;
* health ignore/sampling;
* ausência de PII.

## Testes

Informar os resultados reais:

```text
npm run lint                        PASS/FAIL
npm run test                        PASS/FAIL
nest build bff-worker              PASS/FAIL
nest build operations-worker       PASS/FAIL
nest build clinical-worker         PASS/FAIL
nest build billing-worker          PASS/FAIL
nest build async-worker            PASS/FAIL
npx wrangler types                 PASS/FAIL
npx wrangler deploy --dry-run      PASS/FAIL
```

Não inventar resultados.

## Cloudflare Free

Classificar:

```text
Workers requests: OK / ATTENTION / RISK
D1 reads: OK / ATTENTION / RISK
D1 writes: OK / ATTENTION / RISK
KV: OK / ATTENTION / RISK
R2: OK / ATTENTION / RISK
```

## Pendências

Somente pendências reais.

## Próxima etapa recomendada

Sugerir somente uma:

`PR-01 — Foundation / Worker Skeleton`

ou equivalente conforme o estado real.

NÃO implementar a próxima etapa.

---

# Regra final

Execute exclusivamente o PR-00.

Não implementar domínio.

Não implementar endpoints funcionais.

Não criar banco.

Não criar CRUD.

Não fazer deploy.

Não avançar automaticamente.

Fluxo obrigatório:

inspect
→ classify
→ sanitize
→ generate health
→ test
→ review
→ report
→ STOP

````

Você pode guardar esse conteúdo, por exemplo, como:

```text
.codex/PR-00-sanitize-health.md
````

e invocar o Codex com uma instrução curta:

```text
Leia integralmente:

AGENTS.md
.codex/persona.md
.codex/implementation-policy.md
.codex/PR-00-sanitize-health.md

Execute somente o PR-00.

Não avance para nenhum outro PR.
```