# beauty-management-api

Backend autoritativo do projeto Beauty Management.

## Direção arquitetural

```text
beauty-management-web
    -> BFF
    -> beauty-management-api
        -> Supabase Auth
        -> Tenant Context Resolver
        -> BusinessApi / AdministrationApi
        -> Application
        -> Domain
        -> UnitOfWork / Repository Ports
        -> PostgreSQL / Supabase
```

A Business API é a única autoridade de negócio. Frontend e BFF não executam regras de domínio, transições de estado, autorização definitiva nem definem o tenant efetivo da operação.

## Persistência e multi-tenancy

O runtime de produção usa PostgreSQL/Supabase. O adapter in-memory existe somente como test double vazio para testes isolados e não contém massa de negócio/demo.

Para requisições autenticadas, o tenant é resolvido pela API a partir de dados persistidos:

```text
Bearer token
  -> Supabase Auth
  -> identity.users.auth_subject
  -> identity.tenant_memberships
  -> app.tenants
  -> roles / permissions
  -> optional professional membership
  -> resolved ExecutionContext
  -> PostgresUnitOfWork
  -> PostgreSQL RLS
```

`x-tenant-id` é somente um selector hint. O valor precisa ser UUID, pertencer ao usuário autenticado e apontar para um tenant operacional. O backend nunca usa o header como autoridade.

Regras de seleção:

- um único tenant operacional: pode ser resolvido automaticamente;
- vários tenants operacionais: retorna `TENANT_SELECTION_REQUIRED` até que um seja selecionado;
- membership ausente/inativa ou tenant suspenso/fechado: operação bloqueada;
- `/v1/me/tenants` lista memberships persistidas e informa quais são selecionáveis.

O perfil profissional recebe escopo próprio: `GET /v1/me/appointments` retorna somente seus agendamentos e `GET /v1/me/customers` somente clientes vinculados. Sessões, avaliações, ficha técnica e retornos também validam o `professionalId` resolvido server-side.

Rotas públicas são independentes do contexto autenticado e resolvem `app.tenants.public_slug` diretamente no PostgreSQL.

Detalhes: [`docs/multitenant-context.md`](docs/multitenant-context.md).

## Funcionalidades do núcleo

A API contém, entre outros:

- contratos runtime, RBAC e `ExecutionContext`;
- state machines de Appointment, Deposit, Session, Lead e Follow-up;
- modelos tenant-aware;
- Repository Ports e `UnitOfWork`;
- auditoria append-only, transactional outbox e idempotência;
- tenants, profissionais, serviços, equipamentos e clientes;
- avaliações e registros técnicos;
- agendamentos autenticados e públicos;
- sinal, check-in, sessão e pagamento;
- pacotes e retornos;
- leads institucionais;
- tenant settings, branding e landing page;
- usuários e políticas comerciais;
- PostgreSQL RLS e composite tenant foreign keys.

## Base HTTP

A API versionada utiliza:

```text
{{host}}/v1/{{path}}
```

Principais exemplos:

```text
GET  {{host}}/v1/health
GET  {{host}}/health/ready
GET  {{host}}/v1/me/tenants
GET  {{host}}/v1/me/context
GET  {{host}}/v1/me/appointments
GET  {{host}}/v1/me/customers
GET  {{host}}/v1/customers
GET  {{host}}/v1/services
POST {{host}}/v1/appointments
POST {{host}}/v1/deposits/confirm
POST {{host}}/v1/sessions/start
POST {{host}}/v1/sessions/complete
POST {{host}}/v1/payments
GET  {{host}}/v1/public/:slug/catalog
POST {{host}}/v1/public/:slug/appointments
POST {{host}}/v1/public/:slug/leads
```

No `beauty-management-web`, `BUSINESS_API_BASE_URL` deve conter somente o host do Worker:

```text
BUSINESS_API_BASE_URL=https://<host>
```

O BFF monta o destino versionado. Ele deve encaminhar o Bearer token e, quando o usuário possui múltiplos tenants, o UUID selecionado em `x-tenant-id`. A autorização e resolução final permanecem na API.

## Autenticação

Endpoints protegidos usam Supabase Auth e exigem:

```http
Authorization: Bearer <supabase-access-token>
```

Para usuários com múltiplos tenants, envie adicionalmente:

```http
x-tenant-id: <tenant-uuid>
```

As antigas variáveis `API_AUTH_MODE`, `API_DEV_AUTH_SUBJECT`, `API_DEV_AUTH_ID` e `API_DEV_TENANT_ID` não fazem parte do runtime de produção.

## Banco de dados

Configure `.dev.vars` a partir de `.dev.vars.example`. Não versione senhas ou connection strings reais.

Preferencialmente, use a URI exata do **Transaction Pooler** do Supabase no Worker:

```env
DATABASE_URL=
SPIdBD=zkzzptgbiwsxinzmfvss
SBNameDB=postgres
SPPasswordDB=
ApiKeySupaBase=
```

`SPPasswordDB` é a senha do PostgreSQL. `ApiKeySupaBase` é a chave utilizada na verificação do Supabase Auth; elas não são intercambiáveis.

Comandos:

```bash
npm run db:check
npm run db:migrate
npm run db:seed
npm run db:seed:check
npm run db:security:check
```

Ou:

```bash
npm run db:setup
```

`db:setup` executa migrations, seed, smoke do seed e contratos de RLS/constraints.

Detalhes de conexão: [`docs/supabase-postgres-runtime.md`](docs/supabase-postgres-runtime.md).

## Desenvolvimento

```bash
npm install
npm run check
npm run dev
```

`npm run check` executa typecheck e testes unitários/contratuais do código. Os testes de banco são executados separadamente contra uma instância PostgreSQL configurada.

Health checks:

```text
GET /health
GET /v1/health
GET /health/ready
```

`/health` é liveness. `/health/ready` verifica conectividade PostgreSQL e a última migration rastreada.

## Deploy no Cloudflare Workers

O repositório é um Worker de API puro e o Wrangler realiza o bundle de `src/index.ts`.

Configuração recomendada:

```text
Build command:     npm run build
Deploy command:    npx wrangler deploy
Root directory:    /
Production branch: main
```

Credenciais devem ser configuradas como Worker secrets. Para bindings/tipagem Cloudflare:

```bash
npm run cf-typegen
```

O projeto declara Node 24 e npm 11 como ambiente de referência.
