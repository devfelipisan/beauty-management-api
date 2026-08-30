**PR-04 — Database Foundation + D1 Adapter + Migration Strategy**.

Esse PR é o primeiro que introduz persistência real na nova arquitetura, mas ainda **sem implementar Customer, Appointment, Payment ou Session**. O objetivo é provar que a fundação de banco funciona corretamente, respeitando tenancy, arquitetura hexagonal, transações e o orçamento do Cloudflare Free.

A documentação do projeto exige isolamento multiempresa, rastreabilidade, congelamento histórico e idempotência.  A proposta técnica também determina que o domínio permaneça independente da infraestrutura e que acesso a banco ocorra por portas/adapters, preservando transações e consistência. 

# PR-04 — Database Foundation + D1 Adapter

Objetivo:

```text
Application / Guards
        ↓
       Ports
        ↓
   D1 Adapters
        ↓
   Cloudflare D1
```

e nunca:

```text
Application
   ↓
D1Database
```

## 1. Escopo

Entregar:

```text
DatabaseModule
D1 binding abstraction
DatabasePort
TransactionPort
Migration strategy
Local D1 setup
Health-independent DB validation
Tenant-aware infrastructure
Repository adapter pattern
Integration tests
Wrangler bindings
```

Não implementar ainda:

```text
CustomerRepository
AppointmentRepository
PaymentRepository
SessionRepository
Business migrations
R2
KV
Outbox processing
```

## 2. Inventário inicial

Antes de alterar:

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
find database -maxdepth 5 -type f | sort 2>/dev/null || true
```

Pesquisar qualquer infraestrutura já existente:

```bash
grep -R "D1Database" . 2>/dev/null || true
grep -R "DatabaseModule" . 2>/dev/null || true
grep -R "Repository" apps libs 2>/dev/null || true
grep -R "migration" . 2>/dev/null || true
grep -R "wrangler" . 2>/dev/null || true
```

Não criar uma segunda fundação se algo equivalente já existir.

## 3. Criar library `database`

Se ausente:

```bash
nest g library database
```

Depois:

```bash
nest g module database --project database
```

Estrutura esperada:

```text
libs/database/src/
├── ports/
│   ├── database-session.ts
│   └── transaction-manager.ts
│
├── d1/
│   ├── d1-database.provider.ts
│   ├── d1-transaction-manager.ts
│   └── d1.types.ts
│
├── database.module.ts
└── index.ts
```

## 4. Não criar um Repository genérico universal

Evitar:

```ts
interface Repository<T> {
  create();
  update();
  delete();
  findAll();
}
```

Isso seria abstrato demais para o domínio.

O `database` compartilhado deve oferecer apenas primitive infraestrutural, como:

```text
DatabaseSession
TransactionManager
```

Os repositories reais serão definidos depois dentro dos bounded contexts.

## 5. Criar `DatabaseSession`

Via CLI:

```bash
nest g interface ports/database-session --project database
```

Contrato conceitual:

```ts
export interface DatabaseSession {
  prepare(query: string): unknown;
}
```

Mas atenção: se isso apenas reproduzir a API do D1, a abstração perde valor.

Uma alternativa melhor é manter `D1Database` restrito ao adapter e só expor transação/contexto para repositories específicos.

Portanto o Codex deve avaliar o código real antes de congelar essa interface.

## 6. Criar `TransactionManager`

```bash
nest g interface ports/transaction-manager --project database
```

Conceitualmente:

```ts
export interface TransactionManager {
  execute<T>(
    callback: () => Promise<T>,
  ): Promise<T>;
}
```

Se o D1/runtime exigir outra semântica, adapte sem contaminar Application.

## 7. Regra de transação

Toda mutação crítica futura deverá seguir:

```text
BEGIN
  idempotency
  mutation
  audit
  outbox
COMMIT
```

Mesmo que `audit`, `outbox` e `idempotency` ainda não sejam implementados neste PR.

A fundação deve permitir essa composição.

## 8. Criar provider do D1

Via CLI:

```bash
nest g provider d1/d1-database --project database
```

O provider é o único ponto que conhece:

```text
D1Database
Cloudflare binding
env.DB
```

Não espalhar `D1Database` por services.

## 9. Token de injeção

Defina token explícito:

```ts
export const D1_DATABASE =
  Symbol('D1_DATABASE');
```

ou equivalente já adotado pelo projeto.

Isso permite:

```text
Nest DI
  ↓
D1 adapter
```

sem string mágica espalhada.

## 10. Binding Cloudflare

Cada Worker que precisar de D1 poderá ter no Wrangler:

```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "beauty-management",
      "database_id": "..."
    }
  ]
}
```

Mas não preencher `database_id` real se o recurso ainda não existir.

Para local/dev, usar configuração compatível com Wrangler local.

## 11. Não dar D1 ao BFF

Muito importante:

```text
bff-worker
```

não deve ter binding D1.

Permitido:

```text
operations-worker → D1
clinical-worker   → D1
billing-worker    → D1
async-worker      → D1
```

O BFF continua:

```text
DB access = none
```

## 12. Um banco inicialmente

Para Free Tier, manter um único D1 inicialmente:

```text
beauty-management-db
```

e ownership lógico por contexto.

Não criar:

```text
operations-db
billing-db
clinical-db
```

agora.

Isso reduz complexidade e custo operacional.

## 13. Estrutura de migrations

Criar:

```text
database/
├── migrations/
│   ├── 0001_foundation.sql
│   └── README.md
├── seeds/
└── schema/
```

Se Wrangler D1 já possuir convenção oficial no repositório, seguir essa convenção em vez de inventar outra.

## 14. Migration 0001

O PR-04 não deve criar tabelas de domínio completas.

Pode criar apenas infraestrutura mínima se ela já estiver aprovada, por exemplo:

```text
schema_migrations
```

ou nenhuma tabela, caso Wrangler já controle migrations externamente.

Não antecipar:

```text
customers
appointments
payments
sessions
```

## 15. Se criar tabela técnica, manter mínima

Exemplo aceitável:

```sql
CREATE TABLE IF NOT EXISTS system_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Mas mesmo isso só deve existir se houver uso real.

Não criar tabela só para “testar banco”.

## 16. Migrations devem ser versionadas

Nunca executar schema diretamente via console manual.

Fluxo desejado:

```text
migration file
   ↓
review
   ↓
local apply
   ↓
tests
   ↓
production apply posteriormente
```

## 17. Comandos D1 locais

Quando configurado:

```bash
npx wrangler d1 migrations list beauty-management-db --local
```

Depois:

```bash
npx wrangler d1 migrations apply beauty-management-db --local
```

Não executar em produção neste PR.

## 18. Seed local

Se necessário:

```text
database/seeds/dev.sql
```

Mas o seed deve conter apenas dados técnicos/sintéticos.

Nunca dados reais de cliente.

## 19. Não usar `SELECT 1` no `/health`

A decisão do PR-00 continua válida.

```text
GET /health
```

não toca D1.

Se for necessário provar conectividade, criar teste de integração ou endpoint separado de readiness posteriormente.

## 20. Criar `DatabaseConnectivityService`?

Eu não criaria em runtime só para fazer ping.

Preferiria teste de integração.

Se for necessário por composição interna, use CLI:

```bash
nest g service d1/d1-connectivity --project database
```

mas somente se houver responsabilidade real.

## 21. Teste de integração do D1

Objetivo:

```text
D1 binding disponível
→ query mínima
→ resultado esperado
```

Em ambiente de teste local.

Não acoplar teste ao Cloudflare remoto.

## 22. Teste de migration

Adicionar prova de:

```text
empty database
→ apply migrations
→ schema expected
```

e:

```text
apply migrations twice
→ no corruption
```

## 23. Tenancy continua princípio obrigatório

Mesmo sem tabelas funcionais ainda, toda futura migration tenant-owned deve seguir:

```text
tenant_id
```

como parte do modelo.

A documentação exige isolamento completo entre empresas.

## 24. Convenção de chaves

Eu usaria:

```text
id TEXT
tenant_id TEXT
```

para o D1 inicial, evitando depender de `rowid` como identidade de domínio.

Isso facilita migração futura para PostgreSQL.

## 25. IDs

Preferir IDs gerados na aplicação:

```text
UUID/ULID/string
```

e não:

```text
INTEGER AUTOINCREMENT
```

como identidade externa do domínio.

## 26. Datas

Armazenar em formato consistente:

```text
UTC ISO-8601
```

ou integer timestamp se o projeto definir isso normativamente.

Não misturar formatos.

## 27. Dinheiro

Quando tabelas financeiras surgirem futuramente:

```text
integer cents
```

e não `REAL`.

A proposta técnica já recomenda evitar ponto flutuante para dinheiro. 

## 28. Índices

Mesmo sem domínio completo, documentar regra:

```text
tenant-owned query
→ tenant_id deve participar do índice
```

Exemplo futuro:

```sql
CREATE INDEX idx_appointments_tenant_start
ON appointments(tenant_id, starts_at);
```

## 29. D1 Free budget

O objetivo é proteger:

```text
5M reads/dia
100k writes/dia
```

com margem interna.

Então toda futura query deverá ser revisada por:

```text
rows scanned
index usage
N+1
pagination
limit
```

## 30. Não criar ORM obrigatoriamente

A documentação Nest sobre database não exige TypeORM.

Neste projeto, introduzir `@nestjs/typeorm` só por convenção seria inadequado se D1 for o backend inicial.

Portanto:

```text
Nest
  ↓
Port
  ↓
D1 Adapter
```

é suficiente.

## 31. Não introduzir Prisma sem decisão

Também não adicionar:

```text
Prisma
Drizzle
TypeORM
Kysely
```

sem ADR ou necessidade concreta.

O PR-04 deve manter a fundação pequena.

## 32. `DatabaseModule`

Estrutura conceitual:

```ts
@Module({
  providers: [
    D1DatabaseProvider,
    D1TransactionManager,
  ],
  exports: [
    D1_DATABASE,
    TRANSACTION_MANAGER,
  ],
})
export class DatabaseModule {}
```

Mas o BFF não importa esse módulo.

## 33. Workers que importam DatabaseModule

Inicialmente:

```text
operations-worker
clinical-worker
billing-worker
async-worker
```

podem importar a fundação se já houver necessidade.

Se ainda não acessam banco, pode-se adiar import até o primeiro repository real.

Não carregar infraestrutura inutilmente.

## 34. Adapter não deve importar Domain específico

`libs/database` deve permanecer genérico.

Não fazer:

```text
libs/database
  ↓
Appointment
Payment
Session
```

Os adapters de domínio futuros ficam nos respectivos Workers.

## 35. Arquitetura futura

Por exemplo:

```text
appointments/
  ports/
    appointment.repository.ts

  adapters/
    d1-appointment.repository.ts
```

e não:

```text
libs/database/
  appointment.repository.ts
```

## 36. Permission/Membership persistence

O PR-03 introduziu:

```text
TenantMembershipProvider
```

Neste PR pode ser criada uma implementação D1 **somente se a tabela/modelo de membership já estiver formalmente definida**.

Caso contrário, manter mock até o PR funcional de identidade.

Não inventar schema.

## 37. Se membership já estiver documentado

Então criar:

```bash
nest g provider adapters/d1-tenant-membership-provider --project tenancy
```

e migration correspondente.

Mas só após confirmar fonte normativa.

## 38. Não misturar auth persistence e domínio de negócio

Mesmo se membership for persistido agora:

```text
authentication/tenancy tables
```

são infra de segurança.

Não criar Customer/Appointment.

## 39. Error model de banco

Padronizar erros técnicos:

```text
DATABASE_UNAVAILABLE
DATABASE_CONSTRAINT_VIOLATION
DATABASE_TRANSACTION_FAILED
```

Mas adapters devem traduzir erros específicos do D1.

Application não deve receber strings internas do SQLite.

## 40. Não expor SQL ao cliente

Nunca retornar:

```text
near "FROM": syntax error
```

diretamente.

Isso vai para observabilidade sanitizada.

## 41. Observabilidade do banco

Agora podemos começar a preparar:

```text
db.operation
duration
success/failure
```

Mas não logar SQL completo com valores.

Especialmente porque pode conter PII.

## 42. Query name

Preferir:

```text
operation = TenantMembership.FindActive
```

e não:

```text
SELECT * FROM tenant_users WHERE...
```

nos traces.

## 43. ExecutionContext

O database adapter não precisa conhecer o contexto inteiro.

Se necessário para tracing:

```text
requestId
correlationId
tenantId
```

devem ser passados de modo controlado.

Não acoplar repository à camada HTTP.

## 44. Não criar Audit ainda

A tabela/infraestrutura de Audit fica em PR posterior específico, a menos que o roadmap determine que ela entra junto da primeira mutação funcional.

O mesmo vale para:

```text
Outbox
Idempotency
```

## 45. Testes de arquitetura

Adicionar:

```text
domain imports D1Database
→ FAIL
```

```text
application imports D1Database
→ FAIL
```

```text
bff imports DatabaseModule
→ FAIL
```

```text
database imports domain module
→ FAIL
```

## 46. Teste BFF sem DB

Provar que:

```text
bff-worker
```

compila sem binding `DB`.

Isso é importante para preservar a fronteira.

## 47. Teste dos business workers

Provar que quando o binding é requerido:

```text
operations-worker
```

resolve corretamente o provider.

## 48. Config validation

Se um Worker necessita DB e o binding está ausente:

```text
bootstrap
→ fail clearly
```

Não usar undefined até a primeira query.

## 49. Local fallback

Não fazer:

```text
DB missing
→ use memory silently
```

Isso esconde configuração errada.

Se houver mock:

```text
DATABASE_PROVIDER=mock
```

deve ser explícito.

## 50. Production safety

Proibir:

```text
NODE_ENV=production
DATABASE_PROVIDER=mock
```

por validation config.

## 51. Wrangler por Worker

Validar:

```bash
npx wrangler types
```

para cada configuração aplicável.

Depois:

```bash
npx wrangler deploy --dry-run
```

Sem deploy.

## 52. Migration commands documentados

Adicionar ao README/docs:

```bash
npx wrangler d1 migrations list beauty-management-db --local

npx wrangler d1 migrations apply beauty-management-db --local
```

e produção somente futuramente mediante autorização.

## 53. Docker/Postgres local

Não misturar neste PR, a menos que o repositório mantenha PostgreSQL local como adapter alternativo já aprovado.

O foco é D1 Free-first.

## 54. Mas preservar possibilidade de PostgreSQL futura

O objetivo é:

```text
Repository Port
    ▲
    ├── D1Adapter
    └── PostgresAdapter
```

futuramente.

Isso está alinhado ao princípio de desacoplar infraestrutura da aplicação. 

## 55. Estrutura esperada

```text
libs/database/
└── src/
    ├── database.module.ts
    ├── tokens.ts
    ├── ports/
    │   └── transaction-manager.ts
    └── d1/
        ├── d1-database.provider.ts
        └── d1-transaction-manager.ts

database/
├── migrations/
├── seeds/
└── README.md
```

## 56. Comandos Nest CLI

Depois do inventário:

```bash
nest g library database

nest g module database --project database

nest g interface ports/transaction-manager \
  --project database

nest g provider d1/d1-database \
  --project database

nest g provider d1/d1-transaction-manager \
  --project database
```

Somente gerar componentes necessários.

## 57. Testes

Executar:

```bash
npm run lint
npm run test
```

Depois:

```bash
npm run test:e2e
```

se existir.

## 58. Builds

```bash
nest build bff-worker
nest build operations-worker
nest build clinical-worker
nest build billing-worker
nest build async-worker
```

## 59. D1 local

Quando configurado:

```bash
npx wrangler d1 migrations apply beauty-management-db --local
```

Depois executar testes de integração.

## 60. Wrangler

```bash
npx wrangler types
npx wrangler deploy --dry-run
```

## 61. Verificar consumo

O PR deverá registrar:

```text
/health:
D1 reads  = 0
D1 writes = 0
```

Testes de banco obviamente podem fazer operações locais, mas o runtime normal continua sem queries desnecessárias.

## 62. Definition of Done

```text
[ ] PR-00 íntegro
[ ] PR-01 íntegro
[ ] PR-02 íntegro
[ ] PR-03 íntegro

[ ] database library criada
[ ] DatabaseModule criado

[ ] D1 isolado em infrastructure adapter
[ ] Application não importa D1
[ ] Domain não importa D1
[ ] BFF não possui DB binding

[ ] TransactionManager definido

[ ] migration strategy definida
[ ] migrations versionadas
[ ] migrations locais testadas

[ ] nenhum schema funcional inventado
[ ] nenhum Customer criado
[ ] nenhum Appointment criado
[ ] nenhum Payment criado
[ ] nenhuma Session criada

[ ] D1 local funcional
[ ] binding validado

[ ] config falha claramente sem DB quando DB é obrigatório
[ ] mock DB não é fallback silencioso

[ ] production não pode utilizar mock acidentalmente

[ ] tenancy permanece preservada
[ ] futura query tenant-owned exige tenant_id

[ ] health não consulta banco

[ ] DB errors sanitizados
[ ] SQL/PII não aparecem em logs

[ ] architecture tests PASS
[ ] database tests PASS
[ ] migration tests PASS

[ ] lint PASS
[ ] tests PASS

[ ] bff build PASS
[ ] operations build PASS
[ ] clinical build PASS
[ ] billing build PASS
[ ] async build PASS

[ ] wrangler types PASS
[ ] wrangler dry-run PASS

[ ] Free Tier impact revisado
[ ] diff final revisado
```

# Estado depois do PR-04

A arquitetura finalmente ficará pronta para receber módulos reais:

```text
HTTP
 ↓
Authentication
 ↓
Tenant
 ↓
Permission
 ↓
ExecutionContext
 ↓
Controller
 ↓
future UseCase
 ↓
Repository Port
 ↓
D1 Adapter
 ↓
D1
```