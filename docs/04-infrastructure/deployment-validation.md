# Evidências locais — PR-DEPLOY

## Normalização de bindings e diagnóstico

Base: `19b1af69bcb8d42fa26671631a2a61f8bf24c0fa`. Ajustes exclusivamente em
infraestrutura administrativa, fixtures e testes. Wranglers, migrations,
manifesto versionado e código de negócio permanecem sem alteração.

`npm run check` aprovado: lint, build/typecheck, 477 testes unitários/arquiteturais,
77 testes físicos de Workers (incluindo duas provas novas de caller), 4 E2E e três
dry-runs. Os 72 testes dos scripts incluem representação moderna/legada do D1,
aliases conflitantes, seletores de serviço, props opcional, transições, nomes
desconhecidos e sanitização de CLI/artefatos/resumos.

A prova física usa o receiver Billing real, compilado com **BEAUTY_LOCAL**=false,
APP_ENV=production e AUTH_PROVIDER=jwt, em D1 local isolado. O caller autorizado é
transportado pelo Service Binding; ausente, incorreto ou somente no payload é
negado. A captura explícita das rejeições RPC evita que o runner as interprete
como promises não tratadas; não há supressão global de erros.

Um teste executa o trecho de serialização do upload da versão instalada do
Wrangler e comprova preservação de props.caller. Isso não substitui homologação
remota: nenhuma consulta à conta ou publicação foi executada. Os valores JWT
usados nessa fixture são locais, sem segredos ou contatos externos.

O release simulado preserva 20 chamadas explícitas Cloudflare. Diagnósticos
acrescentam apenas nomes aprovados de bindings, sem UUIDs de recursos, valores ou
nomes desconhecidos. A baseline continua dependendo de inventário/homologação
reais; passar no comparador não libera proveniência ou migrations pendentes.

## Correção CI → deploy protegido

Revisão sobre `9a5ee2b0c4d7a888299d5d932bf396476d5d9d28`: CI chama release
reutilizável após verify; dispatch manual permanece disponível. Sem mudanças de
negócio, contratos, migrations, recursos ou configuração remota.

Executado localmente `npm run check`: 477 testes unitários/arquiteturais,
75 testes de Workers/D1, 4 E2E e os três dry-runs aprovados, além de lint e build.
Os testes dos scripts incluem o CI global em andamento, recuperação manual com
publicação reprovada, tentativas, paginação, nomes ambíguos, identidade divergente,
origem/proveniência automática e manual, compatibilidade legada e passagem da
evidência aos registros. A contagem simulada Cloudflare permanece em 20; consultas
GitHub são contabilizadas separadamente.

A homologação real do workflow_call, passagem do secret do environment, nova
aprovação, reexecução de jobs e dispatch manual continua pendente de operação
explicitamente autorizada. Nenhum push, deploy ou alteração administrativa foi
executado. A baseline permanece vazia até comprovação real.

## Evidências da refatoração anterior

Ambiente: Node 24.22.1, branch feature/microsservices, base
e7429ecf8802dad90f74803b7893b042ff307cb4. Execução local, sem credenciais
Cloudflare, publicação, provisionamento ou aplicação remota de migrations.

## Verificações executadas

- `npm run check`: lint, typecheck/build, 477 testes unitários (incluindo
  arquitetura), 75 testes físicos de Workers/D1 local, 4 E2E e três dry-runs.
- `node scripts/test-deployment.mjs`: testes de configuração, bootstrap,
  migrations, clientes, segurança de workflow, proveniência, compatibilidade,
  mídia, pós-check dirigido e falhas parciais.
- Validação de manifesto e configuração versionados, Prettier nos arquivos
  alterados e `git diff --check`.

Não houve relaxamento de cobertura, alteração de negócio, migrations ou Wranglers.
Mensagens de erro de D1 nos testes de falhas deliberadas não representaram falha
do gate: o comando integral terminou com status zero.

## Medição simulada

O teste executa o validador original recuperado do Git no SHA-base, com transporte
inteiramente simulado, e reproduz o fluxo anterior: preflight do workflow,
inventário de três Workers existentes, preflight do script e pós-checks antigos.
Resultado: 48 chamadas explícitas Cloudflare.

O teste do orquestrador novo utiliza os módulos reais com respostas simuladas:
20 chamadas (8 preflight + 12 pós-checks). Redução observada no teste: 58,3%.
A meta indicativa de 12–18 não foi atingida porque o novo fluxo também comprova
versões ativas por destino. Não suprimir essa comprovação para reduzir contagem.
GitHub, chamadas internas do Wrangler e D1/R2 de runtime são categorias separadas.

## Homologação ainda necessária

Ambientes/reviewers, branches, tokens por função, capacidades reais das APIs,
baseline publicada, compatibilidade semântica, migrations e inventário/aprovações
reais permanecem procedimentos administrativos. Nenhuma associação histórica foi
inventada: baseline.json inicia vazio e impede uma adoção sem comprovação.

O controle de auditoria precisa chegar à main, passar pela primeira execução
manual e ter essa evidência revisada antes de habilitar `0 6 * * 0`.
Smoke autorizado, drift remoto, comportamento nativo remoto de secrets e rollback
precisam ser homologados no ambiente real; testes locais não comprovam esses itens.
