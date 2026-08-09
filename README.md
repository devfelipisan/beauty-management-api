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

Já foram transferidos para este repositório, diretamente na `main`:

- contratos centrais e RBAC já existentes;
- lifecycle states e engine genérico de state machine;
- máquinas de estado de Appointment, Deposit e Session;
- modelos de Tenant, Professional, Service, Customer, Appointment, Deposit, Session e Payment;
- Repository Ports e `UnitOfWork` tenant-aware;
- auditoria append-only, transactional outbox e idempotência;
- `CreateTenantUseCase`;
- `CreateProfessionalUseCase`;
- `CreateServiceUseCase`;
- `CreateCustomerUseCase`;
- política transacional de criação de agendamento e `CreateAppointmentUseCase`;
- `ConfirmDepositUseCase`;
- `StartSessionUseCase`;
- `CompleteSessionUseCase`;
- `RegisterPaymentUseCase`.

A fachada `BusinessApi` já executa esses comandos por Application Use Cases reais. Ainda permanecem como ponte temporária os fluxos públicos de lead/agendamento, branding e algumas queries até que os respectivos adapters/composition root sejam concluídos.

## Base HTTP

A API versionada utiliza:

```text
{{host}}/v1/{{path}}
```

Exemplo de health check:

```text
GET {{host}}/v1/health
```

No `beauty-management-web`, configure o BFF com:

```text
BUSINESS_API_BASE_URL=https://<host>/v1/
```

Uma chamada do frontend para:

```text
/api/bff/customers
```

será encaminhada pelo BFF para:

```text
https://<host>/v1/customers
```

O BFF não possui mais fallback para a Business API embarcada no Next.js; `BUSINESS_API_BASE_URL` passa a ser obrigatório para a integração externa.

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
