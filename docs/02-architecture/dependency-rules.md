# Dependency Rules

Domain depende apenas de tipos e políticas próprias. Application depende de Domain e Ports. Adapters implementam Ports. Controllers dependem de Application. BFF depende de contratos HTTP e chamadas de Workers, nunca de Domain, Application ou banco. Infraestrutura não pode vazar para camadas internas.

Entre workspaces, usar dependências declaradas e exports explícitos `@beauty/*`.
Imports relativos permanecem dentro do mesmo workspace. Cada aplicação compõe
somente seu domínio; domínios não importam outros domínios nem aplicações.
Pacotes técnicos não importam aplicações ou contextos de negócio.

Casos de uso não recebem repositories concretos nem SDKs de persistência.
Nest compõe classes puras por factories; Cloudflare compõe casos de uso no
`composition-root.ts`. Contratos de integração ficam em `@beauty/contracts`.
O CI verifica essas fronteiras com testes arquiteturais.

