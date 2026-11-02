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
nesse caso, o operador pode usar o dispatch existente Deploy Beauty Workers com o
SHA aprovado. Esse dispatch continua validando CI, ancestralidade, branch e request.
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

O teste integral observa 19 consultas Cloudflare explícitas: seis leituras iniciais
dos Workers, um SELECT de migrations D1 e quatro pós-checks por destino. Não há
listagem de secrets ou chamadas R2. Essas contagens não incluem operações internas
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

### Cron da outbox: ativação e horário

O cron fica **desativado por padrão**, inclusive quando `CRONJOB` contém um
horário mas não há ativação explícita. A configuração versionada usa `crons: []`.
No GitHub, configure Variables no Environment `production`:

| Variável          | Valor                          | Efeito                                              |
| ----------------- | ------------------------------ | --------------------------------------------------- |
| `CRONJOB_ENABLED` | ausente, vazia ou `false`      | Não registra Cron Trigger                           |
| `CRONJOB_ENABLED` | `true`                         | Registra o horário de `CRONJOB`                     |
| `CRONJOB`         | ausente ou vazia, com ativação | `0 3 * * *`: diariamente às 00h de São Paulo, UTC−3 |
| `CRONJOB`         | `*/30 * * * *`, com ativação   | A cada 30 minutos                                   |
| `CRONJOB`         | `0 * * * *`, com ativação      | A cada hora                                         |

Cloudflare interpreta cron em **UTC**, não no fuso do navegador. A conversão do
padrão considera o UTC−3 atual de `America/Sao_Paulo`; não acompanha automaticamente
uma futura mudança de legislação de horário de verão.
São aceitos cinco campos numéricos: minuto (0–59), hora (0–23), dia (1–31),
mês (1–12), dia da semana (1–7, domingo=1), com `*`, listas, intervalos e passos.
Expressões especiais com nomes de dias/meses, `L`, `W` ou `#` não são aceitas
por este contrato. Ativação diferente de `true`/`false` ou expressão inválida
quando ativada bloqueia a publicação.

As variáveis são lidas pelo processo de deploy, não pelo handler do Worker.
**Alterar Variables exige novo deploy** para registrar ou remover os triggers;
mudar uma variável no Dashboard do Worker não altera o agendamento Cloudflare.
O pós-check compara o horário remoto com o horário solicitado e o GitHub
Deployment registra os horários efetivos do Operations. Billing e Clinical
continuam sem Cron Triggers.

Para validar localmente o cenário ativado, sem publicação nem consultas ao R2:

```bash
CRONJOB_ENABLED=true npm run workers:dry-run
CRONJOB_ENABLED=true CRONJOB='*/30 * * * *' npm run workers:dry-run
```

O handler atual ainda coordena a outbox **financeira, clínica e operacional**.
Desativar o cron suspende esse processamento agendado; não implementa entrega
por evento nem uma reconciliação financeira independente. O acionamento por
evento e a separação das rotinas discutidos anteriormente exigem implementação
própria antes de depender deles para manter o processamento automático.
