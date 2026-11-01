# Primeira publicacao gerenciada

Este documento reúne a autorização de escopo, os critérios de evidência e a
recuperação da primeira publicação efetiva de Billing, Clinical e Operations.
As referências desta autorização são versionadas no SHA de controle do workflow.

## Autorizacao

Origem: orientação do solicitante nesta conversa, em 1 de novembro de 2026.
O solicitante informa que os três Workers estão provisionados com versões
provisórias e que não existem sessões em produção. A operação é a primeira
publicação gerenciada da aplicação, não uma atualização de aplicação homologada.
Não foi comprovado que os placeholders correspondem ao bootstrap privado do código.

Reutilizar exclusivamente `firstPublication()` pelo workflow Controlled first
publication, na branch feature/microsservices, com publicação na ordem Billing →
Clinical → Operations. A aprovação efetiva permanece obrigatória no Environment
production do GitHub Actions. Esta orientação e este documento não substituem
essa aprovação nem declaram a infraestrutura pronta.

O arquivo `.github/deploy/first-publication.json` referencia este documento. O SHA
candidato e os três version IDs devem ser preenchidos a partir de evidências reais
antes da execução. Enquanto estiverem ausentes, o contrato existente bloqueia a
publicação. Não inserir valores ilustrativos nem escolher o SHA somente por ser o
mais recente. O SHA de controle pode ser posterior ao candidato.

## CI

A evidência de compatibilidade será a execução aprovada dos testes de integração,
RPC, contratos, arquitetura e manifestos já existentes. Usar o verify aprovado do
CI de push confiável do candidato e os testes obrigatórios do workflow manual.
Não criar testes ou validadores alternativos para contornar reprovações.

`firstPublicationEligible()` recupera da API a identidade real de CI/verify. O
relatório `.cache/first-publication/result.json` preserva ciRunId, ciRunAttempt,
verifyJobId, SHA candidato, SHA de controle e digest do manifesto. O GitHub
Deployment de cada versão nova conserva essas mesmas associações. A evidência de
execução deve ser consultada nesses registros; este documento não contém um run ID
presumido nem afirma que um CI remoto já passou.

Os testes comprovam os contratos do conjunto candidato. Não comprovam
interoperabilidade funcional com placeholders desconhecidos. A primeira publicação
deve ocorrer antes da abertura do serviço e durante a janela descrita abaixo.
Readiness, migrations D1 existentes, configurações privadas, bindings e aprovações
de mídia/capacidade R2 continuam obrigatórios. Migrations são uma operação separada.

## Recuperacao

Usar os version IDs e deployment IDs atuais dos três Workers como snapshot inicial,
coletado pelo inventário somente leitura. Exigir uma versão a 100% por Worker e
preservar os dados antes de aprovar o pedido versionado. Confirmar na Cloudflare a
disponibilidade das versões para eventual recuperação.

O fluxo existente compara o snapshot declarado com o estado remoto, preserva as
versões antigas como proveniência desconhecida e relê as versões antes de cada
publicação. Não atribuir o SHA candidato ou um manifesto aos placeholders antigos.

Em falha parcial, manter o serviço fechado, suspender tentativas automáticas e
consultar o artefato first-publication-<run>-<attempt> junto ao inventário remoto
atual. Ele registra as versões antigas e as novas versões já confirmadas. Uma
falha de upload do artefato exige reconstrução do inventário pela Cloudflare e
pelos registros da execução, sem presumir que nenhuma alteração ocorreu.

O responsável operacional deve decidir e aprovar a recuperação: restaurar as
versões antigas disponíveis ou revisar a conclusão da implantação. Restaurar
placeholders não representa recuperação funcional da aplicação; pode somente
restabelecer o estado provisório anterior. Não há rollback automático de migrations,
dados D1, objetos R2 ou eventos/efeitos de Outbox. Não remover registros GitHub para
forçar uma nova primeira publicação. Registros inválidos ou topologia mista exigem
recuperação separada.

## Janela

Definir a janela como primeira implantação, antes da abertura da aplicação. O
solicitante informou ausência de sessões em produção. Antes de aprovar production,
o responsável operacional deve confirmar também a ausência de usuários ativos,
integrações e consumidores operacionais que possam ser afetados, além da
coordenação de escritores/agendamentos que possam atuar durante o rollout.
Essa confirmação ainda não foi observada nesta sessão e não é produzida pelo script.

Manter ingresso e integrações fechados durante a troca dos três Workers e durante
eventual recuperação. Abrir a aplicação somente depois dos pós-checks, da validação
do conjunto final, do registro das três versões e do sucesso da execução protegida.
Se qualquer pré-condição não puder ser confirmada, não aprovar a publicação.

## Encerramento

Após a primeira publicação concluída, todos os releases seguintes usam o CI/CD
normal, com proveniência anterior obrigatória. O caminho inicial exige NO_RECORDS
nos três Workers; não pode ser reutilizado para uma topologia homologada ou mista.
O request normal permanece mode=deploy. Não há bypass de proveniência, novos
publicadores, dependências adicionais ou alterações de domínio neste documento.

Estado desta preparação: documento criado; inventário remoto, seleção do candidato,
janela confirmada, aprovação production, publicação e homologação ainda pendentes.
