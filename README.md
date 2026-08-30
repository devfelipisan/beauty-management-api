# Beauty Management Monorepo

Backend multiempresa para agenda, confirmação, sinal, clientes, histórico técnico, sessões, pagamentos e retornos.

## Comandos

```bash
npm install
npm test
npm run lint
npm run build
npx wrangler deploy --dry-run
```

## Operations Worker

O Worker inicial de Operations e um runtime Nest isolado, com apenas `GET /health`.
Ele nao acessa banco nesta fundacao e deve ser iniciado com `SERVICE_ID=beauty-operations-worker`.

```bash
npm run start:operations
npx nest build operations-worker
```

A decisao de persistencia para os Workers Cloudflare esta registrada em
`docs/adr/0009-d1-persistence-for-cloudflare-workers.md`. O dominio de Operations
e os bindings D1 permanecem para o proximo PR.

## Documentação

- Produto e negócio: `docs/00-product/` e `docs/01-business/`
- Arquitetura e Workers: `docs/02-architecture/` e `docs/03-workers/`
- Infraestrutura: `docs/04-infrastructure/`
- Requisitos transversais: `docs/05-cross-cutting/`
- Desenvolvimento e operação: `docs/06-development/` e `docs/07-operations/`
- Instruções do Codex: `.codex/`
