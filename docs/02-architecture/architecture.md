# Architecture

Backend modular orientado a domínio, distribuído em poucos deployments independentes de Cloudflare Workers. A segmentação física não transforma automaticamente cada módulo em microsserviço.

Fluxo lógico: Frontend → BFF Worker → Business Worker → Application → Domain → Ports → Infrastructure.

Topologia inicial: BFF, Operations, Clinical, Billing e Async Workers; D1 para persistência relacional Free-first, KV para dados efêmeros/cache e R2 para binários privados.

