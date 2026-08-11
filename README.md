# beauty-management-api

Backend autoritativo do projeto Beauty Management.

## Direção arquitetural

```text
beauty-management-web
    -> BFF
    -> beauty-management-api
        -> Authentication Gate
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

O projeto está em uma fase em que o login ainda não faz parte do MVP ativo. Por isso a autenticação é controlada por uma feature flag explícita:

```env
AUTHENTICATION_ENABLED=false
```

`false` é o default atual. Nesse modo uma rota tenant-scoped não exige Bearer token, porém o multi-tenancy continua obrigatório:

```text
x-tenant-id (selector opcional)
  -> PostgreSQL app.tenants
  -> valida UUID / existência / status
  -> resolved tenantId
  -> ExecutionContext
  -> PostgresUnitOfWork
  -> SET app.tenant_id
  -> PostgreSQL RLS
```

O header nunca é usado diretamente como autoridade. Se existir apenas um tenant `active`/`trial`, ele pode ser resolvido automaticamente. Se existirem vários tenants operacionais e nenhum selector for informado, a API retorna `TENANT_SELECTION_REQUIRED`.

Quando o login for ativado:

```env
AUTHENTICATION_ENABLED=true
```

o fluxo passa a ser:

```text
Bearer token
  -> Supabase Auth
  -> identity.users.auth_subject
  -> identity.tenant_memberships
  -> app.tenants
  -> roles / permissions
  -> optional professional membership
  -> resolved ExecutionContext
  -> PostgreSQL RLS
```

Nesse modo `x-tenant-id` permanece apenas um selector hint e precisa pertencer ao usuário autenticado.

As rotas `/v1/me/*` representam identidade pessoal e ficam indisponíveis enquanto `AUTHENTICATION_ENABLED=false`; elas retornam `AUTHENTICATION_NOT_ENABLED` em vez de criar uma identidade fictícia.

O perfil profissional e a regra de "minha agenda" entram em vigor com autenticação habilitada, quando o backend pode resolver `identity.professional_memberships -> professionalId` com segurança.

Rotas públicas são independentes dos dois modos e resolvem `app.tenants.public_slug` diretamente no PostgreSQL.

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
GET  {{host}}/v1/customers
GET  {{host}}/v1/services
GET  {{host}}/v1/appointments
POST {{host}}/v1/appointments
POST {{host}}/v1/deposits/confirm
POST {{host}}/v1/sessions/start
POST {{host}}/v1/sessions/complete
POST {{host}}/v1/payments
GET  {{host}}/v1/public/:slug/catalog
POST {{host}}/v1/public/:slug/appointments
POST {{host}}/v1/public/:slug/leads
```

Com autenticação habilitada também são utilizados:

```text
GET {{host}}/v1/me/tenants
GET {{host}}/v1/me/context
GET {{host}}/v1/me/appointments
GET {{host}}/v1/me/customers
```

No `beauty-management-web`, `BUSINESS_API_BASE_URL` deve conter somente o host do Worker. Enquanto não há login, o BFF deve encaminhar o UUID do tenant selecionado em `x-tenant-id` quando houver mais de um tenant operacional. A resolução final sempre ocorre na API/banco.

## Autenticação

### Fase atual

```env
AUTHENTICATION_ENABLED=false
```

- não exige `Authorization` em rotas tenant-scoped;
- não inventa `actorId`, membership ou role;
- RBAC de usuário não é aplicado porque ainda não existe identidade autenticada;
- tenant existence/status, predicates e RLS continuam ativos;
- auditorias sem usuário são gravadas como ator `system`;
- `/v1/me/*` e operações de plataforma permanecem bloqueadas.

### Fase futura com login

```env
AUTHENTICATION_ENABLED=true
```

Nesse modo endpoints protegidos usam Supabase Auth:

```http
Authorization: Bearer <supabase-access-token>
```

`ApiKeySupaBase` passa a ser obrigatória e membership/RBAC voltam a ser aplicados.

As antigas variáveis `API_AUTH_MODE`, `API_DEV_AUTH_SUBJECT`, `API_DEV_AUTH_ID` e `API_DEV_TENANT_ID` não fazem parte do runtime.

## Banco de dados

Configure `.dev.vars` a partir de `.dev.vars.example`. Não versione senhas ou connection strings reais.

Preferencialmente, use a URI exata do **Transaction Pooler** do Supabase no Worker:

```env
AUTHENTICATION_ENABLED=false
DATABASE_URL=
SPIdBD=zkzzptgbiwsxinzmfvss
SBNameDB=postgres
SPPasswordDB=
# ApiKeySupaBase=  # somente quando AUTHENTICATION_ENABLED=true
```

`SPPasswordDB` é a senha do PostgreSQL. `ApiKeySupaBase` é usada somente pela autenticação Supabase e não substitui a senha do banco.

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

Detalhes de conexão: [`docs/supabase-postgres-runtime.md`](docs/supabase-postgres-runtime.md).

## Desenvolvimento

```bash
npm install
npm run check
npm run dev
```

Health checks:

```text
GET /health
GET /v1/health
GET /health/ready
```

`/health` é liveness. `/health/ready` verifica conectividade PostgreSQL e a última migration rastreada.

## Deploy no Cloudflare Workers

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
