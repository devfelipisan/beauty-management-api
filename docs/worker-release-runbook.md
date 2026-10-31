# Qualificação e operação dos Workers

## Estado e requisitos antes da liberação

Esta entrega altera código e pipelines, mas não publica serviços nem aplica
migrations remotas. O UUID de beauty_db informado pelo responsável foi aplicado
nos três Wranglers de produção. O validador de deploy
rejeita ausência, placeholders, destinos incorretos e exposição pública.

AUTH_ISSUER, AUTH_AUDIENCE, AUTH_JWKS_URL e AUTH_ALGORITHM são bindings de secrets
obrigatórios, declarados somente por nome em `secrets.required`. Não cadastrar
seus valores no repositório, em `vars`, argumentos de comando ou artefatos de CI.
O emissor previsto é Supabase Auth conforme ADR-0015; URL, audiência e algoritmo
do ambiente não são inferidos dessa decisão arquitetural.

O responsável cadastra os quatro valores manualmente no Cloudflare Dashboard,
como secrets de cada Worker: beauty-operations-worker, beauty-billing-worker e
beauty-clinical-worker. Não basta cadastrá-los em apenas um Worker. Se algum nome
de Worker ainda não existir, provisioná-lo privadamente antes de cadastrar seus
secrets; o preflight bloqueia serviços ausentes antes de qualquer publicação.

O gate local valida a declaração dos bindings e a estrutura de produção, sem
receber seus valores. O job protegido consulta apenas nomes/tipos pelo endpoint
de metadados de secrets; não lê valores ou settings gerais. Ausência, tipo
incorreto, resposta inválida, indisponibilidade ou falta de autorização produzem
mensagem genérica e bloqueiam todos os destinos selecionados antes do primeiro
deploy. `secrets.required` também é verificado pelo Wrangler durante publicação.
Existência de um nome não comprova que o valor está correto: configuração e JWT
continuam validados em runtime, sem fallback remoto para mocks.

O pipeline não imprime stdout/stderr brutos do Wrangler. Evidências de publicação
contêm somente requestId, SHA, destino, status, código de saída e versão publicada.
Uma falha deve ser investigada pelo operador no Dashboard, sem enviar valores de
autenticação aos logs. A interface metadata-only corresponde ao SDK oficial:
[consulta dos nomes dos secrets](https://github.com/cloudflare/workers-sdk/blob/main/packages/deploy-helpers/src/deploy/helpers/check-remote-secrets-override.ts).

Produção usa AUTH_PROVIDER=jwt e APP_ENV=production. ES256 ou RS256 deve refletir
a chave efetivamente configurada no Supabase. Não utilizar secret/service-role
no Web. O ambiente local explícito usa --env local --local, AUTH_PROVIDER=mock;
esse ambiente nunca é destino de deploy.

## Baseline reproduzível

Usar Node de .nvmrc, npm ci e npm run check. Executar também
`node --test scripts/worker-deployment-config.test.mjs scripts/worker-required-secrets.test.mjs`
e git diff --check.
O check inclui lint, typecheck, unitários/arquitetura, Workers com D1 local,
E2E e dry-run dos três bundles. Dry-run não comprova autorização real nem
disponibilidade remota. Não declarar liberação apenas por esses gates.

## Inventário e primeiro administrador

Antes de aplicar 0026, conferir schema e d1_migrations remotos, duplicidades de
professionals(tenant_id,id), integridade e colisões com as tabelas novas. A
migration é aditiva e não cria identidades, permissões ou concessões.

Provisionamento inicial é uma mudança administrativa revisada, executada por
operador com acesso ao D1 e aprovação registrada: confirmar issuer/subject do
usuário Supabase, tenant existente e ativo, identificador interno e papel
aprovado; preparar SQL com valores explícitos e as concessões individualmente
aprovadas; revisar e executar identidade, membership, papel e vínculos em batch
atômico, incluindo registro na auditoria existente. Não conceder as três novas
permissões automaticamente. Registrar ticket, operador, SHA e resultado sem
token/senha/PII. Verificar consultas autenticadas e revogação antes de liberar.
Não existe endpoint público de bootstrap nem script com grants padrão.

## Fluxo de publicação

1. Configurar production com revisores obrigatórios e restrição efetiva da branch
   feature/microsservices; configurar credenciais Cloudflare de escopo mínimo.
   O pipeline consulta essa proteção e falha se não conseguir comprová-la.
2. Revisar migrations em execução independente com apply=false. Conferir o
   inventário e o SQL, aprovar execução com apply=true no SHA revisado. O workflow
   workflow_dispatch precisa existir também na branch padrão para ser acionável.
   Não reescrever migrations históricas nem aplicar migrations durante deploy.
3. Alterar .github/deploy/request.json preservando mode, worker e requestId.
   validate executa gates; deploy exige production. Checkouts usam github.sha.
4. Após os gates e aprovação, o preflight verifica secrets de todos os destinos
   selecionados. Serviços ausentes ou sem os bindings interrompem o fluxo;
   nenhum placeholder é publicado para contornar essa verificação. O bootstrap
   privado existente nunca substitui um Worker já provisionado. all publica
   Billing, Clinical, Operations sequencialmente. Os pacotes compartilhados são empacotados pelo
   entrypoint de cada configuração, sem redistribuição de arquivos pelo GitHub.
5. Conferir artefato result.json e resumo: requestId, SHA, destino, versões e
   falha parcial. Uma publicação anterior ao erro continua ativa; não há rollback
   automático entre Workers.

## Smoke e recuperação — qualificação ainda necessária

Em acesso interno e pelo BFF configurado, verificar health/versão, login, consulta
dos próprios workspaces, contexto com membership atual, rejeição de JWT falso e
revogado, tenant cruzado, mutação sem permissão e leitura que tenta escrever.
Validar operação suportada com dados de qualificação, auditoria e replay; conferir
que mídia indisponível não cria registro e que foto obrigatória impede conclusão.
URLs e credenciais de smoke não foram fornecidas; não há smoke remoto comprovado
ou liberação automática condicionada a esse resultado nesta entrega.

Rollback de Worker: revisar versão anterior compatível com schema, aprovar no
mesmo ambiente protegido e usar Wrangler rollback com --config explícito para
cada destino afetado. Registrar versões e repetir smoke. Não reverter dados junto
com código. Migration defeituosa exige migration corretiva aditiva revisada.
Restauração excepcional de D1 exige janela de incidente, identificação do ponto
de recuperação, avaliação de perda/replay e aprovação específica. Ensaios remotos
dessas três formas de recuperação continuam pendentes.

## Jornadas e limitações explícitas

O BFF integra sessão por e-mail/senha e transporte autenticado de /me/tenants,
/me/context e leitura/atualização de clientes. A página visual de clientes ainda
depende de composição de dashboard incompatível; transporte disponível não
comprova jornada visual completa. Outras capacidades retornam indisponibilidade
até adequação dos contratos, sem fallback HTTP/bootstrap público.

RPC sem política aprovada permanece negado. Devolução automática de sinal,
refund/credit e outros efeitos financeiros incompletos seguem para reconciliação
durável; não declarar paridade financeira. createDepositForAppointment exige
evento comprometido, mas a produção completa desse evento ainda requer integração.
Eventos locais sem consumidor não são marcados como enviados artificialmente.
Métricas de atraso devem distinguir tipos roteáveis de notificações locais.
Batch/lease/frequência de Outbox, reconciliação operacional, smoke automatizado,
UUID/auth reais e ensaio de rollback são pendências de liberação.

Novas evidências de testes devem ser registradas no relatório de implementação.
