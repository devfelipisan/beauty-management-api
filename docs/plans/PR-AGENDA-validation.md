# Agenda operacional — implementação e qualificação local

Data: 2026-11-05, America/Sao_Paulo. Plano versão 3.0.
Baseline API: `956cfbf9ed20f65d3beb2012bc8871efd5426386`.
Baseline web: `6d21da20cfc6ea0cc2766584945d649ce581374a`, com alterações locais
anteriores preservadas. Não houve commit, push, migration remota ou deploy.

## Decisões aprovadas durante a implementação

- agenda.read cobre listagem, resumo, detalhes operacionais mínimos e conflito.
- Sem grants automáticos; dados clínicos/financeiros mantêm suas permissões.
- 42 dias por consulta, página padrão 50 e máximo 100.
- RPCs legados sem política permanecem negados. Seus testes de domínio e D1
  chamam os casos de uso diretamente; testes dos receivers preservam a negação.

Ver [ADR-0016](../adr/0016-selected-workspace-authority.md) e
[contrato de agenda](../03-workers/operations-agenda-query.md).
O inventário inicial foi preservado como registro histórico separado.

## Resultado implementado

| Subsistema | Evidência |
| --- | --- |
| Autoridade | Grants por função, mapeamento central, seleção inequívoca V1 e seleção V2 revalidada nos receivers |
| Isolamento | Tenant em portas/SQL/joins, escopo profissional em agenda/detalhes/conflito/catálogo profissional |
| Fixtures | Identidade mock apenas no build local/teste; memberships/grants de Workers persistidos em D1 |
| Ocupação | RESCHEDULED alinhado à ADR-0015; nenhuma nova transição |
| Consulta | Filtros, sobreposição [from,to), cursor contextual, resumo independente da página e referências inativas |
| Detalhes | Dados mínimos; confirm/check-in projetados pela política compartilhada dos comandos |
| Conflito | Endpoint Worker preserva o formato existente sem prometer jornada ou reserva |
| BFF | Service Binding, contexto e correlação; DTO operacional sem valores fictícios ou cadastro completo de clientes |
| Web | Dia/semana/mês, paginação, filtros, detalhes, confirmação/check-in, conflito e atualização após comandos |
| Contexto web | Chaves por contexto, filtros específicos reiniciados, respostas antigas ignoradas e seleção mantida na agenda |
| Tempo | UTC no transporte, calendário no fuso do tenant; horário local inexistente/ambíguo é recusado explicitamente |

## Gates executados

O primeiro diagnóstico encontrou ferramentas ausentes e Node 24.18.0. As
dependências foram restauradas e a qualificação final utiliza um executável
temporário Node 24.22.1, correspondente à .nvmrc, sem alterar a instalação global.

| Gate | Resultado local |
| --- | --- |
| API npm run check | Aprovado: lint, typecheck, 501 testes unitários/arquiteturais, 94 físicos, 4 E2E, build e dry-run dos três Workers |
| Web npm run check | Aprovado na revisão final: lint sem erros, typecheck, 33 testes e build de produção |
| Web testes | 33 testes, incluindo 8 de agenda/contrato/tempo/proteção de produção |
| Integração física entre repositórios | 1 cenário BFF → Operations → dependências RPC/D1: criação autoritativa, leitura, detalhes, confirmação e troca de tenant |
| Navegador local | 6 cenários com respostas BFF sintéticas interceptadas: carga sem login no build dev, detalhe/ação/refresh, conflito, vazio, erro distinto de vazio e resposta atrasada de outro tenant |

Os testes de navegador não substituem a prova física de Service Binding. Os
cenários são registrados separadamente para não confundir mocks de apresentação
com qualificação de persistência ou execução dos comandos.

Foram corrigidos os problemas encontrados no navegador: hidratação divergente
por leitura antecipada de localStorage e redirecionamento da agenda ao dashboard
na troca de contexto. A repetição dos seis cenários não apresentou erros de
hidratação e manteve a página em /agenda após a troca.

A fixture de leitura com 250 registros percorreu três páginas sem duplicação
ou perda; EXPLAIN QUERY PLAN comprovou uso de idx_appointments_tenant_time.
Isso não constitui benchmark de capacidade de produção nem SLO de latência.

## Reprodução

Com Node 24.22.1 e dependências instaladas:

```text
# Raiz da API
npm run check
node scripts/qualify-agenda-bff.mjs

# Raiz do web
npm run check
```

A prova entre repositórios exige beauty-management-web como checkout irmão.
O script cria um único spec temporário e o remove ao terminar; não altera as
aplicações. As suites normais da API não dependem da presença do web.

## Limitações e liberação

- Paginação viva não oferece snapshot entre leituras ou páginas concorrentes.
- allowedActions cobre apenas confirmação/check-in cujas políticas foram avaliadas;
  ações clínicas/comerciais não são anunciadas sem avaliação completa.
- RESCHEDULED continua terminal na FSM. Continuidade após reagendamento não foi criada.
- Jornada, afastamentos, novos bloqueios e geração de horários permanecem fora do escopo.
- O formulário legado de criação do web tem contrato anterior incompatível e não
  é declarado homologado por esta entrega. O comando autoritativo de criação da
  API foi preservado e comprovado na integração física.
- Autenticação real, infraestrutura remota e publicação continuam sujeitos aos
  gates de segurança/release existentes. Não houve operação com dados reais.
- O lint do web mantém 10 avisos em arquivos/configurações anteriores; não há
  erros de lint na qualificação executada. Logs de negativas RPC são esperados
  nos testes de segurança e não representam cenários positivos aprovados.

Rollback não pode restaurar união de grants ou bypass de usuário. Preparar os
receivers compatíveis antes dos produtores V2; contextos V1 ambíguos falham fechados.
