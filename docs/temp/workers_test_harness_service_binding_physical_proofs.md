Considerando o estado atual, eu não criaria mais um PR apenas tentando variações de `wrangler dev`. O próximo PR deve mudar o mecanismo de qualificação: **usar a infraestrutura oficial de testes multi-Worker da Cloudflare para provar Service Bindings, D1, concorrência e Reliability**, já que o discovery local via `wrangler dev` continua reportando `not connected`.

A documentação atual da Cloudflare recomenda `wrangler dev` multi-config como fluxo comum, mas também oferece uma integração oficial com Vitest para executar Workers dentro do runtime `workerd`/Miniflare e, para testes de integração multi-Worker, um harness dedicado. ([Cloudflare Docs][1])

Portanto, eu estruturaria:

# PR-11.6 — Workers Test Harness + Service Binding Physical Proofs

Objetivo:

```text
Wrangler discovery local
        ↓
continua não confiável no ambiente atual
        ↓
não criar HTTP workaround
        ↓
Cloudflare Workers test runtime
        ↓
production Worker builds
        ↓
Operations
   ├── CLINICAL_SERVICE → Clinical
   └── BILLING_SERVICE  → Billing
        ↓
provas físicas automatizadas
```

Ao final deste PR, **PR-12 só será liberado se todos os gates físicos estiverem verdes e `CommercialTerms` possuir ao menos um caminho normativo `READY`**.

---

# 1. Escopo exato

Implementar e provar:

```text
Cloudflare Workers Vitest integration
multi-worker integration test harness

Operations build real
Clinical build real
Billing build real

Service Binding Clinical
Service Binding Billing

RPC real
D1 real local
context isolation

Scheduling concurrency
Reliability
Idempotency

HTTP bridge security regression
```

Continuam fora:

```text
POST /appointments

novas regras de negócio

Payment
Session
Package
Refund

Queue
Cron
Outbox consumer

R2
KV
```

---

# 2. Não remover o `dev:workers`

O comando implementado no PR-11.5 continua útil:

```bash
npm run dev:workers
```

Não removê-lo.

A diferença será:

```text
dev:workers
→ experiência manual/local
```

enquanto:

```text
test:workers
→ qualificação automatizada/autoritativa
```

O primeiro pode continuar sofrendo da limitação de discovery no Windows; o segundo precisa ser determinístico.

---

# 3. Criar documento de qualificação

Antes de modificar infraestrutura:

```text
docs/plans/
PR-11.6-workers-test-harness-physical-proofs.md
```

Ele deve registrar explicitamente:

```text
Problem:
Wrangler local discovery remains not connected.

Decision:
Do not introduce public HTTP between Workers.
Use Cloudflare's supported Worker testing runtime for
Service Binding and multi-worker physical qualification.
```

---

# 4. Atualizar ADR-0010

Adicionar consequência:

```text
Manual wrangler dev is a development convenience.

Automated runtime qualification is performed against
the Cloudflare Workers testing runtime.
```

Assim:

```text
not connected no terminal
```

deixa de bloquear indefinidamente a arquitetura caso o runtime oficial de testes consiga reproduzir os bindings corretamente.

---

# 5. Primeiro resolver Vitest pela abordagem atual da Cloudflare

A Cloudflare atualmente recomenda `@cloudflare/vitest-plugin` para a integração com Vitest; ele executa os testes dentro do runtime Workers e substitui a abordagem antiga baseada em `@cloudflare/vitest-pool-workers`. ([Cloudflare Docs][2])

Portanto, antes de continuar tentando resolver o config antigo isoladamente, inventariar:

```bash
npm ls vitest
npm ls vite
npm ls rolldown
npm ls @cloudflare/vitest-plugin
npm ls @cloudflare/vitest-pool-workers
```

---

# 6. Não instalar automaticamente o pool antigo

Se não houver dependência:

```text
@cloudflare/vitest-pool-workers
```

não introduzi-la como primeira escolha.

A documentação atual recomenda migrar para:

```text
@cloudflare/vitest-plugin
```

([Cloudflare Docs][2])

---

# 7. Adicionar plugin oficial quando ausente

Se compatível com as versões atualmente instaladas:

```bash
npm install -D @cloudflare/vitest-plugin
```

Mas conferir peer dependencies antes:

```bash
npm view @cloudflare/vitest-plugin peerDependencies
```

Não atualizar todo Vite/Vitest sem necessidade.

---

# 8. Separar configuração unitária da Workers

Hoje o problema está em:

```text
vitest.config.mts
```

Não force D1/Cloudflare sobre testes de domínio.

Criar dois projetos/configs.

Conceitualmente:

```text
vitest.config.ts
```

para:

```text
domain
application
pure policies
FSM
```

e:

```text
vitest.config.workers.ts
```

para:

```text
Cloudflare Worker runtime
D1
Service Bindings
RPC
HTTP bridge
```

---

# 9. Resolver de vez o `.mts`

Se o atual:

```text
vitest.config.mts
```

não tem necessidade específica de ser `.mts`, migrá-lo para:

```text
vitest.config.ts
```

de forma controlada.

Depois:

```bash
npx vitest run --config vitest.config.ts
```

Precisa executar.

O PR não fecha com:

```text
UNRESOLVED_ENTRY
```

novamente.

---

# 10. Criar scripts explícitos

Algo equivalente:

```json
{
  "scripts": {
    "test": "vitest run --config vitest.config.ts",
    "test:unit": "vitest run --config vitest.config.ts",
    "test:workers": "vitest run --config vitest.config.workers.ts"
  }
}
```

Ajustar à convenção real.

---

# 11. Unit tests primeiro

Antes de qualquer runtime Worker:

```bash
npm run test:unit
```

Deve finalmente rodar todos os testes já acumulados.

No mínimo:

```text
TimeInterval
AppointmentStateMachine
AvailabilityPolicy
AppointmentEligibility
LicenseOperationalPolicy
AssessmentEligibilityPolicy
CommercialTerms
Idempotency
Reliability primitives
```

---

# 12. Nenhum Workers runtime para domain test

Um teste:

```text
TimeInterval.overlaps()
```

não deve bootar Miniflare/workerd.

Preservar teste puro, rápido.

---

# 13. Criar configuração Workers

O plugin oficial permite executar testes no mesmo runtime `workerd` usado localmente pela plataforma e acessar bindings reais/simulados. ([Cloudflare Docs][2])

Criar configuração baseada nos Wrangler configs existentes.

Objetivo:

```text
Workers test project
        ↓
Operations config
Clinical config
Billing config
```

Sem redefinir bindings manualmente em vários lugares se o plugin puder ler a configuração Wrangler.

---

# 14. Não criar configs de teste divergentes

Evitar:

```text
production wrangler:
CLINICAL_SERVICE

test config:
CLINICAL
```

Os nomes dos bindings nos testes devem ser exatamente os mesmos.

---

# 15. Criar test harness multi-Worker

A documentação atual da Cloudflare também recomenda `createTestHarness()` para integration tests de um ou vários Workers completos. ([Cloudflare Docs][3])

Eu dividiria:

```text
Workers Vitest plugin
→ runtime/unit + binding-level tests

createTestHarness()
→ whole-system integration proofs
```

se a API estiver disponível na versão instalada.

---

# 16. Não depender de `connected` textual

Esse é um ponto importante.

A prova futura não será:

```text
Wrangler printed [connected]
```

A prova será:

```text
Operations successfully called Clinical over
the configured Service Binding.
```

Isso é muito mais forte.

---

# 17. Primeira prova Worker: Operations Health

Via runtime de teste:

```text
Operations fetch
GET /health
→ 200
```

E:

```text
D1 = 0
Clinical = 0
Billing = 0
```

---

# 18. Clinical Health

```text
Clinical Worker
GET /health
→ 200
```

---

# 19. Billing Health

Mesmo.

---

# 20. Teste de 404

Operations:

```text
GET /does-not-exist
→ 404
```

Preserva PR-11.2/11.3.

---

# 21. Security bridge regression

Usar o vertical já qualificado de Customers.

Sem auth:

```text
GET /tenants/A/customers
→ 401
```

Token inválido:

```text
→ 401
```

Membership inválida:

```text
→ 403
```

Permission ausente:

```text
→ 403
```

---

# 22. Validation regression

No PATCH Customer:

```text
invalid payload
→ 400
```

Payload correto:

```text
→ Application/D1
```

---

# 23. D1 physical Operations proof

No runtime Workers de teste:

```text
Operations
→ CustomerRepository
→ D1 binding
```

Criar fixtures diretamente na D1 de teste.

Não mockar repository.

---

# 24. Aplicar migrations nos testes

O ambiente Workers test deve inicializar schema usando:

```text
0001
0002
0003
0004
```

ou mecanismo oficial equivalente.

Não manter schema manual duplicado em:

```text
test/schema.sql
```

se puder reutilizar migrations oficiais.

---

# 25. Banco limpo por teste/suite

A integração da Cloudflare oferece isolamento de storage por arquivo de teste. ([Cloudflare Docs][2])

Aproveitar isso para evitar testes dependentes de ordem.

---

# 26. Teste tenant isolation D1

Criar:

```text
Tenant A
Customer A

Tenant B
Customer B
```

Operations A lista:

```text
[A]
```

e nunca B.

---

# 27. PATCH cross-tenant

Tentar alterar Customer B através de Tenant A.

Resultado:

```text
403/404
```

conforme contrato.

Depois confirmar no D1:

```text
Customer B unchanged
```

---

# 28. Agora Service Binding Clinical de verdade

Esse é o principal objetivo.

Operations deve usar o adapter real:

```text
ClinicalServiceBindingAssessmentEligibilityAdapter
```

que chama:

```text
env.CLINICAL_SERVICE.checkAssessmentEligibility(...)
```

O RPC WorkerEntrypoint é a API oficial para métodos internos de Service Bindings. ([Cloudflare Docs][4])

---

# 29. Não chamar Clinical diretamente pelo import

O teste deve detectar/importar Operations Worker.

Não fazer:

```ts
new ClinicalWorker().checkAssessmentEligibility(...)
```

Isso testaria classe, não binding.

---

# 30. Clinical RPC transport proof

Cenário:

```text
Service requiresAssessment=true
Assessment APTO
```

Operations:

```text
AssessmentEligibilityPort
        ↓
Service Binding
        ↓
Clinical Worker
        ↓
D1
```

resultado:

```text
READY
```

Essa prova libera:

```text
Clinical RPC = PHYSICALLY QUALIFIED
```

---

# 31. Clinical NAO_APTO

Mesma cadeia:

```text
NAO_APTO
→ BLOCKED
```

---

# 32. APTO_COM_RESTRICOES

Executar conforme policy atual.

Não alterar policy para passar teste.

---

# 33. requiresAssessment=false

O mais importante para custo:

```text
Service.requiresAssessment=false
```

provar que:

```text
Clinical RPC = 0
```

Idealmente usar spy/observability/harness para contar invocações.

---

# 34. Clinical failure

Fazer target unavailable/controladamente lançar.

Operations precisa produzir:

```text
BLOCKED
```

Não `READY`.

---

# 35. Billing Binding proof

Operations deve usar:

```text
BillingServiceBindingCommercialTermsAdapter
```

e chamar:

```text
env.BILLING_SERVICE.calculateCommercialTerms(...)
```

---

# 36. O resultado pode ser BLOCKED

Isso é importante.

Teste esperado atualmente:

```text
transport = PASS
business = BLOCKED
```

Se Discount/Deposit policies continuam inexistentes.

Este PR não precisa inventar policy.

---

# 37. Billing failure

Binding/worker failure:

```text
→ CommercialTerms BLOCKED
```

---

# 38. Correlation propagation física

Criar:

```text
correlationId = test-correlation-X
```

na request Operations.

Clinical deve enxergar:

```text
test-correlation-X
```

Billing idem.

Não precisa compartilhar requestId.

---

# 39. Testar tipos RPC

O contrato deve impedir/recusar:

```text
tenantId vazio
customerId ausente
correlationId ausente
```

conforme validação definida.

Comunicação interna não elimina validação.

---

# 40. Context isolation agora no workerd

Executar duas requests simultâneas através do Operations Worker:

```text
A → Tenant A
B → Tenant B
```

O mesmo isolate/runtime pode servir ambas.

---

# 41. Provar resultado por tenant

As respostas têm que refletir:

```text
A only
B only
```

e não uma mistura.

---

# 42. Provar IDs

Request A:

```text
requestId=A
tenant=A
actor=A
```

Request B:

```text
requestId=B
tenant=B
actor=B
```

---

# 43. Stress de isolamento

Executar:

```text
100 requests
```

em lote/intercaladas.

Não é benchmark.

Objetivo:

```text
0 leaks
```

---

# 44. Se houver vazamento

PR falha imediatamente.

Não seguir com Scheduling.

Tenant leakage é blocker crítico.

---

# 45. Scheduling physical proof agora no Workers runtime

Finalmente testar o adapter real do PR-08:

```text
ScheduleReservationPort
        ↓
D1
```

---

# 46. Criar fixture por tentativa

Para reduzir interferência:

```text
Tenant T1
Professional P1
slot X1

Tenant T2
Professional P2
slot X2
...
```

ou IDs únicos por iteração.

---

# 47. Duas reservas concorrentes

Em cada slot:

```ts
await Promise.allSettled([
  reserve(candidate),
  reserve(candidate),
]);
```

---

# 48. Gate obrigatório

Para cada slot:

```text
success = 1
conflict = 1
rows = 1
```

---

# 49. Executar múltiplas iterações

Sugestão:

```text
50
```

Se workerd/test runtime ficar lento:

```text
20+
```

desde que haja uma justificativa.

Não usar uma única tentativa como “prova concorrente”.

---

# 50. Registrar relatório

Exemplo:

```text
iterations        50
attempts          100
successful        50
conflicts         50
double bookings    0
```

---

# 51. Adjacência

Provar:

```text
09:00–10:00
10:00–11:00
```

duas rows válidas.

---

# 52. Overlap parcial

```text
09:00–10:00
09:30–10:30
```

uma rejeitada.

---

# 53. Cross-tenant

Mesmo intervalo/profissional logical ID em tenant diferente não pode produzir conflito cross-tenant se modelo usa tenant como boundary.

---

# 54. Se ocorrer double booking

Não iniciar PR-12.

Criar imediatamente um blocker/ADR técnico:

```text
ScheduleReservation mechanism incompatible with required
concurrency guarantee on D1.
```

Não usar lock em memória.

---

# 55. Reliability física no mesmo runtime

Agora testar:

```text
UnitOfWork
```

contra D1 real do Workers runtime.

---

# 56. Success case

Agrupar:

```text
business mutation
idempotency
audit
outbox
```

Esperado:

```text
business 1
audit 1
outbox 1
idempotency COMPLETED
```

---

# 57. Failure case

Fazer uma statement falhar no batch.

Depois consultar diretamente D1.

Não assumir comportamento.

Registrar:

```text
business persisted?
audit persisted?
outbox persisted?
idempotency state?
```

---

# 58. Decisão importante sobre D1 batch

Se a semântica física for incompatível com:

```text
domain mutation + reliability
as one logical atomic unit
```

PR-12 fica bloqueado.

O PR deve corrigir UnitOfWork ou registrar necessidade de outro mecanismo.

---

# 59. Idempotency replay

Mesma:

```text
tenant
operation
key
hash
```

duas vezes.

Resultado:

```text
1 mutation
1 audit
1 outbox
same result
```

---

# 60. Idempotency conflict

Mesma key + hash diferente:

```text
IDEMPOTENCY_KEY_CONFLICT
```

e nenhuma segunda mutation.

---

# 61. Cross-tenant idempotency

Tenant A/key X e Tenant B/key X:

```text
independent
```

---

# 62. Outbox

Confirmar:

```text
status=PENDING
```

Não implementar consumer.

---

# 63. Audit

Confirmar append-only no caminho físico.

Não precisa implementar consulta administrativa.

---

# 64. Rodar unit suite completa

Depois de Workers tests:

```bash
npm run test:unit
```

PASS.

---

# 65. Rodar Workers suite completa

```bash
npm run test:workers
```

PASS.

O objetivo é que o projeto finalmente possua uma única sequência verificável.

---

# 66. Criar gate agregado

Sugestão:

```bash
npm run gate:runtime
```

que execute algo como:

```text
lint
typecheck
unit tests
workers tests
wrangler dry-runs
```

Mas só criar se isso estiver alinhado à estrutura atual.

---

# 67. Não colocar `wrangler dev` interativo no CI

Test harness automatizado deve substituir a necessidade de terminal persistente.

`dev:workers` continua para desenvolvimento humano.

---

# 68. Wrangler dry-runs permanecem

Mesmo com test harness:

```bash
npx wrangler deploy --dry-run \
  -c apps/operations-worker/wrangler.jsonc
```

idem Clinical/Billing.

Todos precisam continuar PASS.

---

# 69. `wrangler types`

Regenerar se contratos/configs mudarem:

```bash
npx wrangler types \
  -c apps/operations-worker/wrangler.jsonc
```

e demais.

---

# 70. Documentar dois ambientes

No README:

```text
Manual Development
npm run dev:workers

Automated Qualification
npm run test:workers
```

Assim ninguém depende do terminal mostrar `[connected]` para rodar os proofs.

---

# 71. O `not connected` manual ainda importa?

Sim, mas deixa de ser o único gate.

Se test harness oficial provar:

```text
Service Binding real
RPC
```

no runtime Workers, o bug/discovery issue do Wrangler manual pode ser documentado como tooling limitation.

A documentação da Cloudflare deixa claro que local execution usa Miniflare/workerd, o mesmo runtime subjacente de produção para desenvolvimento local. ([Cloudflare Docs][5])

---

# 72. Se o test harness também não resolver os bindings

Aí o problema provavelmente está na configuração/nomes/entrypoints, não apenas discovery visual.

Nesse caso o PR deve parar e inspecionar:

```text
wrangler names
service names
compatibility dates
entrypoint exports
WorkerEntrypoint signatures
contract types
```

Não avançar.

---

# 73. Verificar target names automaticamente

Criar teste de config:

```text
CLINICAL_SERVICE.service
=
clinical.wrangler.name

BILLING_SERVICE.service
=
billing.wrangler.name
```

Esse teste fica permanente.

---

# 74. Verificar `WorkerEntrypoint`

Teste estático ou type-level para:

```text
Clinical default export
→ WorkerEntrypoint

Billing default export
→ WorkerEntrypoint
```

e métodos:

```text
checkAssessmentEligibility
calculateCommercialTerms
```

---

# 75. CommercialTerms readiness vira gate formal

Depois de Billing RPC real:

```text
transport = PASS
```

executar com configuração real disponível.

Resultados possíveis:

### A

```text
READY
```

Então comercial está desbloqueado.

### B

```text
BLOCKED
```

porque policies são indisponíveis.

Isso determina o próximo PR.

---

# 76. Não marcar BLOCKED como falha do PR-11.6

Se:

```text
RPC PASS
business BLOCKED
```

o PR de runtime pode ser considerado aprovado.

Mas:

```text
PR-12 remains BLOCKED
```

---

# 77. Criar matriz `CreateAppointmentReadiness`

Adicionar documento:

```text
docs/plans/create-appointment-readiness.md
```

ou atualizar roadmap existente.

Matriz:

| Gate                       | Required | Result |
| -------------------------- | -------: | -----: |
| HTTP Worker runtime        |      Yes |   PASS |
| Authentication             |      Yes |   PASS |
| Tenancy                    |      Yes |   PASS |
| Permission                 |      Yes |   PASS |
| D1 runtime                 |      Yes |   PASS |
| License                    |      Yes |   PASS |
| Plan                       |      Yes |   PASS |
| Customer restrictions      |      Yes |   PASS |
| Assessment RPC             |      Yes |   PASS |
| Availability               |      Yes |   PASS |
| Conflict physical proof    |      Yes |   PASS |
| Reliability physical proof |      Yes |   PASS |
| Idempotency                |      Yes |   PASS |
| Billing RPC                |      Yes |   PASS |
| CommercialTerms READY      |      Yes |      ? |

---

# 78. PR-12 release rule

Formalizar:

```text
PR-12 may start only when
ALL REQUIRED GATES == PASS
```

Nada de:

```text
most pass
```

---

# 79. Se CommercialTerms = BLOCKED

O próximo PR deve ser:

# PR-11.7 — Commercial Policy Materialization

Esse PR será responsável por implementar adapters reais para:

```text
DiscountPolicyPort
DepositPolicyPort
```

exclusivamente a partir de configuração/regra canônica.

---

# 80. Antes do PR-11.7, revisar regras

Não inventar:

```text
10% discount
30% deposit
```

O PR comercial deve descobrir/definir onde a política é configurada:

```text
tenant
service
customer profile
campaign
```

apenas segundo as regras já aprovadas.

---

# 81. Se CommercialTerms = READY

Então finalmente:

# PR-12 — CreateAppointment Authoritative Flow

fica liberado.

---

# 82. Definition of Done — tooling

```text
[ ] vitest.config resolve

[ ] npm run test:unit PASS

[ ] Cloudflare Vitest/plugin config PASS

[ ] npm run test:workers PASS

[ ] no Rolldown UNRESOLVED_ENTRY
```

---

# 83. Definition of Done — Workers harness

```text
[ ] Operations loaded as production Worker build/config

[ ] Clinical loaded

[ ] Billing loaded

[ ] D1 binding usable

[ ] CLINICAL_SERVICE callable

[ ] BILLING_SERVICE callable

[ ] no public HTTP workaround
```

---

# 84. Definition of Done — RPC

```text
[ ] Operations → Clinical physical RPC PASS

[ ] Operations → Billing physical RPC PASS

[ ] Assessment APTO PASS

[ ] Assessment NAO_APTO BLOCKED

[ ] requiresAssessment=false avoids RPC

[ ] Billing response transported correctly

[ ] downstream failures remain BLOCKED

[ ] correlation propagated
```

---

# 85. Definition of Done — context

```text
[ ] sequential context isolation PASS

[ ] concurrent context isolation PASS

[ ] 100-request stress PASS

[ ] no tenant leak

[ ] no actor leak

[ ] no requestId leak
```

---

# 86. Definition of Done — D1

```text
[ ] migrations 0001–0004 initialize test database

[ ] Operations D1 proof PASS

[ ] Clinical D1 proof PASS

[ ] physical tenant isolation PASS
```

---

# 87. Definition of Done — Scheduling

```text
[ ] D1 adapter used

[ ] concurrent reservation proof PASS

[ ] >=20/50 contention iterations PASS

[ ] 0 double bookings

[ ] adjacent slots PASS

[ ] overlap partial BLOCKED

[ ] cross-tenant isolation PASS
```

---

# 88. Definition of Done — Reliability

```text
[ ] physical UnitOfWork success PASS

[ ] physical failure behavior documented

[ ] domain mutation included

[ ] idempotency completion consistent

[ ] replay PASS

[ ] hash conflict PASS

[ ] cross-tenant key PASS

[ ] Audit append PASS

[ ] Outbox PENDING PASS
```

---

# 89. Definition of Done — security regression

```text
[ ] health 200

[ ] unknown 404

[ ] no token 401

[ ] invalid token 401

[ ] no membership 403

[ ] no permission 403

[ ] invalid DTO 400

[ ] cross-tenant read blocked

[ ] cross-tenant mutation blocked
```

---

# 90. Definition of Done — quality

```text
[ ] npm run lint PASS

[ ] tsc --build --force PASS

[ ] npm run test:unit PASS

[ ] npm run test:workers PASS

[ ] D1 integration PASS

[ ] RPC integration PASS

[ ] concurrency PASS

[ ] reliability PASS

[ ] wrangler types PASS

[ ] dry-run Operations PASS

[ ] dry-run Clinical PASS

[ ] dry-run Billing PASS

[ ] git diff --check PASS
```

---

# 91. O que continua proibido

```text
POST /appointments

new discount %

new deposit %

Payment
Session
Package
Refund

Queue
Cron
Consumer

R2
KV

HTTP Operations→Clinical
HTTP Operations→Billing
```

---

# 92. Relatório final deste PR

O Codex deve encerrar com:

```text
PR-11.6 — Workers Test Harness + Service Binding Physical Proofs

Toolchain
Vitest unit:
Cloudflare plugin:
Workers tests:

Worker builds
Operations:
Clinical:
Billing:

D1
migrations:
Operations:
Clinical:

Service Bindings
Clinical transport:
Billing transport:

Clinical RPC
APTO:
APTO_COM_RESTRICOES:
NAO_APTO:
not-required:
failure:

Billing RPC
transport:
business result:

Context isolation
sequential:
concurrent:
stress:

Scheduling
iterations:
success:
conflicts:
double-bookings:
adjacent:
partial overlap:

Reliability
success:
failure:
replay:
hash conflict:
audit:
outbox:

HTTP security
401:
403:
400:
404:
cross-tenant:

Observability
correlation:
PII review:

CreateAppointmentReadiness
HTTP:
D1:
RPC:
Concurrency:
Reliability:
CommercialTerms:

Remaining blockers:

Next PR:
```

---

# 93. Critério exato para liberar PR-12

Eu congelaria formalmente esta expressão:

```text
CreateAppointmentReady =
  WorkerRuntimeQualified
  AND HttpSecurityQualified
  AND D1Qualified
  AND ClinicalRpcQualified
  AND BillingRpcQualified
  AND SchedulingConcurrencyQualified
  AND ReliabilityQualified
  AND IdempotencyQualified
  AND AppointmentEligibilityQualified
  AND CommercialTermsReady
```

Se qualquer elemento for falso:

```text
PR-12 = BLOCKED
```

---

# 94. Caminho esperado após este PR

Com o histórico atual, o cenário mais provável é:

```text
Workers runtime       PASS
Clinical RPC          PASS
Billing RPC           PASS
D1                    PASS
Concurrency           PASS
Reliability           PASS
CommercialTerms       BLOCKED
```

Nesse caso:

> **PR-11.7 — Commercial Policy Materialization**

será o último PR antes de CreateAppointment.

Se, ao contrário, o Billing já conseguir devolver `READY` com uma configuração real/normativa:

> **PR-12 — CreateAppointment Authoritative Flow** pode ser aberto imediatamente.

Em resumo: **o próximo PR deve deixar de depender do discovery visual do `wrangler dev` e transformar a topologia inteira em uma suíte física automatizada sobre o runtime oficial de testes da Cloudflare**. A plataforma hoje recomenda a integração Workers/Vitest para testes no `workerd` e um harness específico para integration tests multi-Worker, justamente o tipo de prova que este projeto agora precisa. ([Cloudflare Docs][2])

[1]: https://developers.cloudflare.com/workers/local-development/multi-workers/?utm_source=chatgpt.com "Developing with multiple Workers · Cloudflare Workers docs"
[2]: https://developers.cloudflare.com/workers/testing/vitest-integration/?utm_source=chatgpt.com "Vitest integration · Cloudflare Workers docs"
[3]: https://developers.cloudflare.com/workers/testing/?utm_source=chatgpt.com "Testing · Cloudflare Workers docs"
[4]: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/?utm_source=chatgpt.com "Service bindings - RPC (WorkerEntrypoint) · Cloudflare Workers docs"
[5]: https://developers.cloudflare.com/workers/local-development/?utm_source=chatgpt.com "Local development · Cloudflare Workers docs"
