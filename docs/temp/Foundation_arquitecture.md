Após o **PR-00 — Sanitização Arquitetural + Health Baseline**, eu ajustaria a numeração do roadmap para evitar repetir trabalho que o PR-00 já fez.

O próximo PR deveria ser:

# PR-01 — Foundation Arquitetural e Runtime dos Workers

O objetivo não é implementar `Customer`, `Appointment`, `Payment` ou qualquer regra funcional ainda. O objetivo é estabelecer a fundação compartilhada sobre a qual todos os Workers serão construídos.

A documentação técnica já exige separação entre interface, aplicação, domínio e infraestrutura, com o domínio independente de NestJS/Cloudflare e dependências externas implementadas por ports/adapters.  Além disso, o sistema precisa preservar desde o início multi-tenancy, rastreabilidade, congelamento histórico e idempotência.

## Sequência revisada

Com a introdução do PR-00, eu congelaria o roadmap assim:

```text
PR-00
Sanitização + Health Baseline
        ↓
PR-01
Foundation Arquitetural + Worker Runtime
        ↓
PR-02
Observabilidade + Execution Context
        ↓
PR-03
Tenancy + Authentication Foundation
        ↓
PR-04
Database Port + D1 Adapter
        ↓
PR-05
Operations Foundation
Tenant / Professional / Service / Customer
        ↓
PR-06
Scheduling / Appointment
        ↓
PR-07
Billing
        ↓
PR-08
Clinical
        ↓
PR-09
R2 / Files
        ↓
PR-10
BFF
        ↓
PR-11
Outbox / Async
        ↓
PR-12
Read Models
        ↓
PR-13
KV / Cache
        ↓
PR-14
Free Tier Hardening
```

Ou seja, o antigo `PR-01 — criar skeleton dos Workers` deixa de fazer sentido caso o PR-00 já tenha criado/sanitizado os cinco Workers e seus `/health`.

---

# O que o PR-01 deve resolver

Depois do PR-00 temos aproximadamente:

```text
bff-worker
  └── Health

operations-worker
  └── Health

clinical-worker
  └── Health

billing-worker
  └── Health

async-worker
  └── Health
```

Mas ainda não temos uma base arquitetural normativa para construir domínio.

O PR-01 transforma isso em:

```text
                    WORKERS
                       │
                Nest Composition
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
     Config         Kernel        Contracts
                       │
                  Application
                       │
                     Domain
```

sem implementar qualquer domínio funcional.

---

# 1. Objetivo formal

Eu documentaria:

```text
PR-01 — Foundation Arquitetural e Runtime dos Workers

Objetivo:

Estabelecer os componentes mínimos compartilhados necessários para
que futuros bounded contexts sejam implementados consistentemente,
sem acoplamento entre Domain/Application e NestJS/Cloudflare.
```

---

# 2. Criar libraries fundamentais

Primeiramente verificar o que já existe.

Depois, somente quando ausente:

```bash
nest g library kernel
nest g library contracts
nest g library config
nest g library testing
```

Estrutura esperada:

```text
libs/
├── kernel/
├── contracts/
├── config/
└── testing/
```

Não criar ainda:

```text
database
storage
audit
outbox
idempotency
authentication
tenancy
```

separadamente se esses temas serão tratados nos PRs seguintes.

Isso mantém o escopo pequeno.

---

# 3. `kernel`

O Kernel deve conter apenas primitives realmente compartilháveis.

Por exemplo:

```text
libs/kernel/src/
├── domain/
│   ├── entity.ts
│   ├── aggregate-root.ts
│   ├── value-object.ts
│   ├── domain-error.ts
│   ├── result.ts
│   └── entity-id.ts
│
└── application/
    ├── use-case.ts
    └── clock.ts
```

Mas com uma regra importante:

> `kernel` não vira depósito de coisas genéricas.

Não colocar nele:

```text
Appointment
Payment
Customer
Session
DiscountPolicy
```

---

# 4. Domain completamente independente do NestJS

Esse PR deve estabelecer uma regra testável:

```text
libs/kernel/domain
```

não pode importar:

```text
@nestjs/common
@nestjs/core
cloudflare
D1Database
KVNamespace
R2Bucket
wrangler
```

Portanto não teremos:

```ts
@Injectable()
export class Entity {}
```

nem:

```ts
@Inject()
```

em domínio puro.

---

# 5. Entity base

Se realmente necessária ao código atual:

```bash
nest g class domain/entity --project kernel --no-spec
```

Conceitualmente:

```ts
export abstract class Entity<TId> {
  protected constructor(
    public readonly id: TId,
  ) {}
}
```

Evite uma classe base gigantesca com:

```text
createdAt
updatedAt
tenantId
version
audit
events
```

obrigatórios para tudo.

Nem toda entity precisa desses atributos.

---

# 6. Value Object

Criar via CLI:

```bash
nest g class domain/value-object --project kernel --no-spec
```

Mas manter minimalista.

Por exemplo:

```ts
export abstract class ValueObject<T> {
  protected constructor(
    protected readonly props: T,
  ) {}
}
```

Ou nem criar essa abstração caso não exista uso concreto imediato.

Este PR deve evitar arquitetura cerimonial.

---

# 7. DomainError

Esse é mais útil.

```bash
nest g class domain/domain-error --project kernel --no-spec
```

Por exemplo:

```ts
export abstract class DomainError extends Error {
  protected constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
```

Depois poderão existir:

```text
AppointmentTimeConflictError
InvalidSessionTransitionError
PaymentAlreadyRefundedError
```

nos respectivos bounded contexts.

---

# 8. Result

Se o projeto já adota exceptions como estratégia, não introduzir `Result` só por preferência.

Se houver decisão arquitetural por `Result`, gerar:

```bash
nest g class domain/result --project kernel --no-spec
```

Esse é exatamente o tipo de ponto que o Codex deve verificar no estado real antes de implementar.

---

# 9. EntityId

Definir estratégia comum.

Preferencialmente:

```text
string
```

com geração no boundary adequado.

Por exemplo:

```ts
export type EntityId = string;
```

Não acoplar a:

```text
UUID PostgreSQL
D1 rowid
Cloudflare identifier
```

---

# 10. Clock

Esse é um Port legítimo e útil.

```bash
nest g interface application/clock --project kernel
```

Contrato:

```ts
export interface Clock {
  now(): Date;
}
```

Depois:

```text
SystemClock
FakeClock
```

Isso evita:

```ts
new Date()
```

espalhado em regras temporais testáveis.

---

# 11. UseCase

Se for útil para padronização:

```bash
nest g interface application/use-case --project kernel
```

Exemplo:

```ts
export interface UseCase<Input, Output> {
  execute(input: Input): Promise<Output>;
}
```

Mas não obrigar queries/read-models a seguir esse contrato se isso piorar a API.

---

# 12. Contracts

Criar:

```bash
nest g library contracts
```

Esse pacote servirá futuramente para contratos de transporte compartilháveis.

Mas no PR-01 eu criaria apenas a infraestrutura:

```text
libs/contracts/src/
├── common/
└── index.ts
```

Não inventar agora:

```text
CreateAppointmentRequest
PaymentResponse
CustomerDto
```

porque esses contratos pertencem aos PRs funcionais.

---

# 13. O que `contracts` não pode conter

Não colocar:

```text
Domain Entity
Repository
UseCase
StateMachine
Cloudflare binding
D1 type
```

Contracts devem ser:

```text
DTO
schema
error contract
serialization contract
```

quando houver necessidade real.

---

# 14. Config library

Esse é um componente importante.

Criar:

```bash
nest g library config
nest g module config --project config
```

Mas o objetivo é centralizar **validação**, não expor `process.env` por toda parte.

Queremos evitar:

```ts
process.env.APP_VERSION
```

em 50 arquivos.

O desenho será:

```text
environment
    ↓
Config adapter
    ↓
ApplicationConfig
```

---

# 15. Configuração comum

Poderíamos definir:

```ts
export interface ApplicationConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;
}
```

E depois cada Worker informa sua identidade.

```text
bff-worker
operations-worker
clinical-worker
billing-worker
async-worker
```

---

# 16. Environment validation

Adicionar validação consistente.

Por exemplo com Zod, caso já aprovado no projeto:

```bash
npm install zod
```

Somente se não existir.

Exemplo conceitual:

```ts
const EnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  APP_VERSION: z
    .string()
    .default('development'),
});
```

Porém não inventar dezenas de envs ainda.

---

# 17. Worker identity

Cada Worker deve possuir identidade explícita:

```text
beauty-bff-worker
beauty-operations-worker
beauty-clinical-worker
beauty-billing-worker
beauty-async-worker
```

Essa identidade será reutilizada em:

```text
health
observability
logs
traces
deployment
```

Evitar string duplicada em vários arquivos.

---

# 18. Composition Root

O `AppModule` deve ser reconhecido formalmente como composition root.

Exemplo:

```text
AppModule
├── Config
└── Health
```

Mais tarde:

```text
OperationsAppModule
├── Config
├── Observability
├── Tenancy
├── Database
├── Customers
├── Services
└── Appointments
```

Mas ainda não neste PR.

---

# 19. Não implementar Application funcional

Ainda não criar:

```text
CreateCustomerUseCase
CreateAppointmentUseCase
ConfirmDepositUseCase
```

Neste PR só existe infraestrutura para que esses objetos possam ser adicionados corretamente depois.

---

# 20. Teste arquitetural

Este é um dos entregáveis mais importantes do PR-01.

Criar um teste que detecte violações como:

```text
kernel/domain → @nestjs/*
kernel/domain → cloudflare
kernel/application → D1
contracts → domain
```

Inicialmente, algo simples já basta.

Por exemplo:

```text
test/architecture/
└── dependency-boundaries.spec.ts
```

Ele deverá falhar caso no futuro apareça:

```ts
import { Injectable } from '@nestjs/common';
```

dentro de `domain/`.

---

# 21. Regras arquiteturais congeladas

O PR deve transformar estas regras em documentação/teste:

```text
Domain
  ↓
nenhuma dependência externa

Application
  ↓
Domain + Ports

Inbound Adapter
  ↓
Application

Outbound Adapter
  ↓
Ports + SDK externo
```

O projeto técnico já prevê justamente `interface → application → domain`, com infraestrutura implementando as portas. 

---

# 22. Não introduzir D1 ainda

Muito importante.

Não criar neste PR:

```text
D1Database
D1Repository
migrations
schema
SQL
```

Isso será:

# PR-04 — Database Port + D1 Adapter

Assim isolamos problemas.

---

# 23. Não introduzir Tenancy ainda

Também não implementar:

```text
TenantGuard
TenantContext
Membership
Permission
```

completo.

Isso será:

# PR-03 — Tenancy + Authentication Foundation

Entretanto, o Kernel não deve impedir tenant-aware APIs futuras.

A exigência multiempresa permanece uma das invariantes fundamentais do produto. 

---

# 24. Não introduzir observabilidade completa ainda

Como o PR-00 pode já ter o mínimo para Health, preserve-o.

Mas a fundação completa de:

```text
@nestjs/observe
requestId
correlationId
traceId
error source context
```

deve ficar concentrada no:

# PR-02 — Observabilidade + Execution Context

Isso evita inflar o PR-01.

---

# 25. Worker runtime

O PR-01 também deve conferir que cada Worker possui um bootstrap consistente.

Conceitualmente:

```text
Cloudflare runtime
      ↓
Worker adapter
      ↓
Nest composition
      ↓
AppModule
```

Mas não transformar o bootstrap em abstração genérica prematuramente.

Se houver duplicação pequena entre cinco Workers, pode ser aceitável nesta etapa.

---

# 26. Wranglers independentes

Cada unidade de deployment deve possuir configuração independente ou uma organização equivalente inequívoca:

```text
bff-worker
→ wrangler

operations-worker
→ wrangler

clinical-worker
→ wrangler

billing-worker
→ wrangler

async-worker
→ wrangler
```

Porque cada Worker terá deploy separado.

---

# 27. Mas não duplicar recursos do Free Tier

Wrangler separado não significa:

```text
cada Worker → seu próprio D1
cada Worker → seu próprio KV
cada Worker → seu próprio R2
```

Isso ainda não deve ser decidido neste PR.

Workers são unidades de deployment.

Infraestrutura é outra decisão.

---

# 28. Free Tier

O PR-01 não deve aumentar significativamente consumo.

Estado esperado:

```text
GET /health

Workers: 1 request
D1:      0
KV:      0
R2:      0
```

As libraries adicionadas não alteram esse comportamento.

---

# 29. Comandos principais do PR-01

Após inspeção, algo próximo de:

```bash
nest g library kernel
nest g library contracts
nest g library config
nest g library testing
```

Depois:

```bash
nest g class domain/domain-error --project kernel --no-spec
nest g interface application/use-case --project kernel
nest g interface application/clock --project kernel
```

Caso realmente aprovados:

```bash
nest g class domain/entity --project kernel --no-spec
nest g class domain/value-object --project kernel --no-spec
```

Config:

```bash
nest g module config --project config
```

Não gerar arquivos que não tenham uso definido.

---

# 30. Validação

Ao finalizar:

```bash
npm run lint
npm run test
npm run build
```

Individualmente:

```bash
nest build bff-worker
nest build operations-worker
nest build clinical-worker
nest build billing-worker
nest build async-worker
```

Cloudflare:

```bash
npx wrangler types
npx wrangler deploy --dry-run
```

Sem deploy real.

---

# Definition of Done do PR-01

```text
[ ] PR-00 permanece íntegro

[ ] nenhum endpoint funcional novo criado

[ ] kernel criado

[ ] contracts criado

[ ] config criada

[ ] testing foundation criada se necessária

[ ] Domain permanece TypeScript puro

[ ] Domain não importa NestJS

[ ] Domain não importa Cloudflare

[ ] Application não depende de D1/KV/R2

[ ] Clock Port disponível

[ ] DomainError foundation disponível

[ ] Worker identity centralizada

[ ] AppModule continua composition root

[ ] architecture tests criados

[ ] health continua funcionando

[ ] D1 ainda não introduzido

[ ] KV ainda não introduzido

[ ] R2 ainda não introduzido

[ ] regras de negócio ainda não implementadas

[ ] lint PASS

[ ] tests PASS

[ ] builds individuais PASS

[ ] wrangler dry-run PASS
```

## Estado esperado depois do PR-01

Teremos:

```text
                    CLOUDFLARE
                        │
                        ▼
                     Worker
                        │
                   Nest Runtime
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
            Health              Config
                                   │
                      ┌────────────┴───────────┐
                      ▼                        ▼
                    Kernel                 Contracts
                      │
              ┌───────┴─────────┐
              ▼                 ▼
            Domain          Application
            primitives       primitives
```