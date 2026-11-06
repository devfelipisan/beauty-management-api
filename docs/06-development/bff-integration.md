# Contrato inicial de integração do BFF com Operations

## Agenda e função selecionada

A evolução da agenda está documentada em
[operations-agenda-query](../03-workers/operations-agenda-query.md) e na ADR-0016.
`agenda.read` cobre leitura operacional mínima, detalhes e conflito, sem grants
automáticos. Período máximo de 42 dias; página padrão 50, máximo 100.
As permissões de HTTP/RPC agora são as da função selecionada; contexto ambíguo
sem seleção é recusado. O escopo profissional persistido permanece obrigatório.
O contexto não é armazenado no cache compartilhado de composição de segurança.

A integração web da agenda deixa de carregar o dashboard/cadastro completo de
clientes. Os casos legados sem política RPC aprovada continuam negados, inclusive
em fixture; seus testes transacionais usam os casos de uso com D1 diretamente.

A especificação executável é `GET /openapi.json` do Operations Worker
(`apps/operations-worker/src/openapi.ts`). O BFF utiliza seu Service Binding
para Operations e encaminha o Bearer da sessão; Operations chama Clinical e
Billing internamente. Nenhum novo gateway ou mecanismo de autenticação é necessário.

| Método e caminho                        | Permissão adicional                             |
| --------------------------------------- | ----------------------------------------------- |
| `GET /v1/me/tenants`                    | Nenhuma; exige identidade autenticada           |
| `GET /v1/me/context`                    | Nenhuma; exige membership ativa e `x-tenant-id` |
| `GET /tenants/{tenantId}/customers`     | `customer.read`                                 |
| `GET /tenants/{tenantId}/services`      | `service.read`                                  |
| `GET /tenants/{tenantId}/professionals` | `professional.read`                             |
| `POST /tenants/{tenantId}/appointments` | `appointment.create`                            |

Todas as rotas de tenant exigem membership ativa da identidade autenticada.
Em produção, o JWT é validado pelo provider configurado. `x-actor-id` não
substitui autenticação. Os seletores `x-workspace-role` e `x-professional-id`
do contexto são confrontados com o vínculo persistido.

As respostas de negócio usam `{ data, requestId, correlationId }`. Erros usam
`{ status: "error", code, requestId, correlationId }`. Os headers
`x-request-id` e `x-correlation-id` são propagados. Os contratos OpenAPI incluem
schemas, parâmetros, permissões e respostas HTTP por operação.

## Leituras para o formulário

Clientes retornam `id`, `tenantId`, `fullName` e os demais campos de `Customer`
no OpenAPI. Essa rota ainda usa apenas a paginação padrão do caso de uso,
sem interpretar parâmetros de paginação da URL.

Serviços retornam os dados cadastrados, incluindo duração e preço base.
Profissionais retornam `id`, `tenantId`, `name`, `status` (`ACTIVE` ou
`INACTIVE`), `publicVisible`, `createdAt` e `updatedAt`. Ambas as listagens
aceitam `limit` inteiro positivo (padrão 20, máximo 100) e `cursor` com o id
do último registro recebido. `data: []` indica fim da consulta.

A listagem de profissionais reutiliza o cadastro existente, inclusive inativos.
Não oferece filtro de compatibilidade por serviço nem disponibilidade de horário.
Essa é uma limitação explícita frente à jornada descrita no relatório; a
elegibilidade definitiva permanece no caso de uso de criação de agendamento.
Nenhum filtro ou regra clínica foi criado no transporte.

## Criação de agendamento

O corpo corresponde a `CreateAppointmentRequest` em
`packages/contracts/src/create-appointment/index.ts`:

```json
{
  "customerId": "id-do-cliente",
  "serviceId": "id-do-servico",
  "professionalId": "id-do-profissional",
  "startsAt": "2028-04-10T09:00:00.000Z",
  "origin": "RECEPTION"
}
```

`customerPackageId` é opcional. `origin` aceita `RECEPTION`, `LANDING_PAGE`,
`WHATSAPP`, `RETURN`, `CAMPAIGN`, `REFERRAL` ou `MANUAL`. Não enviar tenant,
ator, duração, preço, desconto ou sinal no corpo.

`Idempotency-Key` é obrigatório: repetir a mesma chave e intenção retorna o
mesmo recurso; alterar a intenção com a mesma chave produz
`409 IDEMPOTENCY_KEY_CONFLICT`. O sucesso HTTP é 201 e segue
`CreateAppointmentResponse`, incluindo id, status, horários, duração, preço final
e condições de sinal. O BFF deve preservar esses valores autoritativos.

Falhas incluem autenticação (401), tenant/permissão (403), validação (400),
conflito de horário `TIME_CONFLICT` (409) e elegibilidade (422).
O OpenAPI e os códigos produzidos pelo runtime são a referência para cada operação.

## Evidência reproduzível

Com Node da `.nvmrc`, executar na raiz:

```bash
npm ci
# Rodar antes de qualquer build: protege a resolução direta dos fontes.
npm run test:workers -- test/workers/create-appointment.spec.ts test/workers/tenant-isolation.spec.ts test/workers/service-binding-caller.spec.ts
npm run test:workers
npm run test:seed
npm run workers:dry-run
npm run deploy:validate
```

O harness usa workerd, migrations D1 e Workers auxiliares reais, com o banco
identificado explicitamente para compartilhar a persistência entre bindings.
`create-appointment` comprova HTTP → RPC Clinical/Billing → persistência,
auditoria, outbox e replay; `scheduling-concurrency` comprova reserva física;
`tenant-isolation` cobre leituras/escritas entre tenants; `service-binding-caller`
comprova o caller configurado no receiver Billing em modo de produção e rejeita
caller ausente, incorreto ou forjado no payload. As suítes de tenancy cobrem
adicionalmente autorização RPC. O fluxo de agendamento usa o provider mock
local; isso não equivale a homologação de JWT ou deploy em Cloudflare.

`professionals` cobre paginação, isolamento e autenticação do novo GET;
o teste unitário do handler verifica a negação sem `professional.read`.
Os testes de OpenAPI validam schemas e os testes físicos de Swagger verificam
as rotas documentadas sem autenticação. Não há validação do frontend neste repositório.

Validação local desta alteração: as três suítes antes bloqueadas executaram 8
testes antes de qualquer build; a suíte completa passou com 85 testes físicos,
478 unitários/arquiteturais e 4 E2E Node. `test:seed` passou com 5 testes;
`deploy:validate` passou, incluindo lint, typecheck, dry-run dos três Workers,
197 testes de scripts, configuração e manifesto. O manifesto foi regenerado
pelo comando oficial `node scripts/deploy/manifest-check.mjs --write` porque
a assinatura da composição de Operations participa da revisão calculada.
A fábrica HTTP de listagem fica fora da classe `OperationsComposition`, para
preservar a revisão RPC anterior à exposição HTTP. O manifesto regenerado
mantém essa revisão, sem acrescentar revisões aceitas ou alterar o preflight.
O runtime iniciado com `dev:workers` respondeu 200 em health, identidade,
contexto, clientes, serviços e profissionais com o mock local, e 401 na leitura
de profissionais sem token. O seed local foi executado duas vezes com sucesso.

## Correção da compatibilidade no rollout

O release do merge `4b133b5` falhou com `CONTRACT_INCOMPATIBLE` em
`preflight/github.manifest`, worker Billing. A adição do método HTTP à classe
de composição alterou a revisão calculada de Operations, embora não alterasse
RPC. Durante a atualização sequencial, o Billing candidato exigia essa nova
revisão antes da atualização de Operations.

A fábrica foi movida para uma função de composição HTTP fora da classe. O
gerador oficial voltou a produzir exatamente o manifesto de `a7bc9df`.
Uma comparação local com os dois manifestos históricos reproduziu a falha;
a simulação com o manifesto corrigido passou na ordem Billing → Clinical →
Operations. A regressão automatizada preserva a revisão RPC anterior e verifica
essa transição. Não foram alterados o validador, revisões adicionais aceitas,
migrations ou schema. Essa evidência não verifica o estado remoto do D1.
