# Testing Strategy

`npm run test:architecture` verifica as fronteiras dos workspaces, exports,
dependências declaradas, ciclos e ausência de SQL/framework nas camadas internas.
`npm test -w @beauty/operations` executa somente os testes desse domínio.
O CI usa `npm run check`, incluindo a suíte Cloudflare completa para mudanças
em aplicações, domínios ou pacotes compartilhados.

`npm run test:e2e` compila os workspaces e verifica health nos quatro runtimes
Node. O harness usa JavaScript compilado para preservar metadados de DI Nest;
unitários e Cloudflare continuam resolvendo os fontes dos workspaces.

Níveis: unit (Domain/Policy/FSM), application (Use Case), contract (Ports/Repositories), integration (D1/Workers), architecture (fronteiras) e E2E (jornada HTTP/Worker). Cobrir isolamento tenant, duplicidade, conflitos, transições inválidas, campos técnicos, refund e histórico.

