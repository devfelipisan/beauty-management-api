# Massa de demonstração persistente — somente D1 local

Este perfil complementa `development.mjs`; **não o substitui**. Os registros
cadastrais extras são sintéticos, determinísticos, vinculados a
`tenant-dev-001` e gravados com `ON CONFLICT DO NOTHING`. Dados de outras
empresas não são modificados.

## Pré-requisitos

- Node 24 e `npm ci` no `beauty-management-api`.
- Configuração local `apps/operations-worker/wrangler.jsonc`, com
  `AUTH_PROVIDER=mock` e `APP_ENV=local` **apenas no ambiente local**.
- Três Workers disponíveis via `npm run dev:workers` na porta local 8787.
- Nenhum acesso direto ou credencial de produção é necessário.

## Execução

```bash
npm ci
npm run db:seed             # migrations + catálogo base no D1 local
npm run dev:workers         # manter aberto em outro terminal
```

Em outro terminal, na mesma pasta:

```bash
node scripts/seed-demo-local.mjs --preview
node scripts/seed-demo-local.mjs --apply
```

A aplicação é **opt-in** e não pode ser executada no CI nem com `--remote`,
`--reset`, `--config` ou URL arbitrária. O destino HTTP é fixo em
`http://127.0.0.1:8787`; o Wrangler é invocado com `--local --env local`.
O preflight verifica `/health` e o catálogo da identidade sintética local.
O script exige o manifesto de `npm run db:seed`, que fixa a data de referência
original, e grava `.local/mock-data/demo-execution.json` após verificação.

## Conteúdo adicional

| Entidade      | Base existente | Adições | Total global previsto |
| ------------- | -------------: | ------: | --------------------: |
| Empresas      |              2 |       0 |                     2 |
| Clientes      |             14 |      46 |                    60 |
| Profissionais |              4 |       4 |                     8 |
| Serviços      |              7 |       8 |                    15 |
| Agendamentos  | 0 no seed base |     180 |                   180 |

O calendário gera seis agendamentos por dia durante 30 dias a partir da data
âncora do seed, com horário em UTC consistente com o fuso da empresa
`America/Sao_Paulo`. São usados sete profissionais ativos, vínculos
profissional-serviço existentes e clientes ativos. Entre 180 operações:
60 permanecem aguardando confirmação, 120 são confirmadas **pelos endpoints
reais de Operations**. As chaves de idempotência e IDs de rastreamento
permanecem estáveis para execução repetida.

O script não insere diretamente `appointments`, `sessions`, `payments`,
`audit_events`, `ledger_movements` ou `outbox_events`. A persistência
transacional passa pelos casos de uso que validam elegibilidade, reserva,
transições, auditoria e idempotência. Os cenários mais complexos de sessões,
recebíveis, estornos e outbox continuam cobertos pelo teste
`test/workers/development-seed.spec.ts` em banco isolado; não são apresentados
como dados históricos existentes no banco de navegação.

## Verificação de qualidade

```bash
npm run test:workers -- test/workers/demo-seed.spec.ts
npm run test:unit -- scripts/seed-demo-local.spec.ts
```

O teste D1 isolado comprova catálogo, `PRAGMA foreign_key_check`,
isolamento de tenant, criação e confirmação real, auditoria e leitura pela
agenda. O executor local verifica, por paginação, que os 180 IDs criados
podem ser consultados pela API. Se algum passo falhar, interrompe a execução;
a repetição utiliza as mesmas chaves e não força novos estados.

**Limitações:** esse ambiente não representa usuários reais, não testa
credenciais JWT de produção e não substitui testes de readiness/contrato da
instância Cloudflare implantada. O problema Cloudflare `1101` precisa ser
investigado separadamente; acrescentar dados não corrige exceção do Worker.
A autenticação definitiva permanece reservada para a última etapa do projeto.
