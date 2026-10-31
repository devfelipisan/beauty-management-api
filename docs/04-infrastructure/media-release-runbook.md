# Liberação de mídia privada

## Responsabilidades e configuração

`beauty-r2` é privado e provisionado manualmente. Operations usa somente
`PROFILE_MEDIA`; Clinical usa somente `SESSION_MEDIA`; Billing não acessa R2.
As chaves de perfil começam com `profile/`; fotografias clínicas preservam suas
chaves existentes. O binding é acesso ao bucket inteiro: a separação de prefixos
é aplicada pelos adapters e não representa isolamento físico entre Workers.

O Dashboard administra Text em todos os Workers: `APP_ENV=production`,
`AUTH_PROVIDER=jwt`, `OBSERVE_ENABLED=true`, `OUTBOX_BATCH_SIZE=5`,
`OUTBOX_LEASE_SECONDS=60`. Clinical também exige
`MAX_CLINICAL_PHOTO_BYTES=5242880`. O pipeline administra `SERVICE_VERSION`.
Os quatro parâmetros JWT continuam secrets individuais, cadastrados manualmente.
Não registrar seus valores em comandos, evidências, logs ou issues.

Os Wranglers preservam Text com `keep_vars`; definem infraestrutura, nomes dos
secrets e o perfil de compilação. A composição mock é restrita ao build local
ou aos testes. Mudar Text no Dashboard não habilita mocks no bundle de produção.

## Primeiro provisionamento

1. Solicitar `deploy/all` por `request.json` e aprovar `production` após os gates.
2. O bootstrap cria somente Workers privados ausentes e encerra o job com falha
   controlada. Não publica a aplicação sobre placeholders.
3. Cadastrar manualmente variáveis e secrets e provisionar o bucket privado.
4. Inventariar D1 remoto e aplicar migrations pelo processo independente aprovado.
5. Concluir o inventário e aprovações de capacidade abaixo.
6. Criar nova solicitação versionada. O preflight deve passar integralmente antes
   da publicação Billing → Clinical → Operations.

## Inventário e aprovação: gate obrigatório

A migration inicializa `media_capacity` com todas as aprovações desabilitadas e
não provisiona quotas. Deploy de mídia e novos uploads ficam bloqueados.
Não habilitar os indicadores para contornar o gate.

O responsável deverá registrar e revisar um inventário completo, feito fora do
fluxo HTTP, contendo chaves, tamanhos e atribuição de tenant dos objetos. Incluir
objetos clínicos históricos, objetos externos e uploads incompletos. Reconciliar
esse inventário com os metadados existentes e tratar divergências antes de abrir
gravações. Os bytes históricos precisam integrar os contadores globais e dos
respectivos tenants; não cadastrar os mesmos bytes duas vezes como saldo e ledger.

O procedimento administrativo de aplicação desse inventário deve ser revisado
com os dados reais e executado com escritores suspensos. Este repositório não
contém valores de quota comercial nem uma migration que presuma bucket vazio.
Preservar evidência e referência de aprovação da política de acesso e retenção,
do inventário e da coordenação de todos os escritores. Só então registrar
`approval_reference`, `inventory_approved`, `policy_approved` e
`writers_coordinated` no processo administrativo aprovado.

`tenant_media_capacity` exige quota explícita por tenant, positiva e até
8.000.000.000 bytes. Todos os escritores compartilham o orçamento no mesmo D1.
O saldo inclui reservas e objetos aguardando exclusão. Alertas operacionais são
6.000.000.000 e 7.200.000.000 bytes; o limite é 8.000.000.000 bytes.
Monitorar saldos por consultas administrativas e métricas agregadas da Cloudflare;
não executar writes por visualização nem inventários em requisições.

## Perfil de cliente

Somente `customer` e finalidade `PROFILE` estão habilitados. Sem grants novos:
leitura exige `customer.read`, mutação exige `customer.update`. Memberships de
profissional não recebem acesso global ao cadastro por esta funcionalidade.

- `PUT /tenants/:tenantId/profile-images/customer/:ownerId`: bytes JPEG/PNG/WebP,
  `Content-Type`, `Idempotency-Key` e `If-Match: "0"` no primeiro upload.
- `GET` no mesmo caminho: imagem autenticada; query opcional `version` deve
  corresponder à versão ativa. Cache privado, revalidado; nenhuma URL pública.
- `DELETE` no mesmo caminho: `Idempotency-Key` e `If-Match: "<versão>"`.

O PUT devolve metadados com versão; DELETE devolve a versão do slot sem imagem.
GET/listagem do cadastro incluem `profileImage: { version, image }` quando existe
slot. Um slot removido mantém sua versão, evitando conflito ABA após refresh.
Ausência de slot equivale à versão inicial zero.

O servidor impõe 2.000.000 bytes e calcula SHA-256 do arquivo recebido para
comparar tentativas de uma mesma operação. Nunca aceita chave R2 do cliente.
O frontend deve corrigir orientação, redimensionar até 512×512, remover metadados
e preferir WebP de 100–250 KB. Não reenviar arquivo inalterado. A integração do
formulário depende do repositório frontend, ausente neste checkout.

Estados técnicos de perfil: PENDING → AVAILABLE → RETIRED → REMOVED. Um upload
perdedor pode seguir PENDING → RETIRED. O slot é a referência ativa com CAS e
versão monotônica. REMOVED indica objeto excluído e capacidade liberada.
O ledger usa RESERVED, STORED, DELETE_PENDING e RELEASED; transições nunca
reiniciam ou reaproveitam uma chave física.

O caminho normal usa um PUT; substituição acrescenta um DELETE da chave anterior.
A intenção de recuperação é persistida antes do PUT; sua entrega fica disponível
após o lease configurado da Outbox, evitando HEAD durante o upload normal.
Eventos de uploads já confirmados são reconhecidos por D1, sem HEAD.
O dispatcher existente recupera inconsistências conhecidas e exclusões pendentes.

## Clínica e recuperação

Clinical impõe 5.242.880 bytes pelo receiver e exige BEFORE AVAILABLE quando o
snapshot determinar fotografia. DURING, AFTER e INTERCURRENCE não satisfazem esse
requisito. Não revalidar sessões históricas concluídas.

O RPC de reconciliação existente exige `clinical.photo.upload`; resolve a sessão
pelo photoId e revalida tenant e profissional. Intenções novas têm correlação
idempotente e ledger. Objetos históricos sem correlação exigem tratamento
administrativo, sem associação presumida a uma chave idempotente.

Resultados incertos mantêm reserva e intenção. Falha de DELETE mantém bytes
contabilizados. Não liberar saldos apenas porque um pedido falhou. Pendências que
esgotarem o retry existente exigem intervenção controlada; não adicionar polling,
cron dedicado, prazo de descarte ou exclusão automática de evidências clínicas.

## Validação e rollback

Executar `npm run check`, testes dos scripts e `git diff --check`; conferir smoke
das jornadas e versões publicadas. A configuração privada exige smoke via ambiente
interno/BFF autorizado; não abrir workers.dev para executar verificações.

Rollback de Worker preserva objetos, migrations, ledger, auditoria e eventos.
Não publicar bundle antigo que ignore quota ou requisitos clínicos. Migrations
corretivas e restauração excepcional de D1 são procedimentos independentes.
Sem confirmação desses procedimentos e política documental, manter mídia fechada.
