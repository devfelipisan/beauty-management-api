# Validacao e deploy seguro

O fluxo normal volta a exigir proveniência das versões ativas e pós-checks por
Worker. Billing → Clinical → Operations continua sendo a ordem de publicação.
Não há consultas a beauty-r2, privacidade de buckets ou media_capacity no release
normal. Migrations continuam separadas da publicação e nunca são aplicadas por ela.

## Antes do push

Usar Node de .nvmrc e as dependências do lockfile:

```bash
npm ci
npm run check:release
git diff --check
```

check:release executa formatação dos arquivos locais alterados/novos e do último
commit, lint, build/typecheck, testes unitários e de arquitetura, testes físicos
de Workers/RPC/D1 local, E2E, dry-run dos três Workers, testes dos scripts e validação
local de configuração e manifesto. Falhas preservam o código de saída e interrompem
a cadeia. Credenciais de produção não são necessárias para esses testes.

O dry-run usa exatamente os argumentos do deploy real, incluindo configuração,
ambiente, tag, mensagem e provisionamento desativado; acrescenta somente --dry-run.
Ele compila sem publicar. O GitHub também verifica a formatação de todo o intervalo
do push/PR e rejeita arquivos gerados que divergirem do Git.

## Quando publicar

Todos os pushes/PRs das branches configuradas passam pelo verify. No automático,
somente push aprovado em feature/microsservices com alterações relevantes chama
o release protegido. Alterações apenas em docs, testes, workflows ou ferramentas
administrativas validam o código, mas não publicam os Workers.

Fontes dos três Workers/domínios/pacotes, dependências, toolchain/configuração de
build, manifesto de deploy e request.json são alterações relevantes. Exclusões e
renomes de fontes também contam. Os três Workers continuam sendo publicados em
conjunto; o filtro não escolhe destinos individualmente.

O filtro usa o intervalo do push, não uma comparação com a produção. Uma mudança
somente em testes pode corrigir um CI anteriormente reprovado sem disparar deploy;
nesse caso, o operador pode usar o dispatch existente Deploy Beauty Workers sem
preencher SHA: o commit do evento é selecionado automaticamente. Esse dispatch
continua validando CI, ancestralidade, branch e request.
Ele não se destina a ignorar uma reprovação. Não é necessário alterar requestId.

## Dentro do Environment production

Após a aprovação, o release revalida a identidade do CI e do SHA. Antes do primeiro
upload, verifica configurações locais, versões/bindings ativos e sua proveniência,
compatibilidade dos contratos durante a sequência e migrations necessárias no D1.
Ausência de proveniência, drift ou schema pendente bloqueia todos os uploads.

Depois de cada upload, verifica a versão publicada, bindings, cron e exposição do
Worker correspondente. Só então registra sua proveniência no GitHub. Uma falha
interrompe os destinos seguintes e conserva o relatório parcial; não há rollback
automático ou restauração de dados. Registros anteriores confirmados são preservados.

O teste integral observa 20 consultas Cloudflare explícitas: seis leituras iniciais
dos Workers, uma leitura do cron do Operations, um SELECT de migrations D1 e quatro
pós-checks por destino. Não há
listagem de secrets ou chamadas R2. Essas contagens não incluem a sincronização do cron nem operações internas
do Wrangler, que pode consultar rotas/domínios quando o Worker foi editado no Dashboard.

## Evidencia e limites

Os testes dos scripts cobrem: falta de proveniência, schema incompatível, contratos
incompatíveis, falha de publicação, versão divergente no pós-check, falha de registro,
logs sanitizados, proibição de chamadas R2, decisões de mudança e igualdade dos
argumentos de dry-run/publicação. A execução local não registra deployments.

Nenhum teste offline comprova permissões ou validade atual do token Cloudflare,
disponibilidade remota, conteúdo real do banco ou sucesso funcional em produção.
O preflight somente leitura reduz falhas antes do upload, mas a própria publicação
ainda depende da API. Manter o token correto no Environment production, com o escopo
necessário ao Wrangler, e aprovar a execução após revisar SHA, testes e alterações.
O SELECT de migrations exige acesso D1 Read na conta/banco correspondente; não
acrescentar D1 Write somente para esse check. O endpoint de query da especificação
oficial aceita D1 Read ou D1 Write. O cliente de release restringe o SQL a SELECT.

O sucesso anterior informado pelo operador não foi inventariado nesta alteração.
Se um Worker tiver sido editado manualmente depois, o gate deve reprovar por falta
de proveniência da nova versão. Investigar esse estado sem remover o bloqueio ou
atribuir um SHA presumido.

### D1 HTTP 400 durante o preflight

`operation: database.schema` identifica a leitura de migrations, não uma falha
na proveniência GitHub. A consulta ocorre após validar as versões e seus registros.
O HTTP 400 isolado não permite concluir que faltam migrations.

O cliente distingue uma resposta D1 explícita `no such table: d1_migrations`
como `SCHEMA_NOT_READY`, com `databaseReason: MIGRATION_HISTORY_MISSING`.
Outras rejeições HTTP 400 da consulta permanecem `REMOTE_HTTP_ERROR`, com
`databaseReason: QUERY_REJECTED`. Mensagens remotas não são publicadas nos logs.
Nenhum caso permite publicar, ignora proveniência ou aplica migrations automaticamente.
Não há consultas adicionais nem acesso a R2.

Se a ausência do histórico for confirmada, usar o fluxo existente
`.github/workflows/migrations-d1.yml`: primeiro inspeção (`apply=false`), revisão
das migrations pendentes e, então, aplicação aprovada no Environment
`production-migrations`, referenciando a inspeção bem-sucedida do mesmo SHA.
Não criar registros fictícios em `d1_migrations` para liberar o deploy.
Uma base com tabelas preexistentes e sem histórico exige reconciliação antes
qualquer aplicação: não presumir que migrations podem ser reaplicadas.

Os testes locais `node scripts/test-deployment.mjs` reproduzem o HTTP 400 sem
credenciais nem chamadas remotas e verificam que nenhuma publicação acontece.
Eles não comprovam o estado do banco remoto; para isso é necessária uma consulta
somente leitura no mesmo banco e com as mesmas credenciais do Environment.

### Validação local antes de solicitar deploy (WSL)

Na raiz do repositório, usando a versão Node de `.nvmrc`:

```bash
nvm install
nvm use
npm ci
npm run deploy:validate
```

O comando reutiliza os mesmos gates de `check:release`, também utilizado pelo CI:
formatação, lint, TypeScript/build, testes unitários, Workers/RPC com D1 local,
E2E, dry-run dos três Workers, regressões do fluxo de publicação, configuração
e manifesto. Interrompe na primeira falha e retorna código de saída diferente de zero.
Não executa deploy, migrations remotas, consultas de proveniência GitHub nem
consultas ao R2 remoto. Os testes locais de armazenamento usam os emuladores.
Não é necessário exportar credenciais Cloudflare/GitHub para essa validação.

O relatório fica em `.cache/deploy-validation/result.json`, com SHA do HEAD,
resultado de cada etapa e status final. Reflete o conteúdo local executado,
inclusive alterações ainda não commitadas; não é uma aprovação de produção
nem substitui o CI do commit enviado. `remoteStateVerified: false` explicita
que permissões, migrations aplicadas no D1 remoto, versões publicadas e
proveniência anterior continuam sendo verificados pelo fluxo remoto existente.

Para reproduzir apenas as regressões do mecanismo de release, sem executar
novamente toda a suíte funcional:

```bash
node scripts/test-deployment.mjs
```

Esses testes incluem histórico de migrations ausente, esquema incompleto,
proveniência indisponível e falhas de publicação/pós-check, usando respostas
simuladas e sem gastar publicações Cloudflare.

### Cron da outbox gerenciado no Operations

As variáveis ficam em **Cloudflare → beauty-operations-worker → Settings →
Variables and Secrets**, como texto (`plain_text`), não como secrets:

| Variável          | Valor                            | Efeito desejado                              |
| ----------------- | -------------------------------- | -------------------------------------------- |
| `CRONJOB_ENABLED` | ausente, vazia ou `false`        | Cron desativado                              |
| `CRONJOB_ENABLED` | `true`                           | Cron ativado                                 |
| `CRONJOB`         | ausente ou vazia, quando ativado | Diário às 00h de São Paulo (`0 3 * * *` UTC) |
| `CRONJOB`         | `*/30 * * * *`, quando ativado   | A cada 30 minutos                            |
| `CRONJOB`         | `0 * * * *`, quando ativado      | A cada hora                                  |

São aceitos cinco campos numéricos: minuto (0–59), hora (0–23), dia (1–31), mês
(1–12) e dia da semana (1–7, domingo=1), com `*`, listas, intervalos e passos.
Expressões especiais com nomes, `L`, `W` e `#` não fazem parte desse contrato.
Cloudflare interpreta cron em UTC. O padrão considera o UTC−3 atual de
`America/Sao_Paulo`, sem conversão automática para mudanças futuras de horário de verão.

**As variáveis não alteram os triggers sozinhas.** Após configurar o Worker,
no WSL e na raiz do projeto, com `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN`
exportados:

```bash
npm run cron:inspect
npm run cron:sync
```

`cron:inspect` faz somente leituras dos settings e schedules do Operations e
mostra o estado atual e o desejado. `cron:sync` altera exclusivamente o endpoint
Cloudflare de schedules quando necessário e verifica o resultado. Ausência de
ativação remove os triggers existentes desse Worker; ativação sem expressão
registra o padrão diário. O token precisa de Workers Scripts Edit para a escrita.
O relatório fica em `.cache/cron/result.json`. Não há upload de código, execução
de migrations, publicação de GitHub Deployments, consultas D1 ou chamadas R2.
O comando é idempotente e recusa sincronizar se observar uma mudança concorrente
da política. Uma falha de verificação exige nova inspeção, sem rollback automático.

**Editar variáveis no Worker ainda pode gerar uma nova versão na Cloudflare.**
A sincronização dos triggers usa a API de schedules, separada da publicação de
código; não evita o versionamento causado pela edição das variáveis. Para mudar
somente o trigger, o Dashboard/API não exige upload de código, mas o horário deve
continuar coerente com a política desejada nas variáveis para passar pelos gates.
As duas variáveis deixaram de ser lidas do GitHub Environment `production`.

O Wrangler não recebe `--triggers` e o arquivo de produção do Operations omite
`triggers`, preservando os schedules existentes. O contrato local bloqueia a
reintrodução de triggers nesse arquivo. O preflight e o pós-check comparam o
agendamento remoto com as variáveis do Worker; divergência exige `cron:sync` e
bloqueia a publicação. O GitHub Deployment registra o horário verificado como
evidência histórica, sem fixar o horário dos próximos releases. Os gates de
versão e proveniência continuam obrigatórios: mudanças manuais que gerem uma
versão sem registro exigem recuperação controlada, nunca proveniência fictícia.

O handler `scheduled()` retorna sem acessar D1 ou despachar eventos quando
`CRONJOB_ENABLED` não é `true`. Essa trava não elimina as invocações de um trigger
antigo; `cron:sync` deve removê-lo para reduzir execuções. O cron ainda coordena a
outbox financeira, clínica e operacional; o processamento por evento e a
reconciliação financeira independente continuam fora desta implementação.

### Disparo manual sem preencher SHA

O workflow `deploy-workers.yml` usa automaticamente o SHA imutável selecionado
pelo GitHub no momento do disparo. O campo `commit_sha` é opcional no disparo
manual e continua obrigatório na chamada interna do CI, que já o fornece
automaticamente. Não é gerado um novo commit nem escolhido silenciosamente um
commit antigo se o atual ainda não tiver CI aprovado.

```bash
gh workflow run deploy-workers.yml \
  --repo devfelipisan/beauty-management-api \
  --ref feature/microsservices
```

Um SHA explícito continua disponível para recuperação controlada e passa pelas
mesmas validações. Sem SHA informado, o prepare usa `GITHUB_SHA`, nunca uma nova
consulta ao HEAD mutável da branch. O Environment `production`, a aprovação do
CI para esse SHA, a proveniência e os demais gates continuam obrigatórios.

### Sincronização do cron antes da publicação

`SCHEDULE_MISMATCH` significa que os Cron Triggers remotos diferem da política
nas variáveis do Operations, não que o SHA foi digitado incorretamente.
Após a aprovação de produção, o workflow sincroniza essa configuração antes de
executar o deploy quando o destino é `all` ou `operations`. Reutiliza o comando
`manage-cron.mjs --apply`: não altera variáveis, não publica código e só faz PUT
no endpoint de schedules se houver divergência. Um erro nessa etapa interrompe
a publicação. O preflight e o pós-check continuam verificando o resultado.
Publicações individuais de Billing ou Clinical não sincronizam o cron.

A sincronização pode ter sucesso e o deploy falhar depois por outro gate. Seu
resultado fica em artefato próprio `cron-<sha>-<tentativa>`, separado do artefato
de publicação para preservar o contrato das evidências históricas. O comando
`npm run cron:sync` continua disponível para gerenciar o agendamento sem deploy.
