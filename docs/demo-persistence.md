# Demo compartilhada com persistência

Referência: `feature/microsservices` na API e `main` no Web. A topologia existente usa Operations, Billing e Clinical com D1. Não há nova arquitetura de armazenamento.

## Implementação disponível

O receiver privado `executeSelectedWorkspaceCommand(Request)` permite criar clientes, profissionais e serviços nos tenants de `SELECTOR_DEMO_TENANT_IDS` (array JSON validado). Requer binding com `props.caller=beauty-management-web` e `SELECTOR_DEMO_WRITES_ENABLED=true`. Ausência da flag mantém escrita desabilitada. A entrada pública HTTP continua exigindo autenticação.

Cada comando revalida tenant ativo, role ativa, grants persistidos e seleção profissional. Os comandos de cadastro são indisponíveis para contexto profissional. Não há identidade ou membership fabricada; auditoria tem actor nulo e metadata de sistema/demo, função selecionada e sessão de correlação. `x-demo-session-id` é UUID v4 de correlação, não autenticação.

Entradas rejeitam campos desconhecidos. Os vínculos usam referências do mesmo tenant e são gravados atomicamente com entidade, auditoria e registro idempotente. `Idempotency-Key` é obrigatório. Mesma chave e mesmo contexto/input retornam o resultado persistido; conteúdo diferente retorna conflito. Não há cobranças, mensagens ou outbox externo nesses cadastros.

`GET /v1/me/context` pelo receiver de leitura retorna `capabilities: {mode,shared,persistent,canWrite,actions}`. Apenas os três comandos implementados e concedidos à função são anunciados. O Web também precisa habilitar `BEAUTY_DEMO_WRITES_ENABLED`; sua desabilitação mascara as capacidades de escrita e bloqueia o transporte de comandos.

## Operação

1. Aplicar migrations incrementais, incluindo `0032_professional_specialty.sql`, antes de publicar os cadastros novos.
2. Preservar o D1 e o seed existente não destrutivo. Não executar reset ou substituir o banco no deploy. Registros de usuário não são reconstruídos a cada inicialização.
3. Configurar exclusivamente tenants sintéticos na allowlist. Com escrita habilitada, contatos demo persistidos são apresentados nas leituras de clientes; o modo de leitura restrita mantém sua redação anterior.
4. Publicar a API compatível e depois o Web, inicialmente com escrita desabilitada. Habilitar ambas as flags somente após os testes de integração.
5. Rollback: desabilitar ambas as flags. Dados e auditorias permanecem no D1. Não reverter migrations removendo colunas ou registros.

Usar o binding nativo também na homologação local. O adapter Web `local-http` não oferece RPC demo e não deve usar identidade mock para contornar esse limite.

## Matriz de compatibilidade e pendências

| Tela/ação Web                               | Contrato BFF                                                        | API/serviço/persistência                                                 | Permissão / situação demo                                                                |
| ------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Bootstrap e seleção                         | GET bootstrap/workspace e bootstrap/context                         | Operations, seletor privado, roles/tenants/professionals D1              | contexto validado e capacidades implementados                                            |
| Clientes: consultar/criar                   | GET/POST v1/customers                                               | Operations, Customer, customers D1                                       | customer.read / customer.create implementados                                            |
| Profissionais: consultar/criar/vincular     | GET/POST v1/professionals                                           | Operations, Professional e professional_services D1                      | professional.read / professional.create implementados                                    |
| Serviços: consultar/criar/vincular          | GET/POST v1/services                                                | Operations, Service e professional_services D1                           | service.read / service.create implementados                                              |
| Agenda e detalhe                            | GET v1/appointments, detalhe e actions                              | Operations, agenda D1                                                    | leitura existente; escrita e ações demo indisponíveis                                    |
| Criar agendamento                           | POST v1/appointments                                                | CreateAppointment existe em Operations com dependências Billing/Clinical | pendente compatibilizar resposta Web appointment/deposit e autoridade demo entre Workers |
| Confirmar/check-in/reagendar/cancelar/falta | contratos de ação Web ainda precisam ser integrados                 | casos de uso e handlers existentes em Operations                         | pendente entrada demo e interface executável                                             |
| Sinal                                       | POST v1/deposits/confirm                                            | RPCs createDepositForAppointment/confirmDeposit em Billing               | pendente contrato BFF e autoridade demo                                                  |
| Sessões e registros técnicos                | POST v1/sessions/start e complete; novas integrações técnicas       | Clinical e colaboração Operations/Billing                                | pendente contrato BFF e autoridade demo                                                  |
| Equipamentos                                | GET/POST v1/equipment                                               | casos de uso e rotas em Clinical                                         | pendente contrato Web/BFF e entrada demo                                                 |
| Pacotes e retornos                          | GET/POST v1/packages; telas de retornos                             | Billing materializeCustomerPackage e Clinical recommendReturn            | pendente contratos completos e fluxo demo                                                |
| Financeiro                                  | GET/POST v1/payments                                                | Billing registerPayment/receivables                                      | pendente contrato Web, autoridade demo e marcação financeira simulada                    |
| Leads e conversão                           | v1/leads e actions/status                                           | não exposto pelo registry BFF atual                                      | pendente implementação/integracão autoritativa                                           |
| Perfis/descontos                            | relationship-profile-configs, discount-policies, discount-approvals | não exposto pelo registry BFF atual                                      | pendente integração comercial                                                            |
| Usuários/equipes                            | GET/POST/PUT v1/users                                               | não exposto pelo registry BFF atual                                      | pendente administração exclusivamente demo                                               |
| Settings/branding/landing                   | tenant/settings, tenant-branding, tenant/landing-page               | não exposto pelo registry BFF atual                                      | pendente persistência/contratos e publicação limitada ao tenant demo                     |
| Catálogo/agendamento/lead público           | v1/public/:slug/*                                                   | não exposto pelo registry BFF atual                                      | pendente resolver slug e contratos públicos                                              |
| Auditoria e criação de tenant               | GET v1/audit, POST v1/tenants                                       | não exposto pelo registry BFF atual                                      | pendente contrato e política demo; sem concessão de acesso real                          |

Esta entrega é uma fundação com cadastros persistentes. Não representa a conclusão do critério de aceite de todas as telas nem da jornada cadastrar → agendar → atender → pagar. Não habilitar operações pendentes removendo seus gates de compatibilidade.

## Validação

`test/workers/selector-command.spec.ts` cobre binding real, criação/releitura, vínculos, auditoria sem usuário, replay/conflito idempotente, concorrência, falha de batch e negações de autoridade. `selector-read.spec.ts` preserva os cenários de leitura restrita. Rodar a suíte física com migrations aplicadas e os checks completos antes de promover. Teste local não comprova publicação remota, restart/deploy ou configuração da conta Cloudflare.

Resultados locais de 24/11/2026: API com lint/typecheck aprovados, 508 testes unitários, 113 testes físicos de Workers/D1 e quatro E2E aprovados; dry-run dos três Workers aprovado. No Windows, a suíte física foi executada com `--maxWorkers=1` após timeout de inicialização do pool concorrente. Web com `npm run validate` aprovado (71 testes, incluindo gates de release; três warnings de lint preexistentes) e `npm run build:cloudflare` aprovado no diretório original. Dependências locais foram reinstaladas/restauradas; lockfiles não foram alterados. O teste de release passou a normalizar CRLF para funcionar também no Windows.

Não foram executados deploy, migrations remotas ou homologação de navegador do fluxo completo. As flags de escrita versionadas permanecem `false`; o critério de aceite de todas as telas continua pendente conforme a matriz.
