# Operação protegida dos Workers

## Preparação administrativa

O código deste PR não executa mudanças remotas. Configurar manualmente:

| Environment           | Branch exclusiva       | Secret Cloudflare           | Capacidade                                                              |
| --------------------- | ---------------------- | --------------------------- | ----------------------------------------------------------------------- |
| production            | feature/microsservices | CLOUDFLARE_API_TOKEN        | Workers autorizados; leituras necessárias de Workers, D1 e metadados R2 |
| production-migrations | feature/microsservices | CLOUDFLARE_MIGRATIONS_TOKEN | D1 Read/Write                                                           |
| infrastructure-audit  | main                   | CLOUDFLARE_AUDIT_TOKEN      | Workers Metadata, D1 e R2 somente leitura                               |

Ambientes mutáveis exigem required reviewers e política customizada de branch
exata; não basta criar o environment com esse nome. Cadastrar também
`CLOUDFLARE_ACCOUNT_ID` como variável do environment. Validar capacidades dos
tokens contra os endpoints usados; não adicionar escrita R2 ao deploy para uploads
realizados pelo binding do Worker. Retirar escrita D1 do token de deploy quando
o token independente de migrations estiver operacional.

Text de produção pertence ao Dashboard: APP_ENV=production, AUTH_PROVIDER=jwt,
OBSERVE_ENABLED=true, OUTBOX_BATCH_SIZE=5, OUTBOX_LEASE_SECONDS=60 e, em Operations,
MAX_PROFILE_IMAGE_BYTES=300000. SERVICE_VERSION pertence ao pipeline. Os quatro
nomes AUTH_ISSUER, AUTH_AUDIENCE, AUTH_JWKS_URL e AUTH_ALGORITHM permanecem em
secrets.required; cadastrar valores reais manualmente em cada Worker. Não colocar
valores em repositório, comandos, logs ou artefatos. Supabase é a arquitetura de
identidade aprovada; nenhum endpoint ou algoritmo é presumido.

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
   operations/billing/clinical, commitSha, versionId e qualificationReference.
   Não preencher com versões ilustrativas. Revisar/commitar e executar readiness
   baseline. Estados ativos precisam corresponder exatamente à declaração.
7. Homologar primeiro um commit com mode=validate. Depois selecionar mode=deploy
   e all em request.json de novo commit revisado. O push aprovado solicitará
   produção; conferir a baseline e o escopo antes da aprovação operacional.

Um placeholder de bootstrap não é baseline de aplicação homologada. Se não há
aplicação com contratos comprovados, o primeiro provisionamento funcional precisa
de uma migração de topologia explicitamente revisada; o release normal permanece
bloqueado. Não falsificar SERVICE_VERSION ou proveniência para passar pelo gate.

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
