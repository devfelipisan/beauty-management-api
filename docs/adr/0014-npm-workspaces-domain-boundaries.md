# ADR-0014 — npm Workspaces e fronteiras de domínio

Status: accepted.

## Decisão

O repositório usa npm Workspaces com `apps/*`, `domains/*` e `packages/*`,
um único `package-lock.json` e instalação reproduzível com `npm ci`.

Operations, Billing e Clinical são os contextos implementados. Cada domínio
concentra módulos com Domain, Application, Ports e Infrastructure. As aplicações
mantêm transportes, composição Nest/Cloudflare, entrypoints e bindings.
Pacotes técnicos preservam suas responsabilidades existentes.

Dependências entre workspaces usam nomes `@beauty/*` e exports explícitos.
Domínios não importam outros domínios nem aplicações. Integrações entre Workers
usam os contratos e Service Bindings existentes. Tenants e licenciamento
permanecem em Operations. Não são introduzidos Identity, Platform, Experience,
BFF/Gateway ou Async nesta entrega.

## Runtime e compilação

NestJS permanece no runtime Node/dev. Cloudflare usa os Module Workers
existentes; não há migração para Hono nem equivalência implícita dos pipelines.
TypeScript project references compilam dependências antes dos consumidores.
Exports distinguem código fonte para bundlers/testes e JavaScript compilado
para Node. Cada workspace emite em seu próprio `dist/`.

Os bootstraps Node recebem `ExpressAdapter` explicitamente da dependência da
própria aplicação, sem depender de resolução implícita pelo pacote Nest Core.
Os testes E2E Node importam os módulos compilados e os exports JavaScript dos
pacotes, preservando os metadados de injeção gerados pelo TypeScript. O comando
`test:e2e` compila antes de executar esses health checks.

## Limitação física e próxima etapa

O isolamento nesta entrega é de código. Os três Workers ainda compartilham
o binding D1 e `database/d1/migrations`. Existem referências de Billing e
Clinical para tenants/clientes de Operations. A separação física exige revisar
ownership de tabelas, referências e testes com bancos independentes.
Não se deve copiar migrations para declarar artificialmente bancos isolados.

PostgreSQL continua legado. Não há provisionamento nem deploy remoto.
Os dados atuais são descartáveis, mas esta reorganização não recria bancos.

## Divergências identificadas

Documentos de fundação descreviam Workers como health-only, Billing sem D1 e
Clinical/Billing ainda não materializados. A implementação já contém esses
Workers e fluxos de negócio; esses textos históricos não descrevem o estado atual.
O anexo de arquitetura sugeria sete Workers e migração PostgreSQL→D1; esta
entrega mantém os três contextos existentes e o D1 já adotado no ADR-0009.

A extração também identificou casos de uso com SQL e tipos concretos D1,
decorators Nest na Application e um ciclo de tipos Authentication↔Tenancy.
SQL permanece com os mesmos comandos e parâmetros, agora em adapters atrás
de ports. Application recebe interfaces; Nest compõe os casos de uso por
factories. PermissionGuard requer apenas active/permissions do contexto,
eliminando a dependência reversa de Authentication para Tenancy sem mudar
a decisão de autorização.
