# Contratos de leitura para Web/BFF

As coleções GET de clientes, profissionais e serviços preservam `data` como array e acrescentam `page: { hasMore, nextCursor }` ao envelope. `limit` aceita 1 a 100, padrão 20. O cursor opaco é validado contra tenant, ator, papel, permissões atuais e escopo profissional. Não há garantia de snapshot entre páginas sob alterações concorrentes. IDs crus não são mais cursores válidos.

A consulta de aplicação `ReadCatalogPage` depende de `CatalogReadRepository`. A composição seleciona `D1CatalogReadRepository`; esse adapter reutiliza os mapeamentos existentes e consulta `professional_services` em lote, com tenant e IDs da página. Profissionais recebem `serviceIds`; serviços recebem `professionalIds`. Os handlers conservam autenticação, membership e permissions próprias. Seleção de contexto não concede acesso.

A projeção de agenda/detalhes inclui `tenantId`, snapshots `basePriceCents`, `discountCents`, `finalPriceCents`, `depositCents` e timestamps persistidos. A autorização continua `agenda.read`, e a segregação profissional continua aplicada na query. Não há nova permission financeira neste contrato de leitura da agenda. Snapshots ausentes em registros legados permanecem `null`; consumidores que os exigem devem rejeitar o contrato explicitamente, sem zeros ou preços atuais.

Schemas runtime verificam as respostas antes da serialização. OpenAPI documenta vínculos, snapshots e paginação. Não foram alteradas tabelas, migrations, comandos, FSMs, auditoria ou outbox. Os testes físicos `workspace-read.spec.ts` cobrem vínculos, paginação, snapshots e negações; `agenda-read.spec.ts` conserva as regras de segregação.
