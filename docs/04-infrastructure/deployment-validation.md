# Evidências locais — PR-DEPLOY

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
