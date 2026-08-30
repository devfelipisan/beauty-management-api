# ADR 0010 — Cloudflare Module Worker Runtime Adapter

## Decisão

O entrypoint Node (`main.ts`) permanece separado do entrypoint Cloudflare (`worker.ts`). Wrangler aponta para `worker.ts`, que exporta um Module Worker com `default.fetch()`.

Cloudflare é o adapter externo de runtime. Nest continua responsável pela composição e pelos application services; o domínio não conhece Cloudflare. O adapter atual expõe somente health e 404 enquanto a preservação completa do pipeline HTTP Nest (controllers, guards, pipes e interceptors) não estiver implementada.

Service Bindings são declarados na configuração do Operations Worker. RPC de Assessment e CommercialTerms permanece uma etapa posterior: não se simula resposta `READY` nem se transforma um binding ausente em sucesso.

## Consequências

- `app.listen()` nunca é executado pelo entrypoint Cloudflare.
- Cada Worker possui configuração Wrangler independente.
- O runtime local pode qualificar `fetch`, health e 404 sem alterar o domínio.
- Endpoints de negócio não são considerados qualificados apenas por existirem nos controllers Node.
