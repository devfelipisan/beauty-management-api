# beauty-management-api

Backend autoritativo do projeto Beauty Management.

## Direção arquitetural

```text
beauty-management-web
    -> BFF
    -> beauty-management-api
        -> BusinessApi
        -> Application
        -> Domain
        -> UnitOfWork / Repository Ports
        -> PostgreSQL / Supabase
```

A Business API é a única autoridade de negócio. Frontend e BFF não executam regras de domínio, transições de estado ou autorização definitiva.

## Estado atual da migração

A `main` já contém a fundação e as regras negociais que estavam expostas no `beauty-management-web` para o núcleo atual:

- contratos runtime, RBAC e `ExecutionContext`;
- lifecycle states e engine genérico de state machine;
- máquinas de estado de Appointment, Deposit, Session e Lead;
- modelos tenant-aware de Tenant, Professional, Service, Customer, Appointment, Deposit, Session e Payment;
- regras de Lead e Tenant Branding desacopladas de React/theme;
- Repository Ports e `UnitOfWork`;
- auditoria append-only, transactional outbox e idempotência;
- criação de tenant, profissional, serviço e cliente;
- criação de agendamento autenticado e público;
- confirmação de sinal;
- início e conclusão de sessão;
- registro de pagamento;
- captação e mudança de estado de lead;
- atualização de branding;
- queries da fachada `BusinessApi`, incluindo catálogo público e ações válidas de Appointment/Lead.

A fachada não depende mais das antigas pontes temporárias `BusinessApiQueries`/`BusinessApiCommands`. O composition root server-side injeta os casos de uso, `UnitOfWork`, LeadRepository e autorização.

### Persistência atual

Para manter a aplicação executável durante a extração, existe um adapter em memória tenant-aware com seed determinístico e transação lógica por clone/commit. Ele é temporário. A próxima substituição de infraestrutura deve implementar os mesmos ports com PostgreSQL/Supabase sem mover regras de negócio de volta para o frontend/BFF.

## Base HTTP

A API versionada utiliza:

```text
{{host}}/v1/{{path}}
```

Exemplos:

```text
GET  {{host}}/v1/health
GET  {{host}}/v1/customers
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

O BFF monta o destino versionado como `{{host}}/v1/{{path}}`. Por exemplo, `/api/bff/customers` aponta para `https://<host>/v1/customers`. O BFF composto já utiliza explicitamente caminhos `/v1/*`.

Durante a validação de paridade, o proxy genérico mantém fallback temporário para a API embarcada apenas quando `BUSINESS_API_BASE_URL` não estiver configurada. Em ambiente integrado/deploy, configure a variável para usar obrigatoriamente o novo backend.

## Desenvolvimento

```bash
npm install
npm run build
npm run dev
```

`npm run build` valida o TypeScript. O bundle do Worker continua sendo produzido pelo Wrangler durante o deploy.

Health checks:

```text
GET /health
GET /v1/health
```

Quando bindings do Cloudflare forem adicionados, gere os tipos a partir do próprio `wrangler.jsonc`:

```bash
npm run cf-typegen
```

O projeto não depende de `@cloudflare/workers-types`; os tipos de bindings devem ser gerados pelo Wrangler para permanecerem sincronizados com a configuração real do Worker.

## Deploy no Cloudflare Workers

Este repositório é um Worker de API puro. O `wrangler.jsonc` aponta diretamente para `src/index.ts`, portanto o Wrangler realiza o bundle durante `wrangler deploy`.

Configuração recomendada em Workers Builds:

```text
Build command:     npm run build
Deploy command:    npx wrangler deploy
Root directory:    /
Production branch: main
```

O projeto declara Node 24 e npm 11 como ambiente de referência.
