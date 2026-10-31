# Evidências de validação — 31/10/2026

Base: `feature/microsservices`, `a21b874`. Verificações locais sobre as alterações
do plano consolidado; não representam validação de uma instalação remota.

| Gate                                           | Resultado               |
| ---------------------------------------------- | ----------------------- |
| `npm run check`                                | Exit code 0             |
| Lint                                           | Aprovado                |
| Typecheck e build                              | Aprovados               |
| Unitários e arquitetura                        | 466 testes, 82 arquivos |
| Workers físicos locais                         | 75 testes, 26 arquivos  |
| E2E Node                                       | 4 testes, 4 arquivos    |
| Dry-run Operations, Clinical e Billing         | Aprovados               |
| Scripts de configuração, preflight e bootstrap | 18 testes aprovados     |
| `git diff --check` e verificação do índice     | Aprovados               |

Testes de scripts:

```sh
node --test scripts/worker-deployment-config.test.mjs scripts/worker-required-secrets.test.mjs scripts/bootstrap-workers.test.mjs
```

Foram exercitados streaming com assinatura fragmentada, divergência de tamanho,
finalização idempotente transacional, compartilhamento de capacidade entre
reservas clínicas e de perfil, concorrência no limite do tenant, recuperação de
exclusão, privacidade/cache, autoridade de aplicação e bloqueios de configuração.
Os testes existentes continuam cobrindo isolamento, finanças, agenda e Outbox.
Nenhum threshold ou exclusão de cobertura foi relaxado.

Migrations novas: 0027 (capacidade), 0028 (correlação clínica) e 0029 (perfil).
Foram aplicadas somente pelo harness local. Os tipos dos três Workers foram
regenerados com Wrangler; tipos de runtime permanecem no pacote central
`@cloudflare/workers-types`, sem cópias geradas duplicadas.

## Pendências externas

- O frontend/BFF e seu formulário de cliente não existem neste checkout. A
  otimização visual e a integração do formulário permanecem pendentes desse código.
- Não houve inventário remoto, cadastro de quota comercial, aprovação documental
  de acesso/retenção, smoke remoto ou ensaio remoto de rollback.
- Não houve deploy, criação de bucket ou execução de migration remota.
- As aprovações de capacidade começam desabilitadas. Não abrir uploads sem cumprir
  o [runbook](media-release-runbook.md).

As verificações locais não substituem esses gates de produção nem demonstram
permanência em uma franquia gratuita sob carga real.
