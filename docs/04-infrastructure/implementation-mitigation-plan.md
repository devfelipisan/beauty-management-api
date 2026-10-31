# Plano consolidado — Workers, configuração, fotografia clínica e imagens de perfil

Base: branch `feature/microsservices`, commit `a21b874`, com decisões confirmadas
pelo responsável. Este documento substitui o plano anterior. Não autoriza deploy
real, migrations remotas, quotas fictícias ou aprovação presumida de políticas.

## 1. Objetivo e decisões preservadas

Preservar três Workers, D1 compartilhado `beauty_db`, solicitação versionada em
`request.json`, aprovação efetiva `production` e publicação Billing → Clinical →
Operations. Preservar JWT verificado, memberships atuais, tenant, profissional,
FSMs, finanças, auditoria, idempotência, Outbox e contratos existentes, com as
extensões explícitas de perfil.

| Item                   | Definição                                           |
| ---------------------- | --------------------------------------------------- |
| D1                     | Até cinco operações simultâneas por invocação       |
| PostgreSQL legado      | Até cinco conexões por processo Node                |
| Text de produção       | Cloudflare Dashboard                                |
| JWT                    | Quatro secrets obrigatórios sem valores versionados |
| Outbox                 | Lote 5; lease 60 segundos                           |
| Cron                   | `*/1 * * * *`, somente Operations                   |
| Bucket privado         | `beauty-r2`                                         |
| Operations             | `PROFILE_MEDIA`, somente perfil                     |
| Clinical               | `SESSION_MEDIA`, somente fotografia clínica         |
| Billing                | Sem acesso R2                                       |
| Arquivo clínico        | Máximo 5.242.880 bytes                              |
| Arquivo de perfil      | Máximo 2.000.000 bytes                              |
| Fotografia obrigatória | `BEFORE AVAILABLE`                                  |
| Reconciliação clínica  | RPC existente, `clinical.photo.upload`              |
| Capacidade global      | 8.000.000.000 bytes, incluindo reservas             |
| Alertas                | 6.000.000.000 e 7.200.000.000 bytes                 |

Perfil e Clinical terão entidades, tabelas e casos de uso separados. Compartilhar
somente infraestrutura, segurança, confiabilidade e orçamento. A primeira entrega
de perfil atende clientes. Outros proprietários e referências externas ficam
fora da ativação inicial.

## 2. Configuração, deployment e runtimes

### Configuração e validadores

Aplicar `keep_vars: true` nos Wranglers; retirar Text de produção de `vars`.
Preservar nomes, entrypoints, compatibilidade, exposição privada, D1 e Service
Bindings. Declarar os quatro secrets JWT. Manter local explícito sem secrets reais
nem Cron. Build de produção não poderá selecionar mocks por Text do Dashboard.

Dashboard, em todos: `APP_ENV=production`, `AUTH_PROVIDER=jwt`,
`OBSERVE_ENABLED=true`, `OUTBOX_BATCH_SIZE=5`, `OUTBOX_LEASE_SECONDS=60`.
Clinical também exige `MAX_CLINICAL_PHOTO_BYTES=5242880`. `SERVICE_VERSION` é
o SHA aplicado pelo pipeline. Perfil impõe seu limite no backend, sem nova variável.

O validador versionado verifica D1 compartilhado, bindings/caller, propriedade
das variáveis, ausência de JWT inline, R2 por Worker e Cron exclusivo de Operations.
O preflight remoto verifica Text, nomes/tipos dos secrets, recursos, privacidade,
incompatibilidades existentes e gates de capacidade. Operations inclui receivers.
Bindings novos são instalados pelo Wrangler; conferir infraestrutura, SHA,
agendamento e exposição após publicação. Nunca imprimir autenticação, configurações
completas ou saída bruta do Wrangler.

### Bootstrap e publicação

1. Checkout do SHA do evento; gates locais e validação estrutural.
2. Aprovação efetiva de `production`; inventário dos Workers.
3. Em `deploy/all`, bootstrap privado somente de ausentes.
4. Interromper publicação da aplicação quando houver criação.
5. Configuração manual, provisionamento e migrations independentes aprovadas.
6. Nova solicitação versionada e preflight remoto completo.
7. Publicação sequencial, smoke e verificação posterior.

Bootstrap não declara negócio, D1, R2, Cron ou rotas públicas. Acesso negado não
significa ausência; Worker existente não é sobrescrito. Preservar `mode`,
`worker`, `requestId`, `validate` sem escrita, exclusão `beauty-production` e
evidência parcial. Desabilitar criação automática de recursos no deploy.

### Contexto por invocação e PostgreSQL

Segurança, memberships, eventos, repositories e UoW compartilham orçamento D1 de
cinco. Adquirir vaga apenas em I/O; `prepare/bind` síncronos; liberar em `finally`.
Statements preservam identidade e contexto. Batch nativo integral consome uma vaga.
Não expor binding bruto após composição. Delegação interna compartilha contexto;
RPC recebido inicia outro. Helpers não acrescentam métodos RPC. JWKS separado,
sem cache de memberships.

Pool legado `max: 5`, singleton por DI, release e shutdown preservados. Não ativar
módulo desconectado, PostgreSQL/Hyperdrive nos Workers ou novos timeouts.

## 3. Armazenamento compartilhado e fotografia clínica

### Capacidade

Migrations aditivas para reservas, contadores e correlação de operações.
Operations e Clinical usam orçamento comum no D1, sem RPC adicional. Exigir
inventário inicial de todos os objetos, quotas explícitas e escritores coordenados.
Ausências bloqueiam uploads e ativação.

Contabilizar ativos, incompletos, reservas e exclusões pendentes sem duplicidade.
Reservar integralmente a substituta enquanto a anterior existe. Proteger limites
global/individual atomicamente. Liberar bytes apenas com ausência ou exclusão
confirmada. Sem `R2.list()` nas requisições, inventário HTTP ou escrita por leitura.
Observabilidade agregada e alertas não prometem custo zero.

### Upload e reconciliação clínica

Autorizar tenant, sessão e profissional. Aplicar limite do receiver e validar
formato, assinatura fragmentada e tamanho real durante streaming. Primeiro batch:
intenção, idempotência e capacidade. R2 fora da transação D1. Batch final:
metadados, auditoria, idempotência existente e contabilidade.

Finalizar/falhar reservas existentes transacionalmente, sem reinserção. Tratar
truncamento, cancelamento e falhas concorrentes. Resultado incerto preserva
intenção e saldo; rejeição comprovada antes de qualquer gravação permite falha
definitiva e liberação, sem presumir exclusão de objeto existente.

Reconciliação resolve sessão/profissional pelo `photoId`, exige
`clinical.photo.upload`, confere metadados R2 e finaliza atomicamente sem duplicar
auditoria. `clientChecksum` não é apresentado como integridade verificada.

Consulta e conclusão exigem `BEFORE AVAILABLE`, conforme snapshot e fallback
legado. Outras finalidades não substituem. Retirar bloqueios fixos sem R2 sem
revalidar sessões concluídas. Manter leitura autenticada, chaves tenant-scoped
e cache privado. Sem exclusão automática clínica; produção exige política documental.

### Outbox

Operations coordena dispatchers por domínio; receiver impõe parâmetros.
Preservar ownership, fencing, retry/backoff e replay. Qualificar lease com espera
D1/transporte; inventariar eventos e consumidores. Cron depende da qualificação.
Perfil usa a infraestrutura existente, sem cron próprio, polling ou eventos sem consumidor.

## 4. Imagens de perfil e cadastros

Criar `profile-media` em Operations com domínio, políticas, portas e adapters
próprios, sem reutilizar `PhotoAttachment`. Migrations incluem `profile_images`,
slot único por tenant/cliente/finalidade, versão monotônica, intenção e exclusões
pendentes correlacionadas a quota e idempotência.

- `PUT /tenants/:tenantId/profile-images/customer/:ownerId`
- `GET /tenants/:tenantId/profile-images/customer/:ownerId`
- `DELETE /tenants/:tenantId/profile-images/customer/:ownerId`

Usar `customer.read` e `customer.update`, sem grants novos. Upload/remoção exigem
idempotência e versão esperada. Cadastros incorporam metadados opcionais e versão
persistente do slot, inclusive após remoção.

Substituição: autorizar/validar, reservar integralmente, um PUT em nova chave,
confirmar referência/versionamento/auditoria/idempotência e pendência anterior no
mesmo batch, tentar DELETE anterior e liberar bytes após confirmação. Conflito
preserva vencedora; objeto perdedor tem limpeza persistida. Remoção retira
referência atomicamente; falha física não reativa imagem. Excluir somente chave
exata protegida contra referência ativa.

Caminho normal: upload um PUT; substituição um PUT e um DELETE; leitura sem cache
um GET; metadados somente D1; replay concluído nenhuma nova gravação. Sem HEAD
após PUT/antes de GET, sem list ou polling. Recuperação consulta objeto somente
para intenção inconsistente após lease. Eventos já finalizados usam apenas D1.

Frontend: orientação corrigida, até 512×512, WebP preferencial, metadados removidos,
objetivo 100–250 KB, sem reenvio inalterado. Atualizar versão após confirmação;
cache privado e autenticado, sem thumbnails adicionais. A integração concreta
depende do repositório frontend, ausente neste checkout.

Referências externas ficam para entrega posterior com contratos, provedores e
autorização aprovados. Sem download, HEAD ou extração automática. URLs externas
não satisfazem fotografia clínica obrigatória.

## 5. Validação, entregas e liberação

| Área                | Provas obrigatórias                                                         |
| ------------------- | --------------------------------------------------------------------------- |
| Configuração/deploy | Text/secret inválidos, acesso negado, seleção, SHA e resultado parcial      |
| Bootstrap           | Ausentes, preservação dos existentes, interrupção e nova solicitação        |
| D1/PostgreSQL       | Pico cinco, sexta aguardando, liberação em falha e batch integral           |
| Transações          | Rollback de metadados, auditoria, idempotência, quota e Outbox              |
| Outbox              | Lease, proprietário antigo, sobreposição, ACK perdido e replay              |
| Streaming           | Assinatura fragmentada, tamanho exato/excedido/divergente, cancelamento     |
| Recuperação         | R2 sem confirmação D1, DELETE falho, concorrência e efeitos únicos          |
| Quotas              | Clínica/perfil concorrentes, substituição integral, sem liberação prematura |
| Segurança           | JWT, revogação, tenant cruzado, profissional e permissão insuficiente       |
| Perfil              | Uma ativa, conflito/remoção concorrentes e chamadas R2 exatas               |
| Clínica             | BEFORE AVAILABLE, snapshots e histórico preservados                         |
| Frontend            | Otimização, arquivo inalterado e atualização após confirmação               |

Executar `npm run check`, testes dos scripts e `git diff --check`, incluindo
build, arquitetura, E2E e dry-run dos três Workers. Harness com D1 compartilhado e
R2 no Worker correspondente, variantes indisponíveis e nenhum recurso real.
Não reduzir thresholds nem excluir caminhos para aprovar gates.

Ordem: contratos/documentação → configuração/execução → orçamento → fotografia
clínica → perfil/integração → Outbox/qualificação/tipos/ADRs/runbook. Perfil não
depende de entidades clínicas; ativação conjunta depende do orçamento qualificado.

Produção exige gates e smoke, aprovação efetiva, configuração/privacidade remotas,
inventário e quotas aprovados, escritores coordenados, política documental e
rollback ensaiado. Primeira ativação `all`, Operations por último.

Rollback preserva objetos, migrations, ledger, pendências, auditoria, finanças e
eventos. Não publicar versão que ignore quota; não restaurar D1, apagar evidência
ou flexibilizar fotografia automaticamente.

Fora desta entrega: teto global distribuído de concorrência, PostgreSQL nos
Workers, Hyperdrive, staging remoto, novas regras financeiras, exclusão clínica
automática, outros proprietários e implementação de referências externas.

Procedimentos: [runbook de mídia](media-release-runbook.md).
