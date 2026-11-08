# Acionamento da atualização coordenada RPC V1 → V2

O job [128857790445](https://github.com/devfelipisan/beauty-management-api/actions/runs/42521946228/job/128857790445) passou pelo verify e pela preparação, mas falhou no deploy gradual automático com `CONTRACT_INCOMPATIBLE`: Billing → Operations, após a substituição simulada de Billing. O preflight bloqueou antes da publicação. Credenciais, proteção production e cron foram validados; cron estava desabilitado e não foi alterado.

O PR #68 adicionou o procedimento de manutenção na branch `feature/microsservices`. O merge desse PR dispara o deploy gradual existente; ele não dispara o novo workflow manual nem atualiza o conjunto V1 → V2. Reexecutar esse job não resolve a incompatibilidade.

Este registro adiciona na branch padrão somente o descritor aprovado de **Coordinated RPC upgrade**, idêntico ao arquivo de controle do merge `de7b7d06a5b1145ecec43d7ba8c6c8eef9bd91fb`. GitHub exige a presença do descritor na branch padrão para disponibilizar `workflow_dispatch`. Os scripts de publicação permanecem na branch de release e são carregados da revisão selecionada, separadamente do código candidato. Este registro não executa deploy nem altera o release gradual.

## Após o merge deste registro na main

1. Abrir [Coordinated RPC upgrade](https://github.com/devfelipisan/beauty-management-api/actions/workflows/infrastructure-coordinated-upgrade.yml) e escolher **Run workflow**.
2. Selecionar a branch **feature/microsservices**, onde estão o controle e a solicitação revisada. Não selecionar main.
3. Informar `commit_sha=775587b80d8ef29c589606830293eb34c993fe07`, exatamente como aprovado em `.github/deploy/coordinated-upgrade.json`. Esse candidato contém o código dos Workers; o merge de controle de7b7d0 não altera seus contratos.
4. Antes do disparo, encerrar/cancelar deploys antigos pendentes e confirmar que o CI do candidato está encerrado com verify aprovado. A exclusão compartilhada `beauty-production` impede sobreposição de publicações.
5. Preparar a janela sem ingresso pelo Web/BFF, integrações ou escritores concorrentes, com Operations sem cron ativo. Marcar `maintenance_confirmed=true` somente quando essa preparação estiver concluída. O workflow não interrompe ingressos automaticamente.
6. Aprovar o Environment **production** após revisar a janela e o snapshot previsto. O fluxo revalida as versões reais e sua proveniência, o D1 existente, os bindings e o conjunto final. Divergência do inventário impede a publicação.
7. Preservar o artefato de recuperação. Qualificar o acesso pelo seletor e os dados persistidos após a verificação dos três Workers, antes de reabrir o ingresso.

Consultar o [plano completo na branch de release](https://github.com/devfelipisan/beauty-management-api/blob/feature/microsservices/docs/rpc-v2-upgrade-plan.md) para snapshots, requisitos e recuperação. Não remover o bloqueio `CONTRACT_INCOMPATIBLE`, adicionar revisões V1 ao manifesto V2 ou substituir este procedimento por Controlled first publication.
