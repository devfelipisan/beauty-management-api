# ADR-0017 — Leituras pré-login pelo seletor via Service Binding

Status: implementação solicitada; publicação depende de rollout.

## Requisito atual

O solicitante informou que ainda não existe autenticação e determinou o uso do seletor de empresa, função e profissional. Esse requisito substitui, para as leituras demonstrativas, a premissa anterior de JWT técnico obrigatório; não altera a autenticação de comandos nem cria uma identidade a partir do seletor.

## Decisão

Adicionar `OperationsWorker.readSelectedWorkspace(Request)` como porta RPC exclusivamente de leitura, acessível por Service Binding com `ctx.props.caller=beauty-management-web`. Não adicionar endpoint HTTP anônimo. O Web publica o seletor sem login; a configuração do binding identifica o Worker chamador, não a pessoa que usa a interface. Chamador ausente/incorreto, métodos diferentes de GET e caminhos fora da allowlist são negados. Headers e payloads não substituem os props do binding.

O catálogo e a resolução de contexto consultam tenants, roles, role_permissions e profissionais ativos no D1 existente. Conservar tenant predicates, escopo profissional e grants de leitura atuais. Construir um contexto `mode=selector` sem actorId ou membership fictícios. Aplicações de leitura aceitam explicitamente esse modo e vinculam cursores a uma namespace separada de identidades autenticadas. Somente as permissões agenda.read, customer.read, professional.read e service.read podem participar do contexto. Comandos não recebem esse contexto.

A seleção de profissional exige profissional ativo do mesmo tenant. Agenda e ficha profissional são limitadas à seleção. Quando o papel possui customer.read, clientes são limitados aos clientes vinculados aos agendamentos desse profissional. Sem esse grant, o Web usa os nomes associados à agenda autorizada, sem consultar o cadastro completo. Nenhuma auditoria de usuário ou outbox é produzida por leitura. Não modificar tabelas, migrations, preços, FSMs ou fluxos financeiros.

## Compatibilidade e implantação

As rotas HTTP existentes permanecem com autenticação JWT/membership. Não usar token mockado, AUTH_PROVIDER=mock em produção ou x-actor-id para alcançar o banco. Publicar primeiro este receiver no Operations existente, a partir da branch multiworker feature/enhanceAppointmentBilling; a main legada não contém esse runtime. Depois publicar Web com as duas flags habilitadas e props no binding. Web com receiver antigo falha explicitamente; não há fallback de transporte.

Rollback: desabilitar BEAUTY_DEMO_OPERATIONS_ENABLED no Web, retornando à prévia sintética opcional. Nenhum dado D1 deve ser removido. O modo Access/OAuth2 do Web permanece uma opção explícita futura, não uma dependência do seletor.

## Validação

Testar RPC real com props corretos/ausentes/forjados, consultas D1 persistidas, reload, tenant/role/profissional inválidos, escopo de profissional, cursor de outro contexto e negação de todos os comandos sem escrita. Reexecutar testes de HTTP autenticado para comprovar que a porta anterior mantém suas exigências.

Evidências locais: typecheck e lint aprovados; 501 testes unitários e 102 testes de Workers/D1 aprovados; dry-run dos três Workers aprovado. Integração com Web/OpenNext local validou Service Binding real, catálogo, contexto, registros persistidos, troca de tenant, profissional e reload sem JWT. Não houve deploy nem acesso/escrita ao D1 remoto.
