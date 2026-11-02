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
