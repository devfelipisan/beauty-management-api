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
npm run typecheck
npm run dev
```

Health check inicial:

```text
GET /health
```
