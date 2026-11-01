# Plano revisado — segurança clínica, deployment e eficiência

Base: `feature/microsservices`, commit `a2602fe`. Este plano substitui a versão
anterior sobre captura clínica em R2 e limite de perfil de 2 MB.

## Decisões

- Os três Workers compartilham `beauty_db`, JWT, memberships e regras de tenant.
- Apenas Operations recebe `PROFILE_MEDIA` → `beauty-r2` e exige o Text
  `MAX_PROFILE_IMAGE_BYTES=300000`. Clinical e Billing não recebem R2.
- Clinical mantém metadados históricos e BEFORE AVAILABLE confirmada em D1.
  Captura e acesso binário estão indisponíveis; reconciliação mantém negação em
  produção, sem novas permissões. Referências externas ainda não são evidência.
- Serviços, agendamentos e novas sessões não devem introduzir requisito de
  fotografia impossível de satisfazer. Snapshots e replays são preservados.
- Outbox mantém lote 5, lease 60 e Cron de um minuto. Uma sondagem consolidada
  seleciona apenas dispatchers com eventos elegíveis ou leases vencidos.
- O limite de 300.000 bytes aplica-se a novos uploads. Imagens históricas maiores
  preservam leitura e exclusão. A migration 0030 é aditiva e não altera a 0029.
- O preflight apresenta códigos seguros por fase e destino, sem valores de
  autenticação, respostas brutas ou permissões inferidas do token.

## Sequência operacional

Para a orquestração de publicação, esta seção é complementada e substituída pelo
[PR-DEPLOY](deployment-refactoring-plan.md) e pelo
[runbook de release](../worker-release-runbook.md). Inventário e aprovação de mídia
continuam obrigatórios para habilitar uploads, mas não bloqueiam uma publicação
independente de código quando o esquema e os contratos necessários estão disponíveis.
CI não tem credenciais remotas; release é intencional por SHA, migrations são
independentes e readiness mantém as aprovações fora do caminho normal de deploy.

1. Validar localmente contratos, testes, migrations e dry-runs.
2. Inventariar D1 remoto, migrations e intenções pendentes.
3. Aplicar migrations revisadas no workflow independente e protegido.
4. Verificar existência, privacidade, inventário e capacidade do R2.
5. Registrar aprovações reais de inventário, política e escritores coordenados.
6. Executar o preflight remoto completo sem alterar flags para contorná-lo.
7. Publicar Billing → Clinical → Operations, verificando SHA e bindings.
8. Executar smoke interno autorizado. Nenhum deploy é autorizado por este plano.

Os objetos clínicos existentes permanecem contabilizados no orçamento global.
Referências externas exigem política futura de acesso, integridade, retenção,
disponibilidade, rastreabilidade e autorização; nenhuma URL satisfaz a regra por
si só. O acesso histórico ao arquivo físico requer solução separada aprovada.

## Metas de operação por fluxo normal

| Fluxo                                                     | Operações R2         |
| --------------------------------------------------------- | -------------------- |
| Upload inicial de perfil                                  | 1 PUT                |
| Substituição confirmada                                   | 1 PUT e 1 DELETE     |
| Leitura sem cache                                         | 1 GET                |
| Cache validado, listagem de clientes ou conclusão clínica | 0                    |
| Retry de upload confirmado                                | 0 novas gravações    |
| Reconciliação clínica desativada                          | 0 R2 e 0 escritas D1 |

Uma execução agendada sem trabalho usa uma sondagem D1, sem dispatch nem RPC.
Medir à parte invocações, chamadas, I/O D1, operações R2, latência e recuperação;
comparar cenários de um e cinco minutos antes de qualquer futura mudança do Cron.
Não afirmar custo zero ou permanência na franquia gratuita sem medição de carga.

Executar `npm run check`, testes dos scripts, `git diff --check` e dry-runs.
Detalhes de configuração, histórico, aprovação e rollback estão no
[runbook de mídia](media-release-runbook.md). O frontend não está neste checkout.
