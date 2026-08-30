# AGENTS.md

## Missão

Backend SaaS multiempresa para gestão de atendimentos por consulta, procedimento e sessão.

## Fonte de verdade

Interpretar, nesta ordem: requisito atual; `docs/01-business/business-rules.md`; ADRs; arquitetura; regras de dependência; máquinas de estado; cross-cutting; documento do Worker; infraestrutura; desenvolvimento; README; código e testes.

Divergências não devem ser resolvidas silenciosamente. Registrar a discrepância e não inventar comportamento.

## Arquitetura

Frontend → BFF Worker → Business Worker → Application → Domain → Ports → Adapters.

A Business API é a autoridade de negócio. O BFF compõe respostas e não acessa banco nem executa domínio.

## Regras absolutas

- Domain não depende de NestJS ou Cloudflare.
- Controllers não contêm regra de negócio.
- D1, KV e R2 só aparecem em adapters.
- Todo recurso tenant-owned é consultado com `tenantId`.
- Operações críticas avaliam idempotência, transação, auditoria e outbox.
- FSM é local ao agregado; não existe FSM global.
- Não inventar endpoint, estado, tabela, permissão ou integração.

## Desenvolvimento

Usar Nest CLI quando houver generator oficial. Antes de alterar, ler a documentação pertinente, inspecionar código, testes e migrations. Depois executar lint, testes, build e, quando aplicável, `npx wrangler deploy --dry-run`. Nunca fazer deploy real sem autorização.

## Nunca inferir

Endpoint, tabela, status, transição, permissão, timeout, retry, cron, desconto, sinal, regra financeira, retenção, tenant, variável de ambiente, integração externa ou política de armazenamento.

