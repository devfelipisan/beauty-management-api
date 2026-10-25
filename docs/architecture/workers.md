# Topologia dos Workers

Frontend → BFF Worker → Business Workers → Application → Domain → Ports → Adapters.

## Implementação atual

- `beauty-management-api`: aplicação Node de base, com health.
- Operations: tenants, licenciamento, profissionais, serviços, clientes e agenda.
- Billing: termos comerciais, sinais, pacotes, pagamentos e movimentos financeiros.
- Clinical: avaliações, sessões, ficha técnica, equipamentos, intercorrências e mídia.
- BFF e Async permanecem previstos, sem aplicações nesta entrega.

Cada Worker tem configuração Wrangler, composição e entrypoints próprios.
`worker.ts` implementa o transporte Cloudflare; `composition-root.ts` compõe
casos de uso e adapters; `main.ts` mantém o runtime Node/dev separado.
Não há equivalência implícita entre o pipeline Nest e as rotas Cloudflare.

Os domínios vivem em `domains/` e não importam outros contextos. Pacotes
técnicos vivem em `packages/`; contratos e Service Bindings conectam Workers.
O BFF futuro não acessará banco nem executará domínio.

Clinical publica fatos de sessão via outbox e Operations aplica seus efeitos
locais. Billing possui suas próprias regras financeiras. Tenants e licenciamento
permanecem em Operations; não são criados novos bounded contexts nesta etapa.

## Limitação física

Os três Workers ainda apontam para o mesmo D1 e a mesma pasta de migrations.
Workspaces isolam código, não bancos. A separação física exige revisar ownership,
referências entre tabelas e harness de testes. Ver ADR-0014.

As descrições anteriores de Workers health-only eram registros da fundação,
superados pela implementação dos fluxos de negócio.
