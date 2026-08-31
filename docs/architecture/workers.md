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
## Operations Worker

Logical ownership includes tenant operations, professionals, services, customers, scheduling, appointment admission and the SaaS license read-side. Licensing remains logically bounded but co-deployed for the MVP. Platform administration may be split in a future worker.

## Clinical Worker

Owns technical assessments and their eligibility decision. Operations consumes the narrow shared contract through a Service Binding boundary; Clinical domain does not import Operations domain.

## Runtime entrypoints

Each Worker has an independent `wrangler.jsonc` pointing to `src/worker.ts`. `main.ts` is retained only for Node/dev smoke. The Module Worker adapter currently qualifies `fetch`, health and 404; full Nest HTTP pipeline qualification remains explicit work, not an implicit consequence of the Node entrypoint.

Clinical sessions may transition authoritatively from `IN_PROGRESS` to `COMPLETED` in Clinical. The minimal `SessionCompleted` fact is delivered through the Clinical outbox and Operations applies the tenant-scoped Appointment transition to `COMPLETED`.
