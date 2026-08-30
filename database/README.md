# Database foundation

O adapter relacional Free-first é D1, isolado em `libs/database`.

O `DatabaseModule` só deve ser importado por um Worker que possua um binding D1
explícito, usando `DatabaseModule.forRoot(env.DB)`. O BFF não deve importar esse
módulo nem possuir binding de banco.

Não há configuração Wrangler neste repositório neste momento, portanto nenhum
binding remoto ou migration D1 foi aplicado. A migration existente em
`database/migrations/001_runtime_foundation.sql` pertence ao adapter PostgreSQL
legado e não é executada pelo fluxo D1.

Quando um Worker D1 for criado, validar localmente com:

```bash
npx wrangler d1 migrations list beauty-management-db --local
npx wrangler d1 migrations apply beauty-management-db --local
```

Não adicionar tabelas de domínio nesta foundation.
