# PR-DEPLOY — implementação e operação

Este documento implementa a revisão do plano sobre `e7429ec`. A mudança limita-se
à infraestrutura de publicação. Regras clínicas, financeiras, JWT, memberships,
Outbox, limites de perfil e contabilidade transacional não são alterados.

Revisão de encadeamento sobre `9a5ee2b`: substituir release exclusivamente manual
por CI → verify → workflow reutilizável → aprovação production → publicação.
Preservar dispatch manual para recuperação. A elegibilidade comum comprova o job
verify sem depender do término global do CI, eliminando a dependência circular.

## Solicitação de publicação

O release lê `.github/deploy/request.json` no SHA aprovado pelo CI. `mode: validate`
encerra a preparação sem executar o job de publicação; esse job aparece como
`skipped`, mesmo com CI aprovado. `mode: deploy` habilita a publicação do alvo
`worker`, após os controles de elegibilidade, proteção de production e preflight.
A solicitação atual seleciona os três Workers (`worker: all`).

Para publicar esta alteração, ela precisa integrar `feature/microsservices` e
passar por uma nova execução de push. Reexecutar a run 41332401207 reutiliza o SHA
99c999e e sua solicitação em modo validate; não incorpora esta mudança.
Pull requests e pushes em main continuam sem publicação automática.
O Environment production deve disponibilizar `CLOUDFLARE_API_TOKEN` e
`CLOUDFLARE_ACCOUNT_ID`, além das proteções exigidas. A baseline vazia não deve
ser preenchida sem evidência real: inventário e readiness continuam necessários
para comprovar a proveniência de versões existentes.

## Separação dos fluxos

| Fluxo      | Entrada                                              | Credencial Cloudflare               | Efeito                                 |
| ---------- | ---------------------------------------------------- | ----------------------------------- | -------------------------------------- |
| CI         | Push/PR em main e feature/microsservices             | Nenhuma                             | Gates locais                           |
| Release    | CI push aprovado ou dispatch; request.json do SHA    | Deploy, production                  | Publica destinos selecionados          |
| Migrations | Inspeção; aplicação com execução anterior comprovada | Migrations, production-migrations   | Histórico D1 sequencial                |
| Readiness  | Dispatch protegido                                   | Deploy, production                  | Inspeção; baseline explícita no GitHub |
| Bootstrap  | Dispatch protegido com apply explícito               | Deploy, production                  | Cria somente Workers privados ausentes |
| Auditoria  | Dispatch em main                                     | Audit, infrastructure-audit         | Somente leitura                        |
| Inventário | Dispatch na feature/microsservices                   | Inventory, infrastructure-inventory | Observação sem autorização de release  |

Os fluxos mutáveis compartilham `beauty-production`. O release não provisiona
recursos, aplica migrations ou habilita mídia. A ativação semanal da auditoria
permanece pendente de homologação manual e publicação do controle na main.

## Inventário independente — revisão 0ac259e

Infrastructure inventory usa Environment próprio na feature, required reviewers e
CLOUDFLARE_INVENTORY_TOKEN somente leitura. Não depende de CI aprovado, SERVICE_VERSION,
bindings compatíveis, baseline ou readiness. Requer o descritor do workflow na main
para disponibilizar workflow_dispatch, mas executa exclusivamente no SHA selecionado
da feature, sem migrar infraestrutura-audit ou suas credenciais.

O coletor observa seis endpoints (settings e deployments por Worker), acumula achados
sanitizados e preserva falhas parciais. A análise usa as mesmas regras do release;
o validador continua lançando a primeira falha, na ordem anterior. Testes de regressão
comparam o comportamento contra o código do commit-base. Não há tolerância selecionável
por variável de ambiente que libere uma publicação.

Inventário completo não significa infraestrutura pronta. IDs e tráfego das versões
são observações; SHA declarado é não homologado. Recursos não consultados são listados
como não verificados. O coletor não aprova baselines, cria registros de deployment,
inspeciona D1/R2, modifica recursos ou altera capacidade. Erros de acesso/transporte
e respostas inválidas causam falha operacional com artefato parcial preservado.

O seletor de Service Binding `environment: production` equivale à ausência do
seletor: o schema oficial `workers_binding_kind_service` da
[API Cloudflare](https://github.com/cloudflare/api-schemas/blob/main/openapi.yaml)
declara `production` como default. Ambos são normalizados para a mesma representação
em preflight, pós-check, readiness e auditoria. Ambientes nomeados como `staging`
e `default` continuam distintos, assim como service, entrypoint e props.caller.
Essa equivalência corrige o bloqueio observado na run 41334827366 sem alterar
destinos, Wranglers ou manifesto. Configuração histórica, contratos, versão
real e proveniência exigem homologação administrativa separada. Text extras não
declarados continuam rejeitados, corrigindo a interpretação anterior das capturas.

## Organização e contratos

`scripts/deploy` contém contrato, validação local, manifesto, clientes, política de
SHA/CI, preflight, pós-check e orquestração. `scripts/infra` contém readiness,
auditoria e migrations. Os comandos anteriores delegam aos módulos correspondentes.

O manifesto versionado registra nomes dos métodos RPC, eventos por ownership,
hashes dos contratos compartilhados e assinaturas, dependências aceitas, hashes
das migrations e configuração de cada Worker. A revisão deriva das definições
reais, normalizadas pelo scanner TypeScript; não representa homologação automática.
Alterações semânticas exigem revisão e testes de interoperabilidade. Alterar o
manifesto não torna uma alteração incompatível segura.

`manifest-check.mjs --write` é uma ferramenta explícita de autoria. O CI somente
compara. Revisões adicionais aceitas e transições anteriores precisam de revisão
documentada. O simulador verifica a topologia atual e cada etapa de `all`;
expand → migrate → contract permanece obrigatório.

## Rastreabilidade

Cada destino aprovado no pós-check gera um GitHub Deployment com SHA da aplicação,
versão Cloudflare, hash do manifesto e execução responsável. O manifesto é
recuperado no SHA publicado. Uma execução global falha não invalida o destino
anterior já verificado. Versões sem associação comprovada bloqueiam o preflight.

A primeira adoção requer `.github/deploy/baseline.json` preenchido a partir do
inventário real e referência de homologação, seguido pelo readiness `baseline`.
O arquivo vazio é intencional: nenhum histórico fictício foi criado. A declaração
é conferida contra metadados ativos antes de registrar qualquer baseline.

O controle do release usa o SHA confiável do chamador em checkout separado;
a aplicação usa exatamente o SHA selecionado. Assim, um SHA anterior não troca
o orquestrador por um script de publicação antigo. O release revalida a solicitação
e o CI depois da aprovação.

No caminho automático, validar push próprio, branch e workflow CI autorizados,
SHA igual ao da execução e tentativa atual, além de verify concluído com sucesso.
No manual, exigir o run push confiável mais recente encerrado e verify aprovado,
sem exigir sucesso da publicação. Procurar verify por nome exato e tentativa,
reutilizando uma tentativa anterior somente se as posteriores não o reexecutaram.
Evidências históricas ficam vinculadas à tentativa aprovada; novos registros incluem
origem, execução/tentativas, job verify e SHA de controle. Preservar registros legados.

Somente o job protegido de publicação usa beauty-production; não duplicar o grupo
no chamador. Não há cancelamento do trabalho em andamento nem garantia de fila FIFO
para trabalhos pendentes. Verify e prepare permanecem sem credenciais Cloudflare
e sem escrita em deployments. O chamador passa apenas o secret nominal autorizado.

## Preflight e pós-check

Revisão sobre `19b1af6`: comparar bindings por representação canônica, não pelo
objeto bruto da API. D1 usa database_id e aceita id legado quando o campo moderno
está ausente; aliases simultâneos precisam coincidir. Campos malformados são
rejeitados sem coerção. Service Bindings comparam service, entrypoint e environment,
equiparando ausência, null e o default documentado production no environment.
Entrypoint equipara apenas ausência e null; nenhum ambiente nomeado ou entrypoint
diferente é aceito implicitamente.

Settings não é prova documental de props.caller: a propriedade pode estar ausente.
Quando retornada, props precisa ter formato válido e corresponder ao contrato
declarado. A validação local continua exigindo caller; testes do serializador de
upload do Wrangler e de RPC físico com build de produção comprovam sua passagem
até o receiver. Caller ausente, incorreto ou recebido somente no payload é negado.

Normalização é compartilhada por preflight, pós-check, readiness e auditoria.
Transições aceitam database_id ou id legado sem converter manifestos históricos;
somente preflight aceita o estado anterior aprovado. Nas demais fases, transições
servem apenas para reconhecer nomes seguros de diagnóstico, nunca para aceitar
infraestrutura antiga.

O diagnóstico inclui binding opcional exclusivamente para nomes do contrato ou
transições aprovadas, com a mesma sanitização em CLI, resumo e artefato. Bindings
desconhecidos são rejeitados sem divulgar o nome recebido. Não registrar valores,
UUIDs dos recursos ou respostas remotas. Não adicionar consultas Cloudflare.

O preflight ocorre uma vez, comprova proveniência das dependências ativas, simula
a sequência, verifica Text e bindings e consulta somente migrations exigidas.
Operations consulta a existência do bucket; capacidade, inventário e aprovações
são exclusivos do readiness e dos gates transacionais de upload.

Não há listagem explícita de secrets. Text JWT é rejeitado quando observado;
a ausência de secrets obrigatórios é validada nativamente pelo Wrangler.
O pós-check invalida cache, confere somente o destino publicado: SHA, versão ativa,
bindings normalizados, agendamento e exposição workers.dev/preview. A autoridade de
caller é comprovada separadamente pelos controles acima. Não reentra no preflight.

## Evidências e limites

O cliente administrativo mede chamadas por operação/fase e duração; o relatório
separa GitHub, Cloudflare explícito e publicação Wrangler. Chamadas internas do
Wrangler e operações de runtime não são estimadas como chamadas administrativas.
Diagnósticos usam somente os campos aprovados e nunca respostas remotas brutas.

O teste integral mede **20 chamadas explícitas Cloudflare**: oito no preflight
(seis metadados de versões/configurações, uma consulta D1 e uma existência R2),
mais quatro por destino no pós-check. A meta 12–18 não foi atingida; comprovar a
versão ativa e a configuração exige essas leituras. Não foram removidos controles
para reduzir a contagem. Trata-se de medição simulada, não de consumo real.

O teste do validador original em `e7429ecf8802dad90f74803b7893b042ff307cb4`
reproduz 48 chamadas com transporte simulado para o fluxo anterior, incluindo
inventário de bootstrap sem criação. O novo fluxo reduz essa contagem para 20
(58,3%). Ambos são testes de orquestração, não medições de produção. Comparar
medições reais após primeira adoção; não prometer custo zero ou Free Tier.

## Liberação e rollback

Executar os gates completos e testes dos scripts. Configurar ambientes, credenciais,
baseline e migrations pelo [runbook](../worker-release-runbook.md). A primeira
homologação e a ativação semanal são atividades administrativas ainda não executadas.

Rollback exige outra publicação intencional de SHA compatível, CI confiável,
contratos e esquema aprovados. Preservar migrations, objetos, ledger e eventos;
não reintroduzir R2 em Clinical ou flexibilizar gates de upload/conclusão.
