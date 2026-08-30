# Cloudflare runtime

Operations, Billing e Clinical possuem `src/worker.ts` como Module Worker e `src/main.ts` como entrypoint Node/dev separado. As configurações Wrangler apontam para os entrypoints Worker e usam a mesma `compatibility_date` (`2026-08-30`).

O adapter atual roteia `GET /health` e retorna 404 para rotas não implementadas. Isso qualifica a fronteira `fetch` sem declarar que o pipeline HTTP Nest foi reproduzido. Controllers, guards, pipes e interceptors continuam válidos no runtime Node até existir um adapter HTTP Cloudflare completo.

Operations declara D1 e os bindings `CLINICAL_SERVICE`/`BILLING_SERVICE`; Billing não recebe D1; Clinical declara D1. Contexto de tenant/actor não é armazenado em singleton global pelo adapter.
