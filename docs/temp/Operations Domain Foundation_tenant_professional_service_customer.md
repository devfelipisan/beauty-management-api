Considerando os relatórios pós-implementação do **PR-05** e do **PR-06**, o próximo PR deve ser o **PR-07 — Reliability Foundation**.

O motivo é claro: agora já existem mutações reais em `Tenant`, `Professional`, `Service` e `Customer`, com ports tenant-aware, adapters D1, controllers, autenticação, tenancy e migration funcional.  O passo seguinte não deveria ser `Appointment` ainda, porque o domínio exige idempotência em operações críticas, rastreabilidade, preservação histórica e consistência transacional. A especificação canônica exige explicitamente proteção contra dupla execução e duplicação de agendamentos, sessões, pagamentos, sinal, pacote e outros fluxos.

A proposta arquitetural também estabelece o padrão `mutação + auditoria + outbox + idempotência` dentro da mesma fronteira transacional. 

# PR-07 — Reliability Foundation

## Objetivo

Introduzir a fundação transversal necessária para que operações críticas futuras possam ser executadas com segurança:

```text
UseCase
   ↓
UnitOfWork
   │
   ├── Idempotency
   ├── Domain mutation
   ├── Audit
   └── Outbox
   │
   ▼
COMMIT
```

Em caso de erro:

```text
ROLLBACK
```

O PR deve preparar essa infraestrutura antes de:

```text
CreateAppointment
ConfirmDeposit
StartSession
CompleteSession
RegisterPayment
RefundPayment
```

---

# 1. Estado confirmado como pré-condição

O PR-07 deve assumir como já implementado:

```text
operations-worker
├── Health
├── Config
├── Observability
├── Authentication
├── Tenancy
│
├── Tenant
├── Professional
├── Service
└── Customer
```

com:

```text
Repository Ports
       ↓
D1 adapters
       ↓
D1
```

e migration:

```text
database/d1/migrations/
└── 0001_operations_foundation.sql
```

O relatório do PR-06 confirma também que foram implementados isolation por tenant, proteção Professional–Service cross-tenant e controllers finos. 

---

# 2. Escopo exato

Implementar:

```text
UnitOfWork
Transaction abstraction
IdempotencyStore
AuditWriter
OutboxWriter

IdempotencyRecord
AuditEvent
OutboxEvent

D1 adapters

ReliabilityModule

migrations

tests
```

Não implementar:

```text
Appointment
Availability
Deposit
Payment
Session
Assessment
Package
Discount
R2
KV
Queue consumer
E-mail
Notification
Cron
```

O objetivo é criar a **infraestrutura de confiabilidade**, não consumir ainda toda essa infraestrutura em fluxos complexos.

---

# 3. Inventário inicial

Antes de alterar:

```bash
pwd
git status
git branch --show-current
git log --oneline -20
```

Depois:

```bash
find apps/operations-worker -maxdepth 7 -type f | sort
find libs -maxdepth 7 -type f | sort
find database -maxdepth 7 -type f | sort
```

Pesquisar implementações existentes:

```bash
grep -R "UnitOfWork" apps libs . 2>/dev/null || true

grep -R "Idempotency" apps libs . 2>/dev/null || true

grep -R "AuditWriter" apps libs . 2>/dev/null || true

grep -R "OutboxWriter" apps libs . 2>/dev/null || true

grep -R "audit_events" database apps libs . 2>/dev/null || true

grep -R "outbox" database apps libs . 2>/dev/null || true
```

Não duplicar fundações existentes.

---

# 4. Não misturar Reliability com Domain

A estrutura conceitual deve continuar:

```text
Domain
   X
D1
Audit database
Outbox table
Idempotency table
```

Application conhece apenas ports:

```text
UnitOfWork
AuditWriter
OutboxWriter
IdempotencyStore
```

Infrastructure conhece:

```text
D1Database
SQL
records
transactions
```

---

# 5. Criar library `reliability`

Se ainda não existir:

```bash
nest g library reliability
```

Depois:

```bash
nest g module reliability --project reliability
```

Estrutura sugerida:

```text
libs/reliability/src/
├── unit-of-work/
│   ├── unit-of-work.ts
│   └── transaction-context.ts
│
├── idempotency/
│   ├── idempotency-record.ts
│   ├── idempotency-store.ts
│   └── idempotency.service.ts
│
├── audit/
│   ├── audit-event.ts
│   └── audit-writer.ts
│
├── outbox/
│   ├── outbox-event.ts
│   └── outbox-writer.ts
│
├── d1/
│   ├── d1-unit-of-work.ts
│   ├── d1-idempotency-store.ts
│   ├── d1-audit-writer.ts
│   └── d1-outbox-writer.ts
│
└── reliability.module.ts
```

Os nomes podem ser adaptados às convenções já presentes.

---

# 6. Criar `UnitOfWork`

Via CLI:

```bash
nest g interface unit-of-work/unit-of-work \
  --project reliability
```

Contrato conceitual:

```ts
export interface UnitOfWork {
  execute<T>(
    operation: (
      context: TransactionContext,
    ) => Promise<T>,
  ): Promise<T>;
}
```

O objetivo é permitir que Application diga:

```text
execute this atomically
```

sem conhecer D1.

---

# 7. `TransactionContext`

Criar:

```bash
nest g interface unit-of-work/transaction-context \
  --project reliability
```

Conceitualmente:

```ts
export interface TransactionContext {
  audit: AuditWriter;

  outbox: OutboxWriter;

  idempotency: IdempotencyStore;
}
```

Não coloque repositories de todos os módulos dentro de um mega-contexto genérico prematuramente.

Os repositories podem futuramente receber uma sessão/transaction handle conforme a estratégia D1 adotada.

---

# 8. Investigar as garantias reais do D1

Esse passo precisa ser feito antes de implementar `D1UnitOfWork`.

Não simular PostgreSQL.

O Codex deve verificar a estratégia prevista no ADR-0009 e a API D1 disponível na versão atual.

A implementação não pode simplesmente fingir que existe:

```text
BEGIN
SELECT FOR UPDATE
SERIALIZABLE
COMMIT
```

como no PostgreSQL.

A proposta original dependia justamente dessas garantias para operações concorrentes. 

Portanto o PR-07 deve documentar claramente:

```text
que atomicidade o adapter D1 oferece
quais operações podem ser agrupadas
quais limitações permanecem
```

---

# 9. Não esconder ausência de atomicidade

Se D1 não fornecer semântica suficiente para determinada operação futura:

```text
Appointment conflict
```

o PR deve registrar isso como constraint arquitetural.

Não implementar:

```ts
class FakeTransaction {
  execute(fn) {
    return fn();
  }
}
```

e chamar isso de transação real.

---

# 10. Idempotency model

A regra canônica do produto exige idempotência para operações críticas.

O modelo deve conter pelo menos:

```text
tenantId
operation
idempotencyKey
requestHash
status
response reference/result
createdAt
expiresAt?
```

Exemplo conceitual:

```ts
export interface IdempotencyRecord {
  tenantId: string;

  operation: string;

  key: string;

  requestHash: string;

  status:
    | 'PROCESSING'
    | 'COMPLETED'
    | 'FAILED';

  response?: unknown;

  createdAt: string;
}
```

---

# 11. Regra fundamental da idempotência

Formalizar:

```text
same tenant
+
same operation
+
same key
+
same requestHash
=
same logical result
```

Mas:

```text
same key
+
different requestHash
=
CONFLICT
```

Isso impede que a mesma chave seja reutilizada para uma operação diferente.

---

# 12. Criar `IdempotencyStore`

```bash
nest g interface idempotency/idempotency-store \
  --project reliability
```

Contrato mínimo:

```ts
find(...)

reserve(...)

complete(...)

fail(...)
```

Evite uma interface CRUD genérica.

---

# 13. `IdempotencyService`

Pode ser apropriado criar:

```bash
nest g service idempotency/idempotency \
  --project reliability
```

Responsabilidade:

```text
validate key
calculate/verify request hash
reserve operation
handle replay
handle conflict
complete
```

Não deve:

```text
executar domínio
consultar Customer
alterar Appointment
```

---

# 14. Idempotency key não vem do domínio

Ela é contexto de execução/application boundary.

Fluxo futuro:

```text
HTTP Idempotency-Key
        ↓
Controller
        ↓
Application Command
        ↓
Idempotency Service
```

Não colocar:

```text
Appointment.idempotencyKey
```

como atributo de entidade.

---

# 15. Audit model

A especificação exige rastreabilidade e proíbe remoção de registros críticos.

Criar:

```bash
nest g interface audit/audit-writer \
  --project reliability
```

e:

```bash
nest g class audit/audit-event \
  --project reliability \
  --no-spec
```

Modelo:

```ts
export interface AuditEvent {
  id: string;

  tenantId?: string;

  actorId?: string;

  action: string;

  resourceType: string;

  resourceId?: string;

  requestId: string;

  correlationId: string;

  occurredAt: string;

  metadata?: Record<string, unknown>;
}
```

---

# 16. Auditoria é append-only

O contrato deve permitir:

```text
append
```

Não:

```text
update
delete
replace
```

O adapter D1 também não deve oferecer APIs que facilitem alteração retrospectiva.

---

# 17. Audit ≠ Observe

Continuar diferenciando:

```text
Observe
=
telemetria técnica
```

de:

```text
Audit
=
fato operacional/de negócio persistente
```

Exemplo:

```text
http.request.completed
```

é observabilidade.

Enquanto:

```text
customer.deactivated
```

é auditoria.

---

# 18. Não registrar PII completa em Audit

Especialmente agora que `Customer` existe.

Não armazenar:

```text
full customer DTO
telefone completo
documento completo
e-mail completo
```

como payload genérico de auditoria.

Preferir:

```text
resourceId
action
safe changes
opaque actor
```

A arquitetura técnica original recomenda audit append-only sem fotos ou informações clínicas completas. 

---

# 19. Outbox model

Criar:

```bash
nest g interface outbox/outbox-writer \
  --project reliability
```

e:

```bash
nest g class outbox/outbox-event \
  --project reliability \
  --no-spec
```

Modelo conceitual:

```ts
export interface OutboxEvent {
  id: string;

  tenantId?: string;

  type: string;

  aggregateType: string;

  aggregateId: string;

  correlationId: string;

  payload: Record<string, unknown>;

  status:
    | 'PENDING'
    | 'PROCESSING'
    | 'PUBLISHED'
    | 'FAILED';

  createdAt: string;
}
```

---

# 20. Outbox ainda não envia nada

Muito importante:

Neste PR:

```text
OutboxWriter
    ↓
D1
```

Somente.

Não criar:

```text
email consumer
WhatsApp consumer
queue
webhook
cron
```

O `async-worker` futuramente consumirá os eventos.

---

# 21. Evento externo não pertence ao commit HTTP

Fluxo futuro correto:

```text
CreateAppointment
     ↓
appointment mutation
audit
outbox
idempotency
     ↓
commit
     ↓
HTTP 201
```

Depois:

```text
Async Worker
     ↓
read outbox
     ↓
notification
```

Isso evita que uma falha de e-mail faça a operação principal falhar.

---

# 22. Migration do PR-07

Criar:

```text
database/d1/migrations/
└── 0002_reliability_foundation.sql
```

Seguindo a numeração real existente.

Ela deve criar:

```text
idempotency_records
audit_events
outbox_events
```

---

# 23. `idempotency_records`

Campos conceituais:

```text
id
tenant_id
operation
idempotency_key
request_hash
status
response_payload/reference
created_at
updated_at
expires_at
```

Índice/constraint crucial:

```text
tenant_id
+
operation
+
idempotency_key
```

deve ser único.

---

# 24. Não armazenar resposta arbitrariamente gigante

`response_payload` pode virar um problema.

Preferir:

```text
small stable response
```

ou:

```text
resource_id/result reference
```

quando possível.

Não usar idempotency table como blob storage.

---

# 25. `audit_events`

Campos:

```text
id
tenant_id
actor_id
action
resource_type
resource_id
request_id
correlation_id
metadata_json
occurred_at
```

Índices úteis:

```text
tenant_id + occurred_at
tenant_id + resource_type + resource_id
```

---

# 26. `outbox_events`

Campos:

```text
id
tenant_id
event_type
aggregate_type
aggregate_id
correlation_id
payload_json
status
attempt_count
available_at
created_at
published_at
```

Mesmo que `attempt_count` ainda não seja consumido, ele pode ser necessário para o consumer futuro — mas somente inclua se o contrato de retry já estiver documentado.

Se não, mantenha o schema mínimo.

---

# 27. Não inventar retry policy

Não decidir agora:

```text
3 retries
5 retries
exponential 2^n
```

se não existe decisão normativa.

O PR cria persistência de outbox.

Retry policy entra no PR do async worker.

---

# 28. Adapters D1

Gerar:

```bash
nest g provider d1/d1-idempotency-store \
  --project reliability

nest g provider d1/d1-audit-writer \
  --project reliability

nest g provider d1/d1-outbox-writer \
  --project reliability

nest g provider d1/d1-unit-of-work \
  --project reliability
```

Ajustar paths conforme convenções.

---

# 29. Adapter é responsável por SQL

Apenas `d1/*` conhece:

```text
prepare()
bind()
batch()
```

ou API equivalente.

Application não.

---

# 30. ReliabilityModule

Compor:

```text
ReliabilityModule
├── UnitOfWork
├── IdempotencyStore
├── AuditWriter
└── OutboxWriter
```

E exportar apenas os tokens/ports necessários.

---

# 31. Tokens explícitos

Pode usar:

```ts
export const UNIT_OF_WORK =
  Symbol('UNIT_OF_WORK');

export const IDEMPOTENCY_STORE =
  Symbol('IDEMPOTENCY_STORE');

export const AUDIT_WRITER =
  Symbol('AUDIT_WRITER');

export const OUTBOX_WRITER =
  Symbol('OUTBOX_WRITER');
```

Não espalhar strings mágicas.

---

# 32. Integrar Operations Worker

`operations-worker.module.ts` passa conceitualmente a:

```text
Config
Observability
Authentication
Tenancy
Database
Reliability
Health
Tenant
Professional
Service
Customer
```

Mas Reliability não deve produzir queries no bootstrap.

---

# 33. Não converter todos os use cases existentes imediatamente

Eu evitaria refatorar todos:

```text
CreateTenant
CreateProfessional
CreateService
CreateCustomer
...
```

em uma única PR se isso explodir o diff.

O PR-07 pode provar a integração usando **um caso simples e controlado**, preferencialmente uma mutação já existente.

Por exemplo:

```text
DeactivateCustomer
```

ou:

```text
UpdateTenant
```

Mas só se isso puder ser feito sem alterar semântica existente.

---

# 34. Melhor prova: uma mutação piloto

Escolha exatamente **uma** operação existente.

Por exemplo:

```text
DeactivateCustomer
```

e faça:

```text
request
 ↓
idempotency
 ↓
UnitOfWork
 ↓
customer mutation
 ↓
audit append
 ↓
optional outbox event
 ↓
commit
```

Não refatore os quatro módulos inteiros de uma vez.

---

# 35. Mas cuidado com idempotência desnecessária

Nem toda mutação precisa de Idempotency-Key externo.

O objetivo deste PR é **provar a infraestrutura**.

As operações obrigatoriamente idempotentes segundo o domínio aparecem com mais força a partir de Appointment/financial/session.

Portanto não imponha `Idempotency-Key` a todos os CRUDs apenas para usar a fundação.

---

# 36. Pode validar UnitOfWork isoladamente

Uma alternativa melhor é provar:

```text
Reliability integration test
```

sem modificar endpoint funcional.

Por exemplo:

```text
transaction fixture
 ↓
insert audit
insert outbox
reserve idempotency
 ↓
commit
```

Depois:

```text
forced error
 ↓
verify no partial state
```

Essa prova é mais limpa.

---

# 37. Teste obrigatório: atomicity success

Cenário:

```text
BEGIN
reserve idempotency
append audit
append outbox
COMMIT
```

Resultado:

```text
all three persisted
```

---

# 38. Teste obrigatório: rollback

Cenário:

```text
reserve idempotency
append audit
throw error
```

Resultado esperado:

```text
idempotency
audit
outbox
```

não podem ficar em estado parcialmente inconsistente, conforme as garantias reais da estratégia D1.

Se D1 não suportar esse comportamento com o adapter atual, o PR deve falhar/registrar gap arquitetural.

---

# 39. Teste de idempotency replay

```text
key = abc
payload hash = X
```

Primeira execução:

```text
COMPLETED
```

Segunda:

```text
same result
```

sem repetir mutação lógica.

---

# 40. Teste de key conflict

```text
key = abc
hash = X
```

seguido de:

```text
key = abc
hash = Y
```

Resultado:

```text
409 / IDEMPOTENCY_KEY_CONFLICT
```

ou código interno equivalente.

---

# 41. Teste cross-tenant de idempotência

Obrigatório:

```text
Tenant A
key = abc
```

não interfere com:

```text
Tenant B
key = abc
```

Por isso a unique key inclui tenant.

---

# 42. Audit test

Provar:

```text
append
→ record exists
```

e que não existe API pública:

```text
updateAudit()
deleteAudit()
```

---

# 43. Audit tenant isolation

```text
Tenant A
```

não consegue consultar eventos do:

```text
Tenant B
```

quando a query API for implementada.

Se neste PR existir apenas writer, ao menos o schema/adapter deve preservar tenant.

---

# 44. Outbox append test

```text
append event
→ status = PENDING
```

---

# 45. Outbox payload sanitization

Não permitir por padrão:

```text
Customer DTO
Authorization header
technical record
```

como payload.

Definir eventos com payload pequeno e explícito.

---

# 46. Exemplo de evento futuro

Bom:

```json
{
  "appointmentId": "...",
  "tenantId": "..."
}
```

Ruim:

```json
{
  "appointment": {
    "...": "objeto inteiro"
  },
  "customer": {
    "...": "PII completa"
  }
}
```

---

# 47. ExecutionContext

Audit e Outbox devem reutilizar:

```text
requestId
correlationId
actorId
tenantId
```

do contexto construído nos PRs anteriores.

Não gerar novos IDs desconectados sem necessidade.

---

# 48. Observe integration

A Reliability Foundation deve gerar telemetria técnica de:

```text
unit_of_work.success
unit_of_work.failure

idempotency.hit
idempotency.miss
idempotency.conflict

outbox.appended
audit.appended
```

sem gerar alta cardinalidade.

---

# 49. Não logar request hash bruto se desnecessário

O hash pode ser usado internamente, mas não precisa aparecer em todos os logs.

Evitar aumentar cardinalidade de tracing.

---

# 50. Cloudflare Free impact

Esse PR começa a introduzir write amplification.

Uma operação crítica futura poderá gerar:

```text
1 business write
+
1 idempotency write
+
1 audit write
+
1 outbox write
```

Ou seja:

```text
~4 writes
```

por comando crítico.

Isso precisa ser documentado porque o orçamento D1 Free possui writes limitados.

---

# 51. Isso não significa remover audit/outbox

Não sacrificar consistência só para reduzir writes.

Mas documentar:

```text
writes per operation
```

é obrigatório para avaliar quando Free Tier deixa de ser apropriado.

---

# 52. Estimativa de capacidade

Se operação crítica média tiver:

```text
4 writes
```

e orçamento diário for:

```text
100k writes
```

o teto teórico seria:

```text
25k critical commands/day
```

antes de considerar outras writes.

Na prática a margem interna deve ser bem menor.

O objetivo é ter consciência de custo.

---

# 53. Health continua totalmente independente

Mesmo depois do ReliabilityModule:

```text
GET /health
```

deve continuar:

```text
0 D1 reads
0 D1 writes
0 audit
0 outbox
0 idempotency
```

---

# 54. Não auditar Health

Confirmar que:

```text
health request
```

não cria:

```text
audit_event
```

nem:

```text
outbox_event
```

---

# 55. Não aplicar idempotência a GET

Nunca:

```text
GET /customers
→ IdempotencyStore
```

Idempotência dessa fundação é para comandos/mutações relevantes.

---

# 56. Error model

Adicionar códigos estáveis:

```text
IDEMPOTENCY_KEY_CONFLICT
IDEMPOTENCY_OPERATION_IN_PROGRESS

UNIT_OF_WORK_FAILED

AUDIT_WRITE_FAILED
OUTBOX_WRITE_FAILED
```

Mas erros técnicos internos não devem expor SQL.

---

# 57. Falha de audit/outbox

Para uma operação que exige consistência:

```text
business mutation succeeds
audit fails
```

resultado deve ser:

```text
operation fails/rolls back
```

e não:

```text
business mutation commits silently
```

O mesmo vale para outbox quando ela fizer parte do mesmo compromisso transacional.

---

# 58. Não confundir observability failure

Por outro lado:

```text
Observe telemetry endpoint unavailable
```

não deveria necessariamente impedir o negócio.

Reliability persistence e observabilidade externa são preocupações diferentes.

---

# 59. Migration local

Executar, quando Wrangler estiver disponível:

```bash
npx wrangler d1 migrations apply \
  beauty-management-db \
  --local
```

ou comando equivalente à configuração real.

O PR-06 deixou Wrangler preparado, então o PR-07 deve finalmente executar migration local se o ambiente já estiver funcional. 

---

# 60. Corrigir gates que permaneceram bloqueados

O relatório do PR-06 ainda informa:

```text
Vitest bloqueado
Lint bloqueado
Wrangler não instalado no ambiente
```



Essas pendências agora precisam ser tratadas como gate.

Antes de concluir PR-07:

```text
test
lint
wrangler
```

devem funcionar.

---

# 61. Não mudar framework de testes

Não trocar:

```text
Vitest → Jest
```

apenas para contornar Rolldown.

Primeiro restaurar instalação coerente.

---

# 62. Diagnóstico do ambiente

Executar:

```bash
node --version
npm --version
npm ls
```

Depois:

```bash
npm ci
```

quando compatível com o lockfile.

E novamente:

```bash
npm run lint
npm run test
```

Se o package manager real for outro, utilizar o lockfile como fonte de verdade.

---

# 63. Testes arquiteturais novos

Adicionar:

```text
domain → reliability/d1
FAIL
```

```text
application → D1Database
FAIL
```

```text
controller → D1UnitOfWork
FAIL
```

```text
BFF → ReliabilityModule business persistence
FAIL
```

---

# 64. Regra de dependência

Permitido:

```text
Application
 ↓
UnitOfWork Port
```

```text
Application
 ↓
AuditWriter Port
```

```text
Infrastructure
 ↓
D1 implementations
```

Proibido:

```text
Application
 ↓
D1AuditWriter
```

---

# 65. Documentação

Criar:

```text
docs/reliability/
├── unit-of-work.md
├── idempotency.md
├── audit.md
└── outbox.md
```

ou atualizar documentos equivalentes.

---

# 66. Documentar transaction template

Congelar:

```text
Command
   ↓
resolve context
   ↓
validate idempotency
   ↓
begin unit of work
   ↓
domain/application mutation
   ↓
audit
   ↓
outbox
   ↓
complete idempotency
   ↓
commit
```

Essa estrutura deverá ser obrigatória para PR-08.

---

# 67. Atualizar AGENTS.md

Adicionar regra, se ainda não existir:

```text
Antes de implementar mutação crítica:

- avaliar idempotência;
- avaliar UnitOfWork;
- avaliar audit;
- avaliar outbox;
- garantir tenant isolation.
```

---

# 68. Atualizar architecture tests

Transformar isso em política executável.

Por exemplo, impedir adapters D1 em:

```text
domain/
application/
```

---

# 69. Não criar Transactional Decorator mágico

Eu evitaria algo como:

```ts
@Transactional()
```

neste estágio.

Prefiro:

```ts
unitOfWork.execute(...)
```

explícito.

É mais fácil ver a fronteira da transação e testar.

---

# 70. Não criar BaseUseCase

Também não criar:

```text
ReliableUseCaseBase
```

contendo:

```text
idempotency
audit
outbox
transaction
```

automaticamente.

Diferentes operações terão diferentes necessidades.

Composição explícita é melhor.

---

# 71. Estrutura final esperada

```text
libs/
└── reliability/
    └── src/
        ├── unit-of-work/
        ├── idempotency/
        ├── audit/
        ├── outbox/
        ├── d1/
        └── reliability.module.ts


database/
└── d1/
    └── migrations/
        ├── 0001_operations_foundation.sql
        └── 0002_reliability_foundation.sql
```

---

# 72. App final após PR-07

```text
Operations Worker
      │
      ├── Config
      ├── Observe
      ├── Auth
      ├── Tenancy
      ├── Database
      ├── Reliability
      │      ├── UnitOfWork
      │      ├── Idempotency
      │      ├── Audit
      │      └── Outbox
      │
      ├── Tenant
      ├── Professional
      ├── Service
      ├── Customer
      └── Health
```

Agora sim a aplicação estará preparada para Scheduling.

---

# 73. O que NÃO deve aparecer no diff

Rejeitar:

```text
Appointment entity
AppointmentController

AvailabilityService

Deposit

Discount calculation

Payment

Session

Outbox consumer

Queue consumer

Cron

R2

KV
```

PR-07 é foundation.

---

# 74. Definition of Done

Eu congelaria:

```text
[ ] PR-05 preservado
[ ] PR-06 preservado

[ ] UnitOfWork port definido
[ ] TransactionContext definido

[ ] estratégia transacional D1 documentada
[ ] limitações D1 explicitadas
[ ] nenhuma semântica PostgreSQL fingida

[ ] IdempotencyRecord definido
[ ] IdempotencyStore definido
[ ] IdempotencyService definido

[ ] mesma key + mesmo hash = replay seguro
[ ] mesma key + hash diferente = conflict
[ ] idempotência isolada por tenant

[ ] AuditEvent definido
[ ] AuditWriter append-only
[ ] nenhuma API update/delete de audit

[ ] OutboxEvent definido
[ ] OutboxWriter definido
[ ] novos eventos começam PENDING

[ ] nenhum consumer implementado

[ ] D1 adapters implementados
[ ] D1 permanece somente Infrastructure

[ ] ReliabilityModule implementado

[ ] migration 0002 criada
[ ] idempotency unique index criado
[ ] audit indexes tenant-aware
[ ] outbox indexes adequados ao modelo definido

[ ] transaction success test PASS
[ ] rollback test PASS

[ ] replay test PASS
[ ] idempotency conflict test PASS
[ ] cross-tenant idempotency test PASS

[ ] audit append test PASS
[ ] outbox append test PASS

[ ] nenhuma PII completa em audit/outbox/logs

[ ] execution context reutilizado

[ ] Observe continua separado de Audit

[ ] health sem database activity
[ ] health sem audit
[ ] health sem outbox
[ ] health sem idempotency

[ ] architecture tests PASS

[ ] npm lint PASS
[ ] typecheck PASS
[ ] Vitest PASS

[ ] Wrangler funcional
[ ] D1 migration local PASS
[ ] worker build PASS
[ ] smoke health PASS

[ ] write amplification documentada
[ ] Cloudflare Free impact documentado

[ ] nenhum Appointment implementado
[ ] nenhum domínio financeiro implementado
[ ] nenhum domínio clínico implementado

[ ] diff revisado
```

# 75. Relatório final do Codex

Ao concluir, deve informar:

```text
PR-07 — Reliability Foundation

Estado anterior

UnitOfWork
Idempotency
Audit
Outbox

D1 strategy

Migration

Atomicity proofs

Idempotency proofs

Tenant isolation

Observability

Cloudflare Free impact

Lint
Typecheck
Tests
Wrangler
Build
Smoke

Pendências

Próximo PR
```

Sem avançar automaticamente.

---

# Próximo PR após o PR-07

Se todos esses gates estiverem verdes, aí sim abrir:

> **PR-08 — Scheduling Foundation: Appointment + Availability + Conflict Prevention**

Ele deverá usar diretamente:

```text
Tenant
Professional
Service
Customer
+
Authentication
Tenancy
+
D1
+
UnitOfWork
Idempotency
Audit
Outbox
```

para implementar `CreateAppointment` sem criar uma segunda infraestrutura paralela.

Essa ordem é particularmente importante porque `CreateAppointment` já possui pré-condições extensas — empresa ativa, cliente ativo, serviço ativo, profissional ativo/habilitado, disponibilidade, ausência de conflito, avaliação quando obrigatória e limites do plano — e o domínio determina explicitamente que dupla submissão não pode criar dois agendamentos.

**Portanto, com os PR-05 e PR-06 concluídos conforme os relatórios, o próximo PR correto é PR-07 — Reliability Foundation. Appointment deve permanecer bloqueado até essa fundação demonstrar atomicidade, idempotência, audit e outbox de forma executável sobre o adapter D1 escolhido.**
