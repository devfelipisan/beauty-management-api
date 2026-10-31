# Beauty Management Monorepo

Segurança e implantação dos Workers: [relatório atual](docs/worker-hardening-implementation.md),
[decisões aprovadas](docs/adr/0015-worker-authority-and-release-safety.md) e
[runbook de liberação](docs/worker-release-runbook.md). A configuração remota ainda
usa o UUID confirmado do D1 e exige os quatro bindings JWT cadastrados manualmente
como secrets na Cloudflare; a entrega não efetuou deploy.

Backend multiempresa para agenda, confirmação, sinal, clientes, histórico técnico, sessões, pagamentos e retornos.

## Comandos

Requisitos: Node.js **24.22.1 LTS** (`.nvmrc`) e NestJS **12.2.0**.
No WSL com nvm, execute `nvm install` e `nvm use` antes de `npm ci`.

Swagger dos Workers: após `npm run dev:workers`, abra `/swagger` ou `/api-docs`
na URL exibida pelo Wrangler. Consulte [o guia de testes](docs/06-development/swagger.md).

```bash
npm ci
npm test
npm run test:workers
npm run lint
npm run build
npm run workers:dry-run
npm run check
```

## Operations Worker

`npm run dev:workers` inicia o conjunto local de Workers para desenvolvimento manual.
`npm run test:workers` executa os testes no runtime workerd via `@cloudflare/vitest-plugin`.
`npm run gate:physical-safety` executa lint, typecheck, suítes e dry-run dos três Workers.

Operations é a autoridade para tenants, licenciamento, profissionais, serviços,
clientes e agenda. Cloudflare usa `src/worker.ts`; `main.ts` mantém o runtime Node/dev.

```bash
npm run start:operations
npm run build:operations
```

A decisao de persistencia para os Workers Cloudflare esta registrada em
`docs/adr/0009-d1-persistence-for-cloudflare-workers.md`. O dominio de Operations
e os bindings D1 já estão implementados. Operations, Billing e Clinical ainda
compartilham o banco e as migrations; a separação física é uma etapa posterior.

## Billing Worker

Billing contém termos comerciais, descontos, sinais, pacotes, recebíveis,
pagamentos, refunds e créditos. Clinical contém avaliações, sessões, ficha
técnica, equipamentos, intercorrências e mídia clínica.

```bash
npm run start:billing
npm run build:billing
```

## Workspaces

- `apps/`: transportes HTTP/RPC, Nest, entrypoints e composition roots.
- `domains/`: Operations, Billing e Clinical, com Domain, Application, Ports e Infrastructure.
- `packages/`: contratos e responsabilidades técnicas compartilhadas.
- `database/d1/migrations/`: migrations compartilhadas nesta primeira etapa.

Dependências usam `@beauty/*` e exports explícitos. Domínios não importam
outros domínios; integrações usam contratos e Service Bindings. Cada workspace
compila para seu próprio `dist/`, com TypeScript project references.

`npm run build -w @beauty/operations-worker` compila essa aplicação e suas
dependências. `npm test -w @beauty/operations` executa seus testes unitários.
`npm run dev:operations` inicia somente Operations; para integrações locais use
`npm run dev:workers`.

Node usa exports compilados; Vitest/esbuild usam a condição `beauty` e Wrangler
usa `workerd` para resolver os fontes sem exigir um build anterior.
O CI executa a validação completa, inclusive quando pacotes compartilhados mudam.
Nenhum script de CI realiza deploy remoto.

Decisão: [ADR-0014](docs/adr/0014-npm-workspaces-domain-boundaries.md).

## Documentação

- Produto e negócio: `docs/00-product/` e `docs/01-business/`
- Arquitetura e Workers: `docs/02-architecture/` e `docs/03-workers/`
- Infraestrutura: `docs/04-infrastructure/`
- Requisitos transversais: `docs/05-cross-cutting/`
- Desenvolvimento e operação: `docs/06-development/` e `docs/07-operations/`
- Instruções do Codex: `.codex/`
