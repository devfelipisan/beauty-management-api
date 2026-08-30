# ADR-0009 — Persistencia D1 para Workers Cloudflare

Status: accepted

## Contexto

O repositorio ainda possui um adapter PostgreSQL legado, enquanto a topologia
de producao prevista usa Workers Cloudflare. O `operations-worker` desta etapa
nao executa consultas e, portanto, nao precisa de binding de banco.

## Decisao

Para os Workers Cloudflare, D1 e a estrategia de persistencia adotada. O acesso
sera feito somente por adapters que recebem `D1Database`; Application e Domain
continuam independentes do provedor. O adapter PostgreSQL existente permanece
legado e nao e convertido silenciosamente.

## Alternativas consideradas

- PostgreSQL como banco primario: preservaria o legado, mas conflita com a
  unidade de deploy Worker e exige uma integracao externa nao definida.
- D1 como fonte de verdade dos Workers: alinha o runtime ao ADR-0005 e ao
  contrato de infraestrutura existente.

## Consequencias

Nao ha RLS, `SELECT ... FOR UPDATE` ou constraints de exclusao implicitas do
PostgreSQL. Isolamento por `tenantId`, transacoes, idempotencia, auditoria,
outbox e concorrencia deverao ser implementados e testados nos adapters e
casos de uso quando o dominio for criado.

Nenhum `database_id`, recurso remoto ou binding e definido neste PR.
