# Cobertura unitária — 31/10/2026

A ampliação cobre os comportamentos já implementados no relatório V8 apresentado.
Nenhuma regra, contrato, permissão, política ou implementação de produção foi
alterada nesta tarefa. Também não foram alterados o coletor, as exclusões, os
thresholds, os manifests ou o lockfile para melhorar artificialmente os números.

## Evidências

Baseline reproduzida antes das mudanças e nova execução usando Node 24.22.1:

| Métrica | Antes | Depois |
| --- | ---: | ---: |
| Statements | 63,72% | 97,14% |
| Branches | 52,82% | 94,51% |
| Functions | 59,68% | 90,46% |
| Lines | 62,62% | 98,73% |

Suíte final: **68 arquivos e 394 testes aprovados**. Lint, typecheck/build
(`tsc --build --force`) e `git diff --check` aprovados. Workers físicos e E2E não
foram executados nesta tarefa, cujo escopo é exclusivamente unitário.

Reprodução: `npm ci` e `npm run test:cov`. Para o resumo comparável em JSON:

```sh
npm run test:cov -- --coverage.reporter=json-summary --coverage.reporter=text
```

O relatório fica em `coverage/coverage-summary.json`, ignorado pelo Git. A
configuração atual mede os arquivos instrumentados/importados pela suíte; esse
percentual não comprova cobertura de todos os fontes existentes no monorepo.
Novos testes também exercitam composição e decorators antes não executados,
alterando a quantidade de statements/functions contabilizada pelo V8. Nenhum
arquivo de produção foi excluído para obter o resultado.

## Cenários acrescentados

- Mídia: validação de tipo/tamanho, metadados e chaves; autorização por sessão;
  intercurrência da mesma sessão; upload, falha e replay; listagem/leitura;
  reconciliação e fotografia obrigatória. Doubles de repositório/storage/UoW
  verificam argumentos e ausência de efeitos após rejeições.
- Storage: seleção explícita de indisponibilidade, assinaturas JPEG/PNG/WebP,
  propagação de metadados, objetos ausentes e falhas. O double de FixedLengthStream
  fornece apenas a interface de stream; não comprova semântica do runtime R2.
- Segurança: composição que falha fechada, JWT com chaves locais reais e claims
  ausentes/inválidas, issuer/JWKS inseguro, erro do diretório, memberships atuais,
  escopo profissional, autoridade não serializável, guards e decorators.
- RPC: entrada/envelope inválidos, tenant ausente, evento comprometido e payload
  adulterado, reconstrução de fatos persistidos, encaminhamento de credenciais
  por chamada e manutenção restrita ao coordenador confiável.
- UnitOfWork/idempotência: isolamento de reservas por tenant/operação/chave,
  conclusão/falha, replay, chave em andamento, batch com mutações e confiabilidade,
  assertions de expectedChanges e propagação de falhas. Doubles comprovam o
  protocolo do adapter, sem simular nem alegar rollback real de D1.
- Controllers: tenant vindo do contexto resolvido, paginação existente, retorno e
  falha da aplicação, permissões aprovadas e negação de mutações com leitura.
- Domínio/aplicação: ciclo de sessão, replay sem duplicação de efeitos, entidades
  cadastrais, intervalos de disponibilidade, definições/valores técnicos, contratos
  RPC, limites de desconto/sinal e composição de condições comerciais.

Controllers cadastrais, Service, contratos RPC, UnitOfWork, composição de segurança
dos Workers e mapeamento de memberships D1 atingiram 100% de linhas. Permanecem
ramos/funções sem execução em outros arquivos; não há alegação de 100% global.

Na máquina utilizada, node_modules continha dependências nativas Linux/WSL.
Foram disponibilizados localmente os binários Windows nas mesmas versões
instaladas, sem alteração de dependências versionadas. Ao alternar sistemas,
instalar as dependências no ambiente em que os testes serão executados.
