# Postman — Beauty Management

Importe os três arquivos `*.postman_collection.json` e
`local.postman_environment.json` no Postman. Selecione **Beauty — Local**.
As coleções cobrem o HTTP dos Workers Operations, Clinical e Billing,
incluindo health. Controllers Nest e RPCs internos não são endpoints adicionais.

## Preparação

Na raiz, com a versão de Node definida em `.nvmrc`:

```powershell
npm.cmd ci
npm.cmd run db:seed
npm.cmd run dev:workers
```

Confira os endereços exibidos pelo Wrangler e ajuste `operationsUrl`,
`clinicalUrl` e `billingUrl` no Environment. As portas 8787, 8788 e 8789
incluídas são os exemplos da documentação, não uma garantia do harness.
Cada origem expõe `/swagger` e `/openapi.json`.

`token=actor-dev-admin` e `tenantId=tenant-dev-001` pertencem ao mock local.
Bearer é herdado da coleção; health não exige autenticação.
As variáveis são do Postman, não novos bindings do Worker. Nenhum segredo
de produção deve ser salvo nos arquivos versionados.

## Dados e execução

Consulte `.local/mock-data/manifest.json`, produzido pelo seed. Para incorporar
a data e os IDs do primeiro cenário ao arquivo de ambiente, execute:

```powershell
node scripts/generate-postman.mjs
```

Reimporte os arquivos gerados. O gerador apenas lê o manifest e os contratos;
não aplica migrations nem envia requisições. Sem manifest, `startsAt` fica
vazio para preenchimento explícito. `rescheduleStartsAt` também exige preenchimento.
O comando sobrescreve os artefatos exportados; valores privados e o estado
mantido no Postman não são lidos nem exportados pelo gerador.

Os corpos são exemplos estruturais dos campos obrigatórios do OpenAPI:
preencha textos, valores, datas e requisitos conforme o cenário real.
Campos opcionais, permissões e enums completos estão em `/openapi.json`.
IDs sem origem comprovada ficam vazios. Valores financeiros são em centavos.

Execute individualmente: health → consultar clientes/serviços → criar
agendamento → confirmar → check-in → iniciar sessão → preencher requisitos
técnicos → verificar elegibilidade → concluir → consultar histórico.
Cancelamento, ausência e reagendamento são cenários separados, sujeitos às FSMs.
Não execute a coleção inteira como um fluxo único.

Scripts capturam IDs de criação quando presentes na resposta de sucesso.
Não há criação artificial de recebível: para pagamento, informe um
`receivableId` existente e o cliente correspondente. O seed não insere
agendamentos, sessões nem lançamentos financeiros artificialmente.

## Idempotência e rastreabilidade

Cada operação possui variáveis próprias de chave de idempotência e IDs de
rastreio. Na primeira execução, o pre-request script preenche valores vazios
com UUIDs e os preserva para replay. A geração exige um Environment selecionado.
Reenvie o mesmo payload com os mesmos valores para testar replay.
Para uma nova intenção, limpe as três variáveis dessa operação no Environment.
Uma chave não pode ser reutilizada com outro payload. Não há envio automático
de mutações nem execução de RPCs internos.

## Fotos e contrato legado

Upload usa Body **binary**: selecione o arquivo e ajuste Content-Type para
`image/jpeg`, `image/png` ou `image/webp`. Informe `purpose` na query.
Não use multipart. O limite depende de `MAX_CLINICAL_PHOTO_BYTES` no runtime;
o Environment Postman não configura esse binding.
O GET de equipment exige corpo JSON com `id`, conforme o contrato legado.

## Divergências existentes

- PATCH de cliente usa `customer.read`; PATCH/DELETE de serviço usam `service.read`.
- Escritas legadas de serviços não possuem garantias de idempotência, auditoria e outbox.
- Pagamento exige `customerId` no cenário positivo apesar de opcional no OpenAPI.
- Pagamento inclui IDs de rastreio no hash de idempotência; mantenha-os no replay.
- Replay após quitação pode retornar `RECEIVABLE_ALREADY_PAID`.
- Bloqueios de cadastro podem retornar 500 e avaliações inválidas 400, em
  divergência com o modelo normativo de erros. Os scripts verificam o status
  de sucesso documentado; cenários negativos precisam de expectativas específicas.
- Refunds, créditos, sinais, outbox e demais RPCs internos não são HTTP público.

Referências: [Swagger](../docs/06-development/swagger.md),
[massa local](../database/seeds/README.md) e contratos OpenAPI em
`apps/*-worker/src/openapi.ts`.
