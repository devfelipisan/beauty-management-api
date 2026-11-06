# ADR-0016 — Contexto operacional selecionado e agenda

Status: aceita para implementação local; publicação não autorizada.

## Contexto

A membership agregava grants de múltiplas funções. Os seletores de contexto não
restringiam todos os comandos HTTP/RPC. O caminho fixture ignorava a política
de autorização de usuário, impedindo comprovar a segregação funcional.

## Decisão

Resolver uma única função operacional por invocação, confrontada com o D1 atual.
Centralizar administrator → tenant_admin, reception → reception e professional
→ professional. Sem seleção, apenas uma função operacional inequívoca é aceita.
Manter restrições profissionais persistidas, independentemente da função.

HTTP e RPC usam a mesma resolução de grants. RPC V2 carrega token e seleção;
receivers verificam novamente identidade, tenant, membership, papel e grants.
V1 é compatível apenas com contexto inequívoco. Nenhuma seleção fica no cache
compartilhado. Mocks substituem a identidade somente em build local/teste;
memberships e grants de Workers continuam persistidos no D1.

O solicitante aprovou agenda.read para listagem, resumo, detalhes operacionais
mínimos e conflito. Dados clínicos e financeiros mantêm suas permissões próprias.
A migration cadastra a permissão sem concedê-la a papéis. Grants dos seeds são
explicitamente sintéticos, não defaults do produto.

Limites aprovados: 42 dias por consulta, 50 compromissos por página por padrão,
100 no máximo. Instantes UTC e intervalo [from,to), incluindo sobreposições.
Ordenação por startsAt/id, cursor associado a contexto e filtros, sem garantia
de snapshot sob mutações concorrentes. Resumo usa os mesmos filtros sem cursor
ou limite. Catálogos mantêm endpoints próprios; nomes associados são atuais.

allowedActions é observacional. A primeira projeção avalia confirmação/check-in
com a política compartilhada dos comandos. Ações clínicas/comerciais não são
anunciadas sem avaliação completa. Comandos revalidam as condições.

## Compatibilidade e consequências

Implantar receivers compatíveis antes de produtores V2. V1 ambíguo falha fechado.
Não reverter para união de grants ou bypass de autorização como rollback.
Eventos de sistema mantêm os mecanismos existentes de Outbox e caller.

RPCs legados sem política aprovada continuam negados. Por decisão explícita do
solicitante, seus testes transacionais usam os casos de uso com D1 diretamente;
testes de receiver comprovam a negação. Isso não homologa exposição pública
de confirmação/expiração de sinal, materialização de pacote, refund ou crédito.

RESCHEDULED ocupa o novo intervalo conforme ADR-0015; nenhuma transição é criada.
Jornadas, bloqueios operacionais e geração de horários permanecem fora do escopo.
