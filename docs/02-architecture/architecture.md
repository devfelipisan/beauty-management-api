# Architecture

Backend modular orientado a domínio, distribuído em poucos deployments independentes de Cloudflare Workers. A segmentação física não transforma automaticamente cada módulo em microsserviço.

Fluxo lógico: Frontend → BFF Worker → Business Worker → Application → Domain → Ports → Infrastructure.

Topologia inicial: BFF, Operations, Clinical, Billing e Async Workers; D1 para persistência relacional Free-first, KV para dados efêmeros/cache e R2 para binários privados.

O monorepo usa npm Workspaces: `apps/` contém executáveis e composição,
`domains/` contém os contextos Operations, Billing e Clinical, e `packages/`
contém contratos e infraestrutura técnica compartilhada. Domínios não importam
outros contextos nem aplicações. Ver ADR-0014.

O isolamento atual é de código e deploy. Os três Workers ainda compartilham
o banco D1 e as migrations; o isolamento físico de dados exige uma etapa própria.

