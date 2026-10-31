# Testing Strategy

Resultados e limites da ampliação unitária: [relatório de cobertura](unit-test-coverage.md).

`npm run test:architecture` verifica as fronteiras dos workspaces, exports,
dependências declaradas, ciclos e ausência de SQL/framework nas camadas internas.
`npm test -w @beauty/operations` executa somente os testes desse domínio.
O CI usa `npm run check`, incluindo a suíte Cloudflare completa para mudanças
em aplicações, domínios ou pacotes compartilhados.

`npm run test:e2e` compila os workspaces e verifica health nos quatro runtimes
Node. O harness usa JavaScript compilado para preservar metadados de DI Nest;
unitários e Cloudflare continuam resolvendo os fontes dos workspaces.
`vitest.config.e2e.ts` fornece explicitamente APP_ENV=test, SERVICE_ID e as
demais configurações de fixture, incluindo autenticação mock restrita ao teste
e observabilidade desabilitada. Os E2E devem funcionar sem um arquivo .env local
e sem secrets de produção. A validação de configuração dos runtimes permanece
obrigatória; o teardown só fecha uma aplicação que chegou a ser criada.

Níveis: unit (Domain/Policy/FSM), application (Use Case), contract (Ports/Repositories), integration (D1/Workers), architecture (fronteiras) e E2E (jornada HTTP/Worker). Cobrir isolamento tenant, duplicidade, conflitos, transições inválidas, campos técnicos, refund e histórico.

