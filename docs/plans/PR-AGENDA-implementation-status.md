# Agenda operacional — implementação e decisões pendentes

> Inventário histórico do início da execução. As aprovações e o estado atual
> estão em [validação da entrega](PR-AGENDA-validation.md) e na ADR-0016.
> As menções a pendências abaixo descrevem a baseline, não o resultado final.

Data: 2026-11-05. Plano de referência: versão 3.0 fornecida pelo solicitante.
Baseline: `956cfbf9ed20f65d3beb2012bc8871efd5426386`, branch
`feature/microsservices`, checkout inicialmente sem alterações.

## Escopo e autoridade

Operations continua proprietário dos agendamentos. A agenda será uma projeção
de leitura, sem novo agregado, Worker ou fonte de verdade. BFF não acessa banco.
Jornadas, afastamentos, novos bloqueios e geração de horários estão fora da entrega.
Não há autorização para publicação remota.

O pedido de implementação mantém expressamente condicionadas as propostas de
permissão e contratos. Este documento não as aprova nem cria grants.

## Inventário confirmado

| Área            | Evidência e situação                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Identidade      | `WorkerSecurity` compõe JWT/JWKS ou identidade mock restrita ao build local/teste                                                          |
| Membership      | `D1TenantMembershipProvider.findActiveMembership` agrega grants de todos os papéis ativos                                                  |
| Contexto        | `/v1/me/tenants` e `/v1/me/context` já existem; contexto valida seletores, mas retorna grants agregados                                    |
| HTTP            | Operations, Billing e Clinical consultam membership; Nest utiliza `TenantGuard`                                                            |
| RPC             | `userRpcMetadata`, `bindRpcAuthority` e `authorizeWorkerRpc` compartilham a propagação V1; o contrato também existe em `@beauty/contracts` |
| Fixture RPC     | O caminho local simplifica autorização; não constitui prova de equivalência com produção                                                   |
| Persistência    | `database/d1/migrations` contém a cadeia D1; `0026_identity_rbac.sql` define identidade, memberships, roles e grants                       |
| Agenda          | `appointments` e índices por tenant/tempo e profissional/tempo já existem                                                                  |
| Ocupação        | Consulta de disponibilidade e escritas excluem somente CANCELED e EXPIRED; política excluía também RESCHEDULED                             |
| Disponibilidade | Nest possui GET de disponibilidade; caso de uso verifica intervalo, sem jornada e com bloqueios vazios                                     |
| Web             | Checkout irmão `beauty-management-web` existe e contém `src/components/agenda/agenda-page.tsx`; não foi alterado                           |

Inventário HTTP inclui criação, confirmação, check-in, reagendamento,
cancelamento e ausência. A nova agenda e os detalhes ainda não foram expostos.
Os contratos RPC atuais precisam de evolução coordenada, incluindo validadores,
produtores, receivers e composição dos três Workers.

## Decisões para a autorização por função

A seleção solicita um contexto; o backend resolve a autoridade a partir de
identidade, membership e grants atuais. O mapeamento público será centralizado:
administrator → tenant_admin; reception → reception; professional → professional.
Não será criada união de grants por operação. Sem seleção, apenas uma função
operacional inequívoca poderá ser resolvida automaticamente.

O receiver RPC revalidará token, seleção, tenant, papel, grants e escopo. V1
continuará aceitável somente para contexto inequívoco. V2 carregará seleção,
nunca permissões confiáveis do chamador. Eventos de sistema permanecem sujeitos
às regras de Outbox e caller existentes, sem assumir uma função de usuário.

Restrições profissionais persistidas não serão removidas pela troca de função.
Contexto é por invocação; o cache de composição de segurança não deve armazenar
seleção de usuário. Dados sintéticos devem usar o mesmo mecanismo funcional.

Essa alteração transversal ainda não está implementada nem homologada. Não
declarar o PR-AGENDA-01 concluído a partir da correção isolada de ocupação.

## Alteração implementada: ocupação (PR-AGENDA-02)

A ADR-0015 já aprova que RESCHEDULED ocupa o novo intervalo persistido.
AppointmentOccupancyPolicy passa a seguir essa decisão e as consultas D1 atuais.
Testes unitários cobrem os dez estados existentes. O teste físico de reagendamento
é ampliado para reservar o intervalo anterior pelo fluxo autoritativo de criação,
além de verificar rejeição de nova reserva no intervalo reagendado.

A suíte física existente também cobre dois reagendamentos concorrentes e criação
concorrente com reagendamento. Sua presença não equivale a execução aprovada.

Nenhuma transição, tabela, grant ou endpoint é criado. A FSM mantém RESCHEDULED
terminal; continuidade de atendimento após reagendamento não é declarada pronta.

### Avaliação de confiabilidade

A alteração é em política pura. Os comandos existentes continuam responsáveis
por tenant, idempotência, UnitOfWork, auditoria e Outbox. Não se altera a fronteira
transacional nem o SQL de reserva/reagendamento, que já revalida conflitos.
Não há migration ou procedimento de deploy nesta alteração.

## Aprovações ainda necessárias

Responsável pelas decisões funcionais: solicitante/proprietário do produto.
Status de todas as linhas abaixo: pendente, sem aprovação presumida.

| Decisão                                                                | Etapas dependentes         |
| ---------------------------------------------------------------------- | -------------------------- |
| Aprovar agenda.read e cobertura de listagem, resumo e detalhes mínimos | PR-03, PR-04, PR-05, PR-07 |
| Definir permissão da verificação de conflito                           | PR-06                      |
| Aprovar campos públicos de listagem/detalhes e catálogo separado       | PR-03 e consumidores       |
| Aprovar resumo com os mesmos filtros, sem cursor/limite                | PR-03, PR-04               |
| Definir limite temporal, tamanho padrão e máximo de página             | PR-03, PR-04, PR-05        |

Sem essas decisões, não registrar a agenda básica como implementada. As propostas
de contrato mantêm UTC, intervalo [from,to), sobreposição e cursor composto por
startsAt/id. A paginação é viva e não garante snapshot sob mutações concorrentes.
Nenhum valor numérico será inventado.

## Validação da baseline

As primeiras tentativas de `npm.cmd run lint`, `npm.cmd run test:unit` e
`npm.cmd run test:workers -- test/workers/appointment-changes.spec.ts` falharam
antes de executar verificações: executáveis oxlint/vitest ausentes.
O diretório node_modules existia, mas não fornecia as ferramentas necessárias.

O Node disponível é v24.18.0; `.nvmrc` exige 24.22.1 e package.json exige

> =24.22.1 <25. PowerShell bloqueia npm.ps1; npm.cmd permite invocar npm sem mudar
> a política do sistema. A primeira restauração de dependências falhou com EACCES
> no download do registry npm e na escrita do cache externo. Uma segunda tentativa
> foi solicitada com execução ampliada; consultar o resultado final informado na
> entrega antes de considerar qualquer gate aprovado.

## Sequência restante

1. Resolver ambiente e registrar gates reproduzíveis.
2. Implementar e qualificar autoridade efetiva HTTP/RPC e fixtures persistidas.
3. Obter as aprovações contratuais acima antes das consultas dependentes.
4. Implementar contratos, projeção D1, HTTP, conflito e detalhes.
5. Integrar o web após contrato estabilizado e autorização de escrita no checkout.
6. Homologar isolamento, revogação, concorrência, replay, troca de contexto e
   rejeição de mocks no build de produção.

Cada etapa deve produzir seus próprios testes físicos, arquitetura, OpenAPI e
observabilidade. Não concentrar essas evidências na homologação final.
