# Cloudflare runtime

Operations, Billing e Clinical possuem `src/worker.ts` como Module Worker e `src/main.ts` como entrypoint Node/dev separado. As configurações Wrangler apontam para os entrypoints Worker e usam a mesma `compatibility_date` (`2026-08-30`).

Os adapters atuais atendem health e as rotas de negócio implementadas, mantendo
404 para rotas desconhecidas. Isso não declara equivalência com o pipeline
HTTP Nest; controllers, guards, pipes e interceptors pertencem ao runtime Node.

Operations, Billing e Clinical declaram D1 e compartilham temporariamente
`beauty-operations-local` e `database/d1/migrations`. Operations declara
`CLINICAL_SERVICE`/`BILLING_SERVICE`; Billing e Clinical têm bindings para os
Workers consumidos por seus adapters. Cada chamada preserva seu contexto
de tenant/actor.

Os três Workers usam `WorkerEntrypoint` para RPC interno. Os adapters de
Operations aceitam contratos de transporte e mantêm falhas downstream como
bloqueio. O harness Cloudflare qualifica os Service Bindings existentes.

O harness oficial é `npm run dev:workers`, com Operations primeiro. A ordem futura de deploy é Clinical, Billing e Operations. O estado `not connected` do Wrangler local não é considerado prova de RPC.
