# Beauty Management Monorepo

Backend multiempresa para agenda, confirmação, sinal, clientes, histórico técnico, sessões, pagamentos e retornos.

## Comandos

```bash
npm install
npm test
npm run test:workers
npm run lint
npm run build
npx wrangler deploy --dry-run
```

## Operations Worker

`npm run dev:workers` inicia o conjunto local de Workers para desenvolvimento manual.
`npm run test:workers` executa os testes no runtime workerd via `@cloudflare/vitest-plugin`.

O Worker inicial de Operations e um runtime Nest isolado, com apenas `GET /health`.
Ele nao acessa banco nesta fundacao e deve ser iniciado com `SERVICE_ID=beauty-operations-worker`.

```bash
npm run start:operations
npx nest build operations-worker
```

A decisao de persistencia para os Workers Cloudflare esta registrada em
`docs/adr/0009-d1-persistence-for-cloudflare-workers.md`. O dominio de Operations
e os bindings D1 permanecem para o proximo PR.

## Billing Worker

O Billing Worker e a autoridade futura para Commercial Terms, Discount e Deposit.
Nesta fundacao ele expoe somente `GET /health`; policies indisponiveis retornam
`BLOCKED` e nao ha Payment, Refund ou persistencia de Deposit.

```bash
npm run start:billing
npx nest build billing-worker
```

## Documentação

- Produto e negócio: `docs/00-product/` e `docs/01-business/`
- Arquitetura e Workers: `docs/02-architecture/` e `docs/03-workers/`
- Infraestrutura: `docs/04-infrastructure/`
- Requisitos transversais: `docs/05-cross-cutting/`
- Desenvolvimento e operação: `docs/06-development/` e `docs/07-operations/`
- Instruções do Codex: `.codex/`
