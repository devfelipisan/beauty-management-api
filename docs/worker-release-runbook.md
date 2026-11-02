# Operação protegida dos Workers

## Diagnostico de falha nativa do Wrangler

WRANGLER_FAILED inclui wranglerReason (categoria fixa), exitCode e upstreamCode
numérico quando disponíveis. A mesma informação sanitizada aparece como anotação
de erro do GitHub Actions. Nenhuma saída bruta, token, URL assinada ou caminho do
processo é exposto. Os campos distinguem secrets obrigatórios ausentes, erro de
autorização, build, argumentos CLI, falha de processo e versão não confirmada.
Uma categoria não substitui a mensagem original e um código de API não comprova
sozinho a causa. Os testes e dry-runs não comprovam autorização de publicação.

O parser também ignora cores ANSI ao reconhecer Current Version ID. Uma saída de
falha nunca é usada como prova de publicação, mesmo que contenha um UUID válido.

## Politica atual do deploy completo

Por instrução do solicitante, o CI com request worker=all publica Billing →
Clinical → Operations após verify, testes/build e validação local do manifesto e
dos contratos candidatos. Não exige proveniência das versões anteriores nem faz
consultas próprias a Workers settings/deployments, D1, R2, capacidade ou exposição
antes/depois da publicação. O fluxo completo agora realiza zero consultas explícitas
de infraestrutura pelo orquestrador; as operações nativas de publicação pertencem
ao Wrangler/Cloudflare e não são contabilizadas como inspeções próprias.

O resultado exige sucesso do Wrangler e um version ID válido, registrando
verification=wrangler_confirmed e infrastructureVerification=not_performed.
Os registros GitHub associam SHA, CI, manifesto e versão publicada e indicam
verificationMethod=wrangler. Isso não comprova readiness, compatibilidade com o código
antigo durante a troca nem comportamento funcional em produção. Não há alteração
implícita de migrations ou aprovação fictícia de infraestrutura.

Não é necessário usar a publicação inicial extraordinária para contornar NO_RECORDS
no deploy completo normal. Deploys individuais e os workflows administrativos
explícitos conservam suas próprias verificações; não são acionados por worker=all.
Esta política substitui as exigências anteriores de primeira adoção para o CI de
publicação completa. A aprovação efetiva de production e o verify continuam exigidos.

## Escopo atual das verificacoes R2 no deploy

Por autorização explícita do solicitante, primeira publicação controlada e release
normal não consultam beauty-r2: foram retiradas as leituras de metadados, domínios,
privacidade e media_capacity desses caminhos. Esses aspectos não são atestados pelo
deploy. A verificação administrativa completa de infraestrutura permanece disponível
separadamente e não deve ser disparada como parte desta publicação sem autorização.

Os bindings declarados da aplicação são preservados, assim como validação de
Workers, versões, proveniência, configurações, D1/migrations e pós-checks. A mudança
retira consultas explícitas do orquestrador; não altera o uso do bucket pela aplicação.
O release completo normal agora executa zero consultas Cloudflare explícitas de
infraestrutura no teste simulado. Os testes de regressão rejeitam chamadas R2 ou media_capacity
durante a primeira publicação.

## Diagnóstico local somente leitura (WSL/Bash)

Quando o Bash enxerga variáveis mas Node não, exportar os valores no mesmo terminal.
Se Account ID continuar inválido, informar novamente apenas o identificador da conta:

```bash
export CLOUDFLARE_API_TOKEN GITHUB_TOKEN
read -r -p "Cloudflare Account ID: " CLOUDFLARE_ACCOUNT_ID
export CLOUDFLARE_ACCOUNT_ID
npm run infra:diagnose:readonly
```

Não incluir aspas, URL, prefixo CLOUDFLARE_ACCOUNT_ID= ou espaços no valor lido.
O diagnóstico local exige 32 caracteres hexadecimais; a validação do cliente
compartilhado permanece inalterada. Se os tokens ainda não estiverem definidos,
capturá-los sem eco com read -rs e exportá-los, sem colocá-los em comandos literais,
histórico Git ou chat. A sessão WSL e os secrets do GitHub Actions são configurações
independentes. Não usar set -x para diagnosticar credenciais.

O comando informa apenas visibilidade, presença e formato, sem imprimir valores.
LOCAL_CONFIGURATION_INVALID encerra antes de qualquer acesso à rede. Com variáveis
válidas, consulta os três Workers por GET, confere versões ativas e proveniência,
e continua os demais quando um falha. Erros e metadados são sanitizados.
PROVENANCE_CHECK_PASSED retorna zero; configuração inválida ou qualquer falha retorna
um. Não publica Workers, não registra Deployments, não executa migrations e não
carrega arquivos de credenciais automaticamente.

Token presente não comprova autenticação ou permissão. Se retornar connected e
PROVENANCE_UNAVAILABLE/NO_RECORDS, a configuração local foi ultrapassada, mas a
adoção inicial continua pendente. Este diagnóstico não substitui readiness nem
aprova publicação.

## Preparação administrativa

O código deste PR não executa mudanças remotas. Configurar manualmente:

| Environment              | Branch exclusiva       | Secret Cloudflare           | Capacidade                                                              |
| ------------------------ | ---------------------- | --------------------------- | ----------------------------------------------------------------------- |
| production               | feature/microsservices | CLOUDFLARE_API_TOKEN        | Workers autorizados; leituras necessárias de Workers, D1 e metadados R2 |
| production-migrations    | feature/microsservices | CLOUDFLARE_MIGRATIONS_TOKEN | D1 Read/Write                                                           |
| infrastructure-audit     | main                   | CLOUDFLARE_AUDIT_TOKEN      | Workers Metadata, D1 e R2 somente leitura                               |
| infrastructure-inventory | feature/microsservices | CLOUDFLARE_INVENTORY_TOKEN  | Somente leitura de settings e deployments dos três Workers              |

Ambientes mutáveis exigem required reviewers e política customizada de branch
exata; não basta criar o environment com esse nome. Cadastrar também
`CLOUDFLARE_ACCOUNT_ID` como variável do environment. Validar capacidades dos
tokens contra os endpoints usados; não adicionar escrita R2 ao deploy para uploads
realizados pelo binding do Worker. Retirar escrita D1 do token de deploy quando
o token independente de migrations estiver operacional.

Text de produção pertence ao Dashboard: APP_ENV=production, AUTH_PROVIDER=jwt,
OBSERVE_ENABLED=true, OUTBOX_BATCH_SIZE=5, OUTBOX_LEASE_SECONDS=60 e, em Operations,
MAX_PROFILE_IMAGE_BYTES=300000. Identidade da versão é comprovada por evidência GitHub
associada ao versionId Cloudflare; SERVICE_VERSION não é binding de runtime. Os quatro
nomes AUTH_ISSUER, AUTH_AUDIENCE, AUTH_JWKS_URL e AUTH_ALGORITHM permanecem em
secrets.required; cadastrar valores reais manualmente em cada Worker. Não colocar
valores em repositório, comandos, logs ou artefatos. Supabase é a arquitetura de
identidade aprovada; nenhum endpoint ou algoritmo é presumido.

## Inventário independente de homologação

O workflow Infrastructure inventory é manual, sem dependência de CI aprovado,
elegibilidade de release, readiness ou baseline. Configurar manualmente o Environment
infrastructure-inventory com required reviewers, uma política customizada de branch
exatamente feature/microsservices e a branch protegida contra alterações não revisadas.
Cadastrar CLOUDFLARE_INVENTORY_TOKEN exclusivamente nesse Environment e
CLOUDFLARE_ACCOUNT_ID como variável. O token não é compartilhado com jobs de CI.

Usar escopo Workers Metadata Read-Only (ou escopo individual equivalente para os
três Workers), verificando manualmente as capacidades nos endpoints GET de settings
e deployments. Não conceder escrita nem permissões D1, R2 ou de objetos. Não testar
permissões por tentativa de mutação. A API de
[settings](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/get/)
documenta os escopos de leitura aceitos. O coletor também restringe o transporte
a esses seis caminhos e rejeita corpos, SQL, métodos e endpoints arbitrários.

Pré-requisito do GitHub: workflow_dispatch exige o arquivo do workflow na branch
padrão para disponibilizar o disparo manual. A referência local de origin/main
inspecionada nesta entrega não contém o novo workflow. Registrar o descritor por
mudança revisada na main antes da ativação e selecionar feature/microsservices no
dispatch. Isso não migra a coleta nem as credenciais para main: o guard do workflow
e a política do Environment continuam exigindo a feature; o código inspecionado é
o SHA imutável do dispatch. Não remover a restrição de infrastructure-audit à main.
Nenhum push, merge ou registro remoto é executado por este código. Referência:
[eventos do GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch).

O inventário lê settings e deployments independentemente para cada Worker, mesmo
com configuração divergente, SERVICE_VERSION ausente e baseline vazia. O relatório
.cache/infrastructure-inventory/result.json e o resumo usam o mesmo JSON sanitizado:
nomes de bindings conhecidos, categorias de divergência, contagem de nomes
desconhecidos, estado de SERVICE_VERSION e IDs/percentuais observados de versões.
Valores Text, seletores, props, nomes desconhecidos, UUIDs de bancos, secrets e
respostas brutas não são registrados. Presença em metadados não comprova disponibilidade
de secrets. SHA declarado com formato válido é sempre marcado como não homologado.

complete significa coleta concluída, não infraestrutura pronta. Divergências e 404
são achados; acesso negado, transporte e metadados inválidos tornam a coleta partial
ou failed e o job falha, preservando o artefato com always(). Distribuições com
múltiplas versões são registradas sem eleger uma versão única. Leitura de settings
e deployments não é snapshot atômico: mudanças concorrentes exigem nova conferência
durante homologação. Não usar beauty-production como exclusão do inventário.

O cenário normal usa seis consultas Cloudflare, com cache apenas dentro da execução.
Não inspeciona schema, disponibilidade D1/R2, capacidade, objetos, autoridade RPC ou
valores de secrets, explicitamente listados como não verificados. Não executa Wrangler,
migrations, dispatchers, bootstrap, criação de GitHub Deployments ou escrita de baseline.
Nada no relatório autoriza uma publicação, altera aprovações ou aprova compatibilidade.

Usar os achados para conferir privadamente environment do OPERATIONS_SERVICE,
distinguindo-o de APP_ENV e do rótulo Produção do Dashboard. Comprovar se o vínculo
resolve para o Worker raiz ou ambiente nomeado. Não converter production em null:
uma equivalência exige prova documental/técnica e mudança independente, revisada e
testada. Alternativas são correção administrativa controlada ou transição exata
aprovada, sempre com pós-check rigoroso e autorização RPC preservada.

Se SERVICE_VERSION estiver ausente/inválido, comprovar o código realmente implantado
antes de qualquer correção administrativa desse metadado. Conferir novamente a versão
ativa após a mudança antes de registrar baseline. Não usar o SHA atual por conveniência.
Somente a homologação explícita de versões e contratos comprovados alimenta o procedimento
de baseline existente; o inventário não faz essa associação automaticamente. Bindings
Text extras não declarados também são divergências: a variável adicional mencionada
nas capturas precisa de inventário e revisão, não de aceitação automática.

## Primeira adoção

1. Executar Node de .nvmrc, npm ci, npm run check, node scripts/test-deployment.mjs,
   node scripts/worker-deployment-config.mjs, node scripts/deploy/manifest-check.mjs
   e git diff --check. Revisar manifesto, contratos e transições.
2. Se Workers estiverem ausentes, executar bootstrap privado em modo inspeção.
   Após revisão e aprovação, aplicar somente ausentes. A execução que cria Workers
   termina bloqueada deliberadamente; cadastrar configuração manual e iniciar
   outra solicitação. Não publicar a aplicação nesse procedimento.
3. Inspecionar migrations com D1 migrations, apply=false, no SHA revisado. Conferir
   artefato, dados existentes, pendências e compatibilidade anterior/futura.
4. Executar novamente o mesmo workflow no mesmo SHA, apply=true e inspection_run_id
   da inspeção bem-sucedida. A aprovação de production-migrations antecede aplicação.
   Histórico divergente, inspeção de outro SHA ou migration desconhecida bloqueiam.
   Inspeção consulta sqlite_master antes de d1_migrations; não exige media_capacity.
5. Provisionar recursos obrigatórios manualmente. Executar readiness. Para abrir
   uploads, revisar inventário de todo beauty-r2, privacidade, quotas, política e
   escritores coordenados; registrar aprovações reais pelo procedimento administrativo
   existente e executar readiness media. Não alterar flags para liberar publicação.
6. Inventariar SHA e versão Cloudflare ativa de cada Worker. Homologar contratos e
   interoperabilidade. Registrar em .github/deploy/baseline.json, para cada nome
   operations/billing/clinical, commitSha, versionId, qualificationReference e
   evidence conforme a seção de adoção inicial abaixo. Não preencher com versões
   ilustrativas. Revisar/commitar e executar Initial infrastructure adoption na
   feature/microsservices, com aprovação production. Infrastructure readiness,
   action=baseline, passa a somente revalidar uma baseline já registrada.
7. A solicitação permanece em mode=deploy por solicitação do usuário. O preflight
   bloqueia versões sem proveniência até a conclusão da adoção histórica ou da
   primeira publicação controlada; não é necessário alterar mode depois disso.

### Qualificação inicial independente

O novo workflow `.github/workflows/infrastructure-initial-adoption.yml` precisa
ter seu descritor na branch padrão para disponibilizar Run workflow no GitHub.
Executar selecionando feature/microsservices. Ele usa o Environment production
existente, revalida suas proteções, exige aprovação e compartilha a exclusão
beauty-production. Não publica Workers, não aplica migrations e não modifica D1/R2.
Usa Node de .nvmrc, npm ci e unzip (disponível em ubuntu-latest).

Reaproveitar Infrastructure inventory para coletar os version IDs ativos dos três
Workers. Esse inventário mantém seis GETs e não homologa proveniência. Consultar os
Deployments históricos: PROVENANCE_UNAVAILABLE agora inclui provenanceReason
NO_RECORDS quando não há registros ou NO_ACCEPTED_RECORD quando nenhum foi aceito.
Falhas de permissão/transporte continuam distintas. Não deduzir o código publicado
do SHA candidato, de uma tag, de SERVICE_VERSION ou da configuração observada.

Para cada entrada real da baseline, evidence contém quatro campos: runId
(inteiro), runAttempt (inteiro), artifactId (inteiro) e artifactDigest (sha256:
seguido de 64 hexadecimais). Obter os campos pela API oficial de Actions: metadados
do artefato e execução original; não usar um arquivo local editado como prova.
qualificationReference identifica a revisão humana da homologação e compatibilidade.
A baseline permanece vazia até esses dados reais estarem disponíveis e aprovados.

O verificador aceita o artefato imutável deployment-<commitSha>-<runAttempt>, não
expirado, emitido pelo workflow CI de push ou Deploy Beauty Workers manual da
feature/microsservices deste repositório. Confere identidade/tentativa da execução,
job de publicação e Environment production no workflow histórico, verify aprovado,
digest do ZIP e result.json, SHA, version ID e digest do manifesto. Exige que o
Worker esteja published e verification=passed. Um Worker concluído antes de outro
falhar pode ser homologado; pending/published_unverified não são evidência aceita.
Relatórios históricos com outro formato exigem um verificador específico revisado;
não converter um relatório desconhecido para forçar aceitação.

O manifesto e as configurações são recuperados do commit histórico e o manifesto
é recalculado a partir dos fontes. Os contratos RPC entre as três versões precisam
ser compatíveis. A qualificação verifica bindings, configurações de runtime,
agendamentos, exposição, D1, migrations, privacidade e aprovações/capacidade R2.
Depois invalida o cache e relê as três versões antes de qualquer registro GitHub.
Se uma versão mudou ou uma evidência falhou, não registra nenhuma entrada.

A baseline versionada é a declaração revisada; o workflow registra a associação
nos GitHub Deployments somente após validar o conjunto completo. Falha de escrita
GitHub pode deixar registros parciais, preservados no artefato initial-adoption.
Eles não são aceitos pelo release enquanto a execução de adoção não terminar com
success. Uma nova tentativa protegida revalida tudo. Não há transação distribuída
entre Cloudflare e GitHub; alterações administrativas externas não compartilham a
exclusão dos workflows e exigem uma janela operacional controlada.

Depois da homologação, o release reconhece o registro da execução protegida e a
baseline no SHA dessa execução, conferindo o manifesto no commit histórico. Não
requer que o artefato original permaneça disponível indefinidamente. Versões novas
ou modificadas manualmente sem associação válida continuam bloqueadas.

Se não houver artefato histórico íntegro e compatível, a adoção permanece bloqueada.
Usar o procedimento de primeira publicação controlada descrito abaixo, com
autorização específica, compatibilidade e recuperação revisadas.
O workflow de adoção histórica não publica Workers e não oferece skipProvenance.
Preencher a baseline sozinho ou executar novamente a run antiga não libera o deploy.

### Primeira publicação controlada quando não existe histórico

#### Coleta automatica dos version IDs

Com CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN exportados no WSL/Bash, executar
na raiz do checkout:

```bash
npm run infra:sync:first-publication
npx prettier --check .github/deploy/first-publication.json
git diff -- .github/deploy/first-publication.json
```

O comando usa cloudflareClient e activeVersion existentes: exatamente três GETs
de deployments em uma coleta bem-sucedida, um por Worker, sem D1, R2 ou publicação.
Exige uma versão única a 100%, preserva SHA e referências documentais e reutiliza
firstPublicationRequest para validar o contrato completo antes de gravar. Portanto,
o SHA candidato e as referências devem estar preenchidos previamente. O arquivo é
formatado pelo Prettier já instalado no projeto, sem dependências adicionais.

Se um versionId já registrado diferir do remoto, interrompe com
PUBLISHED_VERSION_MISMATCH e não modifica o arquivo. Falhas em qualquer consulta,
contrato inválido e edições locais concorrentes também impedem a gravação do
snapshot. Não há opção force: revisar o estado remoto e a autorização antes de
alterar IDs fixados. Os IDs obtidos não são prova da origem do código ativo.

Revisar e versionar o JSON coletado antes do workflow protegido. O comando não
aprova CI, não altera credenciais, não registra proveniência nem autoriza deploy.
Uma linha em branco inicial ou outro erro de estilo pode ser corrigido separadamente
com npx prettier --write .github/deploy/first-publication.json, sem acesso remoto.

A autorização documental da primeira implantação está em
[Primeira publicacao gerenciada](first-managed-publication.md). Ela reúne as
referências de CI/RPC, recuperação e janela usadas pelo pedido versionado, sem
substituir o snapshot remoto nem a aprovação efetiva no Environment production.

Controlled first publication (`infrastructure-first-publication.yml`) é um workflow
exclusivamente manual. Não é fallback do CI nem do preflight normal. O descritor
deve estar aprovado na branch padrão para disponibilizar Run workflow; executar
selecionando feature/microsservices. Compartilha beauty-production, não cancela
publicações em andamento e exige aprovação pelo Environment production.

1. Executar Infrastructure inventory e preservar os version IDs/deployment IDs e
   percentuais ativos dos três Workers. O procedimento só aceita uma versão a 100%
   por Worker. Não atribuir um SHA às versões antigas sem evidência.
2. Se houver artefato histórico compatível, preferir a adoção histórica. Caso não
   exista, revisar uma publicação nova do conjunto completo e os contratos RPC
   durante a troca Billing → Clinical → Operations. Revisar também efeitos de D1,
   R2 e Outbox: rollback de código não desfaz dados, eventos ou objetos persistidos.
3. Preparar e comprovar uma janela operacional sem tráfego de aplicação conflitante,
   com ingresso, chamadas entre serviços e escritores/agendamentos coordenados.
   Essa é uma exigência operacional revisada por humanos; o script não desliga
   automaticamente ingressos ou crons e não consegue comprovar essa janela pela API.
   Testes RPC físicos validam o conjunto candidato, não o código antigo desconhecido.
4. Aprovar um plano de recuperação para as versões antigas inventariadas, incluindo
   a disponibilidade dessas versões na Cloudflare e a compatibilidade com dados já
   gravados. A recuperação é uma operação administrativa intencional; não há rollback
   automático nem promessa de restauração transacional entre três Workers.
5. Registrar os dados reais em `.github/deploy/first-publication.json`, em um novo
   commit de controle revisado. O arquivo inicial workers={} é intencional e bloqueia
   publicação. Campos obrigatórios:

   | Campo                        | Conteúdo revisado                                               |
   | ---------------------------- | --------------------------------------------------------------- |
   | commitSha                    | SHA completo do candidato já aprovado pelo verify do CI de push |
   | authorizationReference       | Referência da autorização dessa primeira publicação             |
   | compatibilityReference       | Evidência da revisão de compatibilidade RPC e esquema           |
   | recoveryReference            | Plano de recuperação e disponibilidade das versões antigas      |
   | maintenanceReference         | Evidência da janela e coordenação operacional                   |
   | workers.billing.versionId    | Version ID ativo coletado do Billing                            |
   | workers.clinical.versionId   | Version ID ativo coletado do Clinical                           |
   | workers.operations.versionId | Version ID ativo coletado do Operations                         |

6. Disparar Controlled first publication na feature com commit_sha exatamente igual
   ao candidato declarado. O SHA de controle é o SHA da execução e pode ser posterior
   ao candidato: o arquivo de autorização não precisa referenciar o próprio commit.
   O CI de push confiável mais recente do candidato precisa estar encerrado e com
   verify aprovado; uma publicação normal falha por NO_RECORDS não invalida verify.
   O workflow valida branch, ancestralidade, execução, solicitação imutável, manifesto,
   testes completos e RPC/dry-runs antes da aprovação de produção.
7. Depois da aprovação, ele revalida as permissões de production e a solicitação,
   confere readiness, migrations existentes, privacidade e capacidade/aprovações R2.
   Preserva o snapshot antigo como proveniência desconhecida.
   O fluxo inicial exige NO_RECORDS nos três Workers. Se algum tiver registros
   existentes mas rejeitados (NO_ACCEPTED_RECORD), interrompe para recuperação.
   Estados mistos, com Workers confiáveis e outros sem registros, também são
   rejeitados. Se todos já forem confiáveis, usar o release normal.
   Falhas de acesso/transporte GitHub
   também bloqueiam; não são interpretadas como ausência de proveniência.
   Reconsulta as versões
   antes de cada publicação, publica o SHA exato com provisionamento desativado,
   executa pós-check por destino e readiness do conjunto final.
8. Só então registra as três versões novas no GitHub, com origem first-publication,
   SHA candidato, tentativa/verify do CI, SHA de controle e digest da autorização.
   Esses registros só são aceitos quando a execução e sua tentativa terminarem com
   success. Não homologa retroativamente versões antigas e não preenche baseline
   com valores presumidos. A baseline histórica pode continuar vazia: os registros
   das novas versões constituem a primeira proveniência gerenciada.

Em falha, consultar o artefato first-publication-<run>-<attempt> e o inventário atual.
O relatório conserva snapshot e versões novas já publicadas; não declara sucesso
parcial como conjunto homologado. Interromper a janela e executar a recuperação
revisada ou revisar uma nova solicitação com o snapshot atual, conforme a decisão
operacional. Se houver registros parciais, tratar como recuperação separada; não
remover registros ou contornar a política para repetir uma primeira publicação.
Não reexecutar cegamente: a solicitação antiga será rejeitada quando
as versões ativas tiverem mudado. Falha na escrita GitHub pode deixar registros
parciais; uma execução falha não os torna confiáveis.

O request.json normal permanece mode=deploy por solicitação do usuário. Isso não
dispensa a primeira publicação manual: pushes normais continuam bloqueados enquanto
não houver proveniência. Depois de concluído o fluxo extraordinário, um release
normal poderá utilizar os registros novos, sujeito aos demais gates. Os testes
locais não comprovam versões, manutenção, permissões ou publicação na conta real.

Um placeholder de bootstrap não é baseline de aplicação homologada. A remoção
administrativa de SERVICE_VERSION deve ocorrer somente após código sem dependência
estar aprovado. Como os três Wranglers usam keep_vars=true, a ausência de --var
não remove a variável do Dashboard. Removê-la explicitamente no cutover, registrar
os version IDs resultantes e confirmar ausência novamente após a adoção. Não
reutilizar proveniência de versões substituídas.

## Release normal

Cada push aprovado na feature/microsservices chama o release reutilizável dentro
do CI, após o job verify. O CI pode permanecer em andamento durante aprovação e
publicação: o preparo comprova verify pela API, sem esperar o workflow completo.
PRs e pushes em main não publicam. Não é necessário alterar requestId para disparar;
com mode=deploy e worker=all, cada push aprovado prepara uma publicação integral.
Branch protegida e aprovação efetiva são obrigatórias.

O caminho excepcional Deploy Beauty Workers → Run workflow continua disponível na
branch autorizada com SHA completo ancestral da feature. Exige a execução push
confiável mais recente daquele SHA encerrada e verify aprovado; falha ou cancelamento
posterior da publicação não impede recuperação manual. CI de PR não autoriza release.
mode, worker e requestId são lidos do request.json daquele SHA, mesmo se a branch
avançar. mode=validate termina no preparo, sem aprovação, credenciais Cloudflare ou escrita.

Conferir SHA e destinos no resumo antes de aprovar production. O checkout da
aplicação é imutável; o controle usa separadamente o SHA confiável da execução
chamadora (push do CI ou dispatch manual).
O orquestrador realiza um preflight remoto e publica Billing → Clinical → Operations
para all. Cada publicação passa por pós-check dirigido e registro de proveniência.
Não há aplicação implícita de migrations, bootstrap ou aprovação de mídia.

O chamador passa nominalmente somente CLOUDFLARE_API_TOKEN, sem secrets: inherit.
O secret real pertence a production e é usado apenas pelo job protegido; verify e
prepare têm token GitHub de leitura e não recebem credenciais Cloudflare em seus
steps. Ausência de valor bloqueia a publicação com diagnóstico sanitizado.

Antes da publicação, um step local verifica presença do secret CLOUDFLARE_API_TOKEN
e da variável CLOUDFLARE_ACCOUNT_ID. Valores ausentes ou compostos somente de espaços
bloqueiam o job sem chamadas Cloudflare e sem exibir os valores. Não recriar tokens
para corrigir divergência de nome: o release, readiness e bootstrap usam o nome
já cadastrado em production. Migrations e auditoria preservam suas credenciais próprias.

A exclusão beauty-production pertence ao job de publicação, não ao CI ou preparo.
Ela continua compartilhada com migrations, bootstrap e readiness, sem cancelar
execução em andamento. O GitHub pode substituir trabalhos pendentes do mesmo grupo;
não existe garantia de fila FIFO. Não duplicar esse grupo no workflow chamador.

Se houver erro, consultar código/fase/operation/worker/status no artefato sanitizado.

Quando disponível, binding identifica exclusivamente um nome declarado no contrato
ou em transição autorizada, como D1_DATABASE. O mesmo campo aparece no CLI, resumo
e artefato. Um binding desconhecido resulta em BINDING_MISMATCH sem divulgar seu
nome. Não registrar os valores comparados, UUIDs de recursos ou settings completos.

Para Service Bindings conhecidos, reason é opcional e usa somente esta lista:

| reason               | Interpretação e conferência privada                       |
| -------------------- | --------------------------------------------------------- |
| TYPE_MISMATCH        | O tipo do binding difere de service                       |
| DESTINATION_MISMATCH | O Worker de destino difere do contrato                    |
| SELECTOR_MISMATCH    | Entrypoint ou environment difere do contrato              |
| PROPS_MISMATCH       | Props foi retornado e diverge das propriedades declaradas |

Se houver várias diferenças, a prioridade é tipo → destino → seletores → props.
Bindings ausentes ou malformados mantêm os códigos existentes e não recebem uma
razão estrutural de serviço. D1 e R2 não recebem essa classificação. O campo é
calculado localmente, nunca copiado da API ou de transition.reason, que continua
sendo uma justificativa documental livre. CLI, resumo e artefato usam a mesma
sanitização, sem consultas adicionais à Cloudflare.

Quando reason=SELECTOR_MISMATCH, selector identifica o atributo afetado sem
divulgar seu valor:

| selector    | Conferência privada necessária              |
| ----------- | ------------------------------------------- |
| ENTRYPOINT  | Entrypoint do Service Binding               |
| ENVIRONMENT | Environment do Service Binding              |
| BOTH        | Entrypoint e environment do Service Binding |

O campo é opcional e aceito somente para binding conhecido, code=BINDING_MISMATCH
e operation=worker.settings, com reason=SELECTOR_MISMATCH. A allowlist é aplicada
na construção e na serialização: razões diferentes, bindings ausentes,
desconhecidos ou malformados não recebem selector. Nunca copiar esse campo da API,
do payload ou do manifesto. As regras de comparação permanecem inalteradas.

Depois de uma execução autorizada, consultar selector e conferir privadamente no
Dashboard os campos indicados de OPERATIONS_SERVICE. Registrar evidência pelo
procedimento administrativo aprovado, sem publicar valores nos logs do CI. Se a
configuração histórica estiver incorreta, preparar uma correção administrativa
revisada. Se for um estado anterior legítimo, preparar uma transição versionada
com valores exatos comprovados, justificativa e testes de interoperabilidade.
Submeter essa alteração a revisão independente; este diagnóstico não a aprova.
O pós-check exige o estado final e a autorização de props.caller permanece intacta.
Também não presumir equivalência entre seletor ausente e production ou default.
Resolver seletores não comprova props.caller nem elimina gates de proveniência
e migrations; a baseline depende da homologação real das versões publicadas.

Depois de uma execução autorizada, usar a razão para conferir o atributo afetado
privadamente no Dashboard. Não remover bindings nem presumir que environment
production equivale à ausência de seletor. Uma diferença real exige correção
administrativa revisada ou transição explícita com estado anterior exato e testes
de interoperabilidade. Essa aprovação é independente deste ajuste diagnóstico;
o pós-check sempre exige o estado final, e props.caller não deve ser removido.

Para BINDING_MISMATCH, distinguir representação de destino real: database_id é o
campo D1 moderno, com id legado aceito e aliases conflitantes bloqueados. Serviços
comparam destino, entrypoint e ambiente; ausência e null são equivalentes somente
nos seletores opcionais. Não ajustar Dashboard ou aprovar uma transição apenas
para acomodar o erro. Se persistir, inspecionar privadamente o binding identificado
e confrontar o contrato versionado. Settings sem props não prova caller: consultar
as evidências locais do serializador Wrangler e do RPC físico com segurança de
produção. A autorização do receiver permanece obrigatória.

Superar essa comparação não homologa a baseline nem aplica migrations. O preflight
continua bloqueando proveniência ausente, contrato incompatível e esquema pendente;
os procedimentos protegidos independentes devem resolver esses requisitos antes
de uma publicação autorizada. A normalização não acrescenta consultas Cloudflare.
Não copiar saída bruta do Wrangler ou valores do Dashboard. Secret obrigatório
ausente falha nativamente no Wrangler; tipos Text incorretos falham antes da publicação.
As consultas D1 de esquema usam leitura, conforme a
[API oficial D1](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/).

## Falha parcial e recuperação

O artefato .cache/deployment/result.json registra versões efetivamente publicadas,
pós-check, tempos e métricas mesmo quando o segundo destino falha. GitHub Deployment
de um destino aprovado continua válido independentemente do resultado global.
Se a publicação ocorreu, mas seu pós-check ou registro falhou, não presumir que
a versão anterior continua ativa. Inspecionar e homologar o estado real; uma
versão sem associação comprovada bloqueia novas publicações até recuperação revisada.

Corrigir a causa e reexecutar os jobs de publicação que falharam no CI, ou solicitar
release manual do mesmo SHA compatível após a execução anterior encerrar. Ambas as
opções exigem nova aprovação de production e revalidação da elegibilidade. Se a
correção exigir código, emitir novo commit/solicitação. Não restaurar D1,
apagar objetos, reabrir Clinical R2 ou alterar quotas/aprovações automaticamente.
Rollback também exige CI, manifesto compatível e aprovação. Repetir release não
provisiona recursos nem executa efeitos de negócio.

Na busca de verify, consultar tentativas da mais recente para trás, reutilizando
resultado anterior somente quando o job não foi reexecutado depois. Verify posterior
falho, ignorado, cancelado ou em andamento bloqueia; nomes parciais e duplicados são
rejeitados. Os novos deployments registram origem, tentativas, job verify e SHA de
controle. A leitura histórica usa a tentativa registrada, sem invalidar publicação
verificada por causa de uma reexecução posterior. Registros legados continuam aceitos.

## Auditoria

Publicar workflow e módulos de controle em main, confirmada como branch padrão.
Executar Infrastructure audit manualmente com token de leitura e ambiente exclusivo.
O relatório considera manifestos por destino realmente publicado, inclusive releases
parciais; não compara com alterações não publicadas da feature.

Após homologação manual bem-sucedida, registrar a execução aprovada e, em commit
revisado na main, habilitar o bloco schedule comentado: `0 6 * * 0`, domingo às
06:00 UTC. Até essa aprovação, a auditoria é somente manual. Drift falha visivelmente
no Actions; não há correção automática ou notificação externa. Não listar objetos.

## Mídia e administração inicial

Readiness não aprova políticas: verifica registros aprovados existentes. Um deploy
de código pode ocorrer com mídia fechada; a reserva transacional D1 continua negando
uploads não aprovados. Ver [runbook de mídia](04-infrastructure/media-release-runbook.md).
O primeiro administrador continua sendo provisionado por procedimento administrativo
revisado: identidade Supabase e tenant existentes, permissões explicitamente aprovadas,
auditoria e nenhuma concessão implícita ou endpoint público de bootstrap.

Dry-runs e testes locais não comprovam permissões remotas, retenção, carga ou custos.
Nenhum deploy, inventário real ou homologação remota foi executado por este PR.
