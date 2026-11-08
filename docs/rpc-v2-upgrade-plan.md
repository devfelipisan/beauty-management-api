# Transição RPC V1 → V2: job 128539934055

## Evidência do incidente

Execução: https://github.com/devfelipisan/beauty-management-api/actions/runs/42417745303/job/128539934055.

O job selecionou o SHA `c05375e37ec5c1f1d635248c2216f753d33a4f0f`. O artefato deployment-c05375e37ec5c1f1d635248c2216f753d33a4f0f-1 registra CONTRACT_INCOMPATIBLE, preflight, github.manifest, billing, workers=[] e sete consultas Cloudflare de settings/deployments/schedules. Nenhum upload de Worker começou. Credenciais, aprovação production e cron passaram; a sincronização do cron registrou applied=false.

Os registros GitHub mais recentes consultados nesta investigação associam os três Workers ao SHA `956cfbf9ed20f65d3beb2012bc8871efd5426386` (3 de novembro). Billing: deployment 7509242480; Clinical: 7509243990; Operations: 7509245355. Esses registros históricos não substituem um inventário Cloudflare atual, nem autorizam preencher uma baseline nova.

O código desse SHA emite e aceita autoridade RPC V1. O candidato emite V2, incluindo a seleção tenant/função/profissional; receivers antigos rejeitam V2. Os manifestos também mudam as revisões de Operations, Billing e Clinical. A simulação com o conjunto histórico e o manifesto atual bloqueia as seis ordens possíveis de atualização gradual: trocar somente a ordem dos Workers não cria interoperabilidade.

## Correção do diagnóstico

CONTRACT_INCOMPATIBLE agora identifica dependency, topologyStage (current ou after-publish) e updatedWorker, quando aplicável. O consumidor que falhou permanece em worker. Os campos são limitados a nomes conhecidos e categorias fixas, sem tokens, URLs, respostas remotas ou dados do banco. As verificações continuam bloqueando qualquer upload incompatível.

Isso distingue uma topologia já inconsistente de um passo intermediário inválido. Uma falha Billing → Operations depois de publicar Billing é diferente de um erro de credencial ou binding ausente. O job histórico está vinculado ao SHA original; nova implementação exige novo commit e nova execução revisada.

## Decisão operacional

O responsável confirmou ausência de operação ativa e escolheu uma atualização coordenada em manutenção. Não reutilizar Controlled first publication: já há registros gerenciados dos Workers. Não remover registros GitHub, fabricar baseline, acrescentar revisões incompatíveis a requires nem desabilitar a simulação do release normal.

## Implementação da janela confirmada

O responsável confirmou que não há operação ativa e solicitou preparar a atualização coordenada. O workflow **Coordinated RPC upgrade** (`infrastructure-coordinated-upgrade.yml`) é exclusivamente manual, separado do release gradual e da primeira publicação. A execução não foi disparada nesta correção.

A solicitação revisável está em `.github/deploy/coordinated-upgrade.json`. O candidato é `775587b80d8ef29c589606830293eb34c993fe07`, cujo verify do CI de push 42519244287 passou (job 128848891619). O status global desse CI aguardava aprovação de deploy na consulta. Antes do novo fluxo, encerrar/cancelar essa execução pendente após o verify aprovado: a elegibilidade exige a execução de CI encerrada e seu verify com sucesso; a publicação gradual pode ter falhado ou sido cancelada. Cada Worker anterior está fixado por version ID e SHA `956cfbf9ed20f65d3beb2012bc8871efd5426386`, conforme os registros históricos acima. A solicitação **não declara inventário Cloudflare atual**: qualquer divergência real ou proveniência ausente impede publicação; atualizar os dados exige outro commit de controle revisado.

O motor de publicação é compartilhado com a primeira publicação, mas as políticas são distintas. O upgrade exige proveniência aceita para todas as versões antigas e um conjunto inicial consistente; a primeira publicação continua exigindo NO_RECORDS. O conjunto candidato precisa ser consistente por si só. O release normal continua simulando e rejeitando todos os estados intermediários incompatíveis. Apenas o workflow manual aprovado admite estados intermediários durante manutenção, sem tráfego.

### Execução após revisão e merge

1. Registrar o descritor do novo workflow na branch padrão, como exige GitHub para workflow_dispatch. Executar o controle revisado na branch `feature/microsservices`. Não selecionar `main` para publicar.
2. Encerrar ou cancelar execuções antigas de deploy ainda aguardando aprovação, inclusive a do CI 42519244287, antes de iniciar a manutenção: elas compartilham a exclusão `beauty-production`. Não aprovar o job antigo nem reexecutar o job de c053; ele continuará corretamente bloqueado.
3. Bloquear o ingresso pelo Web/BFF e demais integrações, impedir chamadas manuais e coordenar todos os escritores. Manter Operations com `CRONJOB_ENABLED=false` e nenhum agendamento ativo, usando o procedimento existente de cron; o upgrade confere esse estado e interrompe se estiver habilitado. O workflow não bloqueia o Web nem integrações automaticamente. Confirmar disponibilidade das três versões antigas para recuperação e preservar inventário e evidência operacional.
4. Disparar **Coordinated RPC upgrade** com `commit_sha=775587b80d8ef29c589606830293eb34c993fe07` e `maintenance_confirmed=true`. A confirmação atesta que ingresso, integrações e escritores permanecerão parados até a qualificação final. O valor padrão é false e não autoriza publicação. Os testes do candidato e do controle, manifesto imutável, identidade da execução, ancestralidade e verify são validados sem credenciais Cloudflare.
5. Revisar e aprovar o Environment `production` somente quando a janela estiver preparada. O job protegido revalida os controles e a solicitação, faz inventário atual dos três Workers, valida proveniência, bindings, privacidade dos Workers e migrations já aplicadas no D1. Não aplica migrations nem altera dados de negócio ou recursos R2. As versões anteriores são salvas em `.cache/coordinated-upgrade/result.json`, preservado como artefato mesmo em falha.
6. Publicar Billing → Clinical → Operations. Antes de cada upload, conferir novamente os três version IDs a 100% e o scheduler desabilitado; qualquer deriva interrompe. Verificar versão e controles de cada publicação. Repetir readiness e conferir o conjunto final antes de criar registros GitHub. O novo origin `coordinated-upgrade` só é aceito como proveniência depois que a execução e sua tentativa completa terminarem com sucesso.
7. Com os três Workers verificados, qualificar o Web/BFF pelo seletor com dados persistidos: bootstrap de workspace pelo Operations, seleção permitida tenant/função/profissional e leituras RPC para Billing/Clinical. Confirmar isolamento e ausência de erros de protocolo antes de reabrir o ingresso. Essa qualificação funcional exige o ambiente remoto e não foi executada localmente. Reabilitar agendamentos apenas depois dessa qualificação, pelo fluxo existente.

### Recuperação durante a manutenção

Em falha parcial o resultado é `recovery_required`, com versões antigas e publicações realizadas; a janela deve permanecer fechada. Não repetir automaticamente o workflow com o snapshot antigo: a conferência de deriva irá rejeitá-lo. Se falhar somente o registro GitHub, os Workers podem já estar todos no candidato; inspecionar o artefato e o inventário antes de agir. Uma execução incompleta ou malsucedida não fornece proveniência aceita, mesmo que tenha criado parte dos registros.

Recuperar administrativamente o conjunto completo para os três version IDs de `previousVersions`, com 100% de tráfego em cada um, usando os controles existentes da Cloudflare; conferir novamente bindings, scheduler desabilitado e compatibilidade inicial. Não recuperar apenas um Worker mantendo o restante em V2. Revalidar o acesso pelo seletor e a consistência do conjunto antes de reabrir. Não há rollback automático nem transação entre os três Workers, e rollback de código não desfaz alterações persistidas. Se a recuperação ou o registro exigir outra publicação, preparar nova solicitação revisada com o inventário real, sem fabricar baseline ou apagar evidências.
