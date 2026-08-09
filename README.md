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

## Migração em andamento

A primeira etapa extraiu a fachada `BusinessApi` para este repositório e removeu dela a responsabilidade de construir o próprio container. As dependências agora são injetadas explicitamente por `BusinessApiDependencies`.

Nesta fase, `queries` e `commands` são portas temporárias tipadas com `unknown` nos payloads porque os DTOs, use cases, state machines, repositories, autorização e contratos ainda serão migrados incrementalmente do `beauty-management-web`.

Próximas etapas:

1. migrar contratos e erros compartilhados;
2. migrar Application/Domain por bounded context;
3. migrar `UnitOfWork`, repositories, audit, outbox e idempotência;
4. migrar Auth/RBAC;
5. substituir as portas temporárias da `BusinessApi` pelos tipos reais;
6. expor `/v1/*` no Worker e conectar o BFF do `beauty-management-web`.

## Desenvolvimento

```bash
npm install
npm run build
npm run dev
```

`npm run build` valida o TypeScript. O bundle do Worker continua sendo produzido pelo Wrangler durante o deploy.

Health check inicial:

```text
GET /health
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

O script `build` existe porque Workers Builds pode executar `npm run build` antes do comando de deploy. Para este Worker, a etapa valida o TypeScript e não duplica o bundle de produção.

O projeto declara Node 24 e npm 11 como ambiente de referência. Se a plataforma escolher Bun para a instalação automática, a árvore de dependências também deve permanecer instalável por Bun.
