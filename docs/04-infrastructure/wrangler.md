# Wrangler

Cada Worker deve declarar bindings explicitamente e validar tipos com `npx wrangler types`. Mudanças de deployment devem ser verificadas com `npx wrangler deploy --dry-run`; deploy real exige autorização explícita.

`npm run workers:dry-run` valida Operations, Clinical e Billing separadamente,
usando as configurações de `apps/*-worker/wrangler.jsonc`. A condição de export
`workerd` resolve os fontes dos workspaces; não é necessário um build Node prévio.
Nesta entrega, bindings, nomes dos recursos e migrations compartilhados são
preservados. Não há provisionamento nem aplicação de migrations remotas.

