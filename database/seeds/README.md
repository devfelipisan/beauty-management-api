# Massa sintética local

Na raiz do projeto, com Node 24:

```bash
npm run db:seed
npm run dev:workers
```

`db:seed` aplica as migrations existentes e carrega o catálogo de demonstração
no D1 **local** configurado por `apps/operations-worker/wrangler.jsonc`.
Não aceita `--remote`, outro config, SQL arbitrário nem reset. Não acessa PostgreSQL.

Para inspecionar o plano sem tocar no banco: `npm run db:seed:preview`.
O preview usa a data atual; um banco já populado preserva sua data de referência original.

Os IDs, valores e 13 exemplos de agendamento ficam em
`.local/mock-data/manifest.json`. O SQL gerado fica no mesmo diretório.
No Swagger, use **Authorize: actor-dev-admin** e **tenantId: tenant-dev-001**.

## Conteúdo

| Dados | Quantidade | Cobertura |
| --- | ---: | --- |
| Tenants | 2 | Principal autorizado e outro para isolamento |
| Clientes | 14 | Perfis de relacionamento, dados opcionais, inativo, bloqueado e casos de avaliação |
| Profissionais | 4 | Ativos, inativo e habilitações diferentes |
| Serviços | 7 | Consulta, avaliação, procedimento, sinal, desconto, inativo e outro tenant |
| Licenças | 2 | Admissão habilitada, sem inventar limites de plano |
| Avaliações | 6 | APTO válido, APTO vencido e NAO_APTO |
| Política de desconto | 1 | Exemplo sintético LOYAL, restrito a um serviço |
| Ficha técnica | 1 + 2 campos | Observação obrigatória e campo numérico opcional |
| Equipamentos | 2 | Disponível e manutenção, com vínculos de serviço |

Nomes são fictícios e identificados como sintéticos. E-mails usam `example.test`;
não há CPF/CNPJ ou telefones reais. Valores monetários, percentuais e prazos são
parâmetros de casos de teste, não regras padrão do produto ou recomendações clínicas.

Para obter um payload pronto para **POST /tenants/tenant-dev-001/appointments**,
com a data da massa carregada:

```bash
node -p 'JSON.stringify(require("./.local/mock-data/manifest.json").scenarios[0].body,null,2)'
```

Use a chave `mock-scenario-consulta` em `Idempotency-Key`. Para outra intenção,
use outra chave. Datas do manifest são ISO UTC; 12:00Z corresponde a 09:00 em
America/Sao_Paulo nos exemplos. A referência é ancorada em
`mock-service-consulta.created_at` para que repetir o seed não mude os cenários.

## Repetição, integridade e estado

O lote usa uma transação D1 local. `ON CONFLICT` é explícito e não sobrescreve
registros existentes. Repetir o seed não reativa clientes/serviços editados,
não remove testes já feitos e não renova janelas de validade. Guardas recusam
IDs de fixture pertencentes a outro tenant. Falhas desfazem o lote.

Se o tenant já possui uma licença, o seed não cria outra para substituir sua
decisão de elegibilidade. Uma licença suspensa continua suspensa.

Um banco com dados próprios pode ter políticas ou estados que alterem o resultado
dos exemplos. O manifest descreve a baseline definida, não uma cópia do estado atual.
Não há limpeza automática. Para repetir uma operação modificada, ajuste o cenário
e a chave de idempotência; não reutilize uma chave com outro payload.

Agendamentos, sessões, lançamentos financeiros, auditoria e outbox **não são
inseridos artificialmente pelo seed**. São produzidos por casos de uso reais
na suíte automatizada e pelas chamadas manuais permitidas no Swagger.

```bash
npm run test:seed
```

Essa suíte usa armazenamento isolado e valida: 13 cenários de admissão, replay e
conflito de horário; confirmação/check-in; início e conclusão de sessão; propagação
por outbox; recebível; pagamento parcial e quitação; refund; histórico preservado;
isolamento entre tenants; rollback e repetição sem sobrescrever alterações.
Ela não persiste os lançamentos financeiros no banco usado pelo Swagger.
RPCs de outbox e refund são exercitados apenas pelos Service Bindings dos testes,
sem criar endpoints públicos. A criação de novos cenários pelo Swagger depende
das rotas já disponíveis e da propagação interna de eventos.

## Achados de QA do runtime atual

Os resultados `expected` do manifest registram o comportamento observado, não
definem o status HTTP desejado para as regras do produto:

- `CUSTOMER_INACTIVE`, `CUSTOMER_RESTRICTED`, `SERVICE_INACTIVE`,
  `PROFESSIONAL_INACTIVE` e `PROFESSIONAL_NOT_ENABLED` chegam como HTTP 500 pelo
  mapper atual. As três formas de avaliação inválida chegam como HTTP 400.
- `customerId` é opcional no contrato de pagamento, mas sua omissão chega ao
  adapter como valor ausente para colunas obrigatórias e retorna 500. Para o
  cenário positivo, informe `customerId: mock-customer-maria`.
- Pagamento calcula o hash de idempotência incluindo IDs de request/correlação.
  Um reenvio com IDs de rastreio diferentes retorna `IDEMPOTENCY_KEY_CONFLICT`.
  A suíte usa os mesmos IDs no replay positivo e registra o caso divergente.
- O replay após quitação retorna `RECEIVABLE_ALREADY_PAID` antes da consulta de
  idempotência. Isso também é registrado pela suíte como divergência.
- O seed não presume que `expires_at` impeça uso de licença ACTIVE: a política
  atual decide principalmente por status e tolerância. Não foi criada uma regra
  de expiração nesta massa.

Esses achados precisam de correções específicas; a criação da massa não alterou
regras financeiras, permissões, estados ou mapeamento de erros.
