# Topologia dos Workers

## Alvo

Frontend → BFF Worker → Business Workers → Application → Domain → Ports → Adapters.

Os Workers de negocio previstos sao Operations, Clinical, Billing e Async.
O BFF compoe respostas e nao acessa banco nem executa regras de negocio.

## Estado materializado nesta etapa

- `beauty-management-api`: runtime existente de base, com health.
- `operations-worker`: runtime Nest isolado, composition root proprio e `GET /health`.
- BFF, Clinical, Billing e Async: ainda nao materializados nesta etapa.

## Ownership de Operations

Operations sera a autoridade de negocio para tenants, profissionais, servicos,
clientes, disponibilidade e agenda. Nenhum desses dominios e implementado no
PR-05; este documento registra apenas o limite arquitetural.

Cada Worker devera possuir posteriormente seu proprio wrangler, bindings,
composicao, health check e observabilidade. O Operations Worker atual nao tem
binding D1 porque nao executa consultas.
