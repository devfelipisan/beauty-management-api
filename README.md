# beauty-management-api

Backend autoritativo do projeto Beauty Management.

## Direção arquitetural

```text
beauty-management-web
    -> BFF
    -> beauty-management-api
        -> Workspace/Auth Context Resolver
        -> BusinessApi / AdministrationApi
        -> Application
        -> Domain
        -> UnitOfWork / Repository Ports
        -> PostgreSQL / Supabase
```

A Business API é a única autoridade de negócio. Frontend e BFF não executam regras de domínio, transições de estado, autorização definitiva nem definem o tenant efetivo da operação.

## Persistência e multi-tenancy

O runtime de produção usa PostgreSQL/Supabase. O adapter in-memory existe somente como test double vazio para testes isolados e não contém massa de negócio/demo.

O login ainda não faz parte do MVP ativo:

```env
AUTHENTICATION_ENABLED=false
```

Nesse modo, a área interna usa um workspace pré-auth carregado do banco:

```text
GET /v1/bootstrap/workspace
  -> app.tenants
  -> identity.roles
  -> app.professionals
  -> tenant/role/professional selectors
```

Os selectors enviados pelo Web/BFF são validados na API antes de criar o `ExecutionContext`. Tenant continua isolado por predicates e PostgreSQL RLS. Quando a função selecionada é `professional`, o `professionalId` também é validado no mesmo tenant e limita agenda/clientes ao profissional selecionado.

Quando o login for ativado:

```env
AUTHENTICATION_ENABLED=true
```

o contexto passa a ser resolvido por Supabase Auth, membership e RBAC reais. As rotas `/v1/me/*` representam identidade pessoal e continuam indisponíveis enquanto a autenticação estiver desligada.

Rotas públicas resolvem `app.tenants.public_slug` diretamente no PostgreSQL.

## Funcionalidades do núcleo

A API contém, entre outros:

- contratos runtime, RBAC e `ExecutionContext`;
- state machines de Appointment, Deposit, Session, Lead e Follow-up;
- modelos tenant-aware;
- Repository Ports e `UnitOfWork`;
- auditoria append-only, transactional outbox e idempotência;
- tenants, profissionais, serviços, equipamentos e clientes;
- avaliações e registros técnicos;
- agendamentos internos e públicos;
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
GET  {{host}}/v1/bootstrap/workspace
POST {{host}}/v1/bootstrap/context
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

## Autenticação

### Fase atual

```env
AUTHENTICATION_ENABLED=false
```

- não exige `Authorization` em rotas tenant-scoped;
- não inventa `actorId` ou membership;
- role/professional pré-auth são contexto operacional selecionado e validado no banco, não identidade autenticada;
- tenant predicates e RLS continuam ativos;
- auditorias sem usuário são gravadas como ator `system`;
- `/v1/me/*` e operações de plataforma permanecem bloqueadas.

### Fase futura com login

```env
AUTHENTICATION_ENABLED=true
SPIdBD=<supabase-project-ref>
ApiKeySupaBase=<publishable-or-anon-key>
```

Nesse modo endpoints protegidos usam Supabase Auth e membership/RBAC reais.

As antigas variáveis `API_AUTH_MODE`, `API_DEV_AUTH_SUBJECT`, `API_DEV_AUTH_ID` e `API_DEV_TENANT_ID` não fazem parte do runtime.

## Banco de dados

Configure `.dev.vars` a partir de `.dev.vars.example`. Não versione senhas ou connection strings reais.

### Worker runtime

Preferencialmente use a URI exata do **Transaction Pooler** do Supabase:

```env
AUTHENTICATION_ENABLED=false
DATABASE_URL=postgresql://...
```

`DATABASE_URL` é suficiente por si só para o runtime PostgreSQL. O Worker não exige `SPIdBD`, `SBNameDB` ou `SPPasswordDB` quando a URL explícita está presente.

Como alternativa, a conexão pode ser informada por componentes explícitos:

```env
SBDatabaseHost=<pooler-host>
SBDatabasePort=6543
SBDatabaseUser=postgres.<project-ref>
SBNameDB=postgres
SPPasswordDB=<secret>
```

Nenhum hostname de pooler é inferido de região.

### Migration/seed

Migration e seed usam uma conexão separada, preferencialmente direta:

```env
MIGRATION_DATABASE_URL=postgresql://...
```

Sem `MIGRATION_DATABASE_URL`, o runner utiliza `SPIdBD`, `SBNameDB`, `SPPasswordDB` e os overrides opcionais `SBMigrationHost`, `SBMigrationPort`, `SBMigrationUser`.

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

Detalhes: [`docs/supabase-postgres-runtime.md`](docs/supabase-postgres-runtime.md).

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

`/health` é liveness. `/health/ready` distingue configuração inválida, banco indisponível e conexão pronta sem expor secrets.

## Deploy no Cloudflare Workers

Configuração recomendada:

```text
Build command:     npm run build
Deploy command:    npx wrangler deploy
Root directory:    /
Production branch: main
```

Na fase atual, configure `DATABASE_URL` como Worker secret e `AUTHENTICATION_ENABLED=false` como variável regular. `SPIdBD` e `ApiKeySupaBase` só são necessários ao runtime quando Supabase Auth for habilitado.

Para tipagem Cloudflare:

```bash
npm run cf-typegen
```

O projeto declara Node 24 e npm 11 como ambiente de referência.
