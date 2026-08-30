Considerando o estado **real** após o PR-11.6, eu não avançaria ainda para Commercial Policies nem para `PR-12 — CreateAppointment`.

O PR-11.6 resolveu a parte mais difícil do harness: **Vitest/workerd já executa Workers reais e os RPCs via Service Binding foram fisicamente provados**. Agora o maior risco é outro: temos uma suíte unitária parcialmente quebrada e ainda não provamos fisicamente três invariantes que são requisitos normativos do produto:

```text
concorrência de agenda
atomicidade/reliability
isolamento multiempresa concorrente
```

Isso não é apenas qualidade técnica. A especificação exige mecanismo transacional para criação de agendamento + reserva do horário, revalidação de disponibilidade no backend, prevenção de execução parcial e idempotência para endpoints críticos.  O isolamento entre empresas também é uma invariância central do sistema. 

Portanto, o próximo PR deve ser:

# PR-11.7 — Physical Safety Proofs + Test Suite Stabilization

O propósito é transformar:

```text
Worker runtime       PASS
Service Bindings     PASS
RPC transport        PASS

Unit tests           6 FAIL
D1 domain proof      parcial
Concurrency          NOT PROVEN
Reliability          NOT PROVEN
Context isolation    NOT PROVEN
```

em:

```text
Unit suite                  PASS
Workers suite               PASS
D1 runtime                  PASS
Tenant isolation            PASS
Concurrent context          PASS
Scheduling concurrency      PASS
Reliability physical        PASS
Idempotency physical        PASS
```

Só depois disso devemos decidir entre:

```text
CommercialTerms BLOCKED → PR-11.8 Commercial Policies
CommercialTerms READY   → PR-12 CreateAppointment
```

---

# 1. Escopo exato

O PR-11.7 deve fazer **somente**:

```text
corrigir as 6 falhas da suíte unitária

qualificar D1 no workerd

provar isolamento multiempresa físico

provar isolamento de ExecutionContext

provar concorrência de ScheduleReservation

provar UnitOfWork contra D1

provar replay/conflict de idempotência

provar Audit + Outbox

consolidar gates automáticos
```

Não implementar:

```text
POST /appointments

DiscountPolicy real
DepositPolicy real

Payment
Refund
Package
Session

Queue
Cron
Outbox consumer

R2
KV
```

---

# 2. Gate inicial

Começar com:

```bash
pwd
git status
git branch --show-current
git log --oneline -20
```

Executar exatamente o estado atual:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers
```

Registrar:

```text
unit tests:
passed =
failed = 6

workers tests:
passed = 3
failed = 0
```

Não alterar nada antes de congelar essa baseline.

---

# 3. Classificar as seis falhas unitárias

O relatório informa três categorias:

```text
dependência de teste ausente
fixtures Nest incompletas
mensagens de erro divergentes
```

Não corrija as seis de forma ad hoc.

Criar matriz:

| Teste | Tipo da falha          | Código ou teste? |
| ----- | ---------------------- | ---------------- |
| X     | dependency missing     | infrastructure   |
| Y     | Nest fixture           | test composition |
| Z     | error message mismatch | contract drift   |

A pergunta em cada caso é:

> O código viola o contrato ou o teste está desatualizado?

Nunca alterar comportamento produtivo apenas para satisfazer uma expectativa antiga de teste.

---

# 4. Dependência de teste ausente

Primeiro identificar:

```bash
npm ls
```

e a dependência específica.

Se realmente for parte do stack de testes:

```bash
npm install -D <dependency>
```

somente na versão compatível com:

```text
Vitest 4.1.11
Vite 7
Cloudflare Vitest plugin
```

Não introduzir dependência de runtime para resolver test fixture.

---

# 5. Fixtures Nest incompletas

Se testes antigos instanciam:

```text
TestingModule
```

mas agora os módulos exigem:

```text
Config
Authentication
Tenancy
Reliability
```

não importar o Worker inteiro para testar uma classe pequena.

Preferir:

```text
useCase
+ explicit fake ports
```

em unit tests.

Por exemplo:

```text
CheckAppointmentEligibility
├── FakeTenantRepository
├── FakeCustomerRepository
├── FakeServiceRepository
├── FakeProfessionalRepository
├── FakeLicenseEligibility
├── FakePlanLimit
├── FakeAssessmentEligibility
└── FakeAvailability
```

Isso mantém unit tests independentes do Nest bootstrap.

---

# 6. Não transformar todos os testes em integration tests

A divisão deve permanecer:

```text
test:unit
→ Domain/Application puro

test:workers
→ workerd/D1/RPC/HTTP bridge
```

Não usar `workerd` para testar:

```text
TimeInterval.overlaps()
```

ou:

```text
CommercialTerms finalPrice
```

---

# 7. Mensagens de erro divergentes

Esse ponto precisa ser tratado como contrato.

Se o teste espera:

```text
"Invalid interval"
```

e o código retorna:

```text
"Start must be before end"
```

não escolha uma string arbitrariamente.

Preferir erro estruturado:

```text
code = INVALID_TIME_INTERVAL
```

e testar o `code`.

Textos podem mudar sem quebrar comportamento.

---

# 8. Padronizar testes por error code

Sempre que o projeto já possuir:

```text
TENANT_NOT_OPERATIONAL
TIME_CONFLICT
IDEMPOTENCY_KEY_CONFLICT
```

testar:

```text
error.code
```

em vez de mensagens completas.

Isso reduzirá fragilidade da suíte.

---

# 9. Gate unitário obrigatório

Após correções:

```bash
npm run test
```

Resultado:

```text
0 failed
```

Esse gate precisa fechar **antes** dos proofs físicos.

---

# 10. Manter os três testes Workers existentes

Não reescrever.

Eles já provam:

```text
Operations /health
404
Clinical RPC
Billing RPC
```

Devem continuar como regressão.

---

# 11. Expandir a suíte Workers por camadas

Eu organizaria:

```text
test/workers/
├── operations-runtime.spec.ts
├── tenant-isolation.spec.ts
├── context-isolation.spec.ts
├── scheduling-concurrency.spec.ts
├── reliability.spec.ts
└── idempotency.spec.ts
```

Não colocar tudo em um arquivo gigante.

---

# 12. Primeiro novo proof: D1 real

A suíte Workers precisa inicializar o banco com as migrations oficiais:

```text
0001_operations_foundation.sql
0002_reliability_foundation.sql
0003_scheduling_foundation.sql
0004_appointment_admission_dependencies.sql
```

Não criar:

```text
test-schema.sql
```

paralelo.

As migrations são a fonte de verdade.

---

# 13. Criar helper de migration para testes

Algo equivalente a:

```text
applyD1Migrations()
```

que leia:

```text
database/d1/migrations
```

em ordem.

Idealmente usar o mecanismo recomendado pela integração Cloudflare, sem parser SQL próprio complexo.

---

# 14. Cada suíte deve começar limpa

Evitar:

```text
test B depende do Customer criado pelo test A
```

Cada arquivo/caso deve possuir armazenamento isolado ou reset determinístico.

---

# 15. Prova Operations → D1

Usar o vertical já fisicamente qualificado:

```http
GET /tenants/:tenantId/customers
```

Preparar:

```text
Tenant A
Customer A
```

Request autenticado:

```text
HTTP bridge
→ Auth
→ Tenant
→ Permission
→ CustomerRepository
→ D1
```

Esperado:

```text
200
Customer A
```

---

# 16. Prova multiempresa física

Criar:

```text
Tenant A
  Customer A

Tenant B
  Customer B
```

Actor A:

```text
GET /tenants/A/customers
```

deve obter apenas:

```text
Customer A
```

RN-GER-002 exige que uma empresa jamais visualize ou altere dados da outra. 

---

# 17. Get cross-tenant

Actor A:

```text
GET /tenants/A/customers/<customer-B>
```

Resultado:

```text
404 ou 403
```

conforme contrato atual.

Nunca:

```text
200 Customer B
```

---

# 18. Mutation cross-tenant

Essa prova é ainda mais importante:

```text
PATCH /tenants/A/customers/<customer-B>
```

deve falhar.

Depois consultar diretamente D1:

```text
Customer B unchanged
```

Não basta confiar no HTTP status.

---

# 19. Prova concorrente de ExecutionContext

Agora que workerd executa Worker real, precisamos provar que o bootstrap/cache do runtime não mistura requests.

Criar:

```text
Tenant A / Actor A
Tenant B / Actor B
```

Executar simultaneamente:

```ts
await Promise.all([
  requestA(),
  requestB(),
]);
```

---

# 20. O que validar

Para A:

```text
tenantId=A
actorId=A
requestId=A
```

Para B:

```text
tenantId=B
actorId=B
requestId=B
```

E:

```text
requestId A != requestId B
```

`correlationId` deve seguir o input correspondente.

---

# 21. Não expor contexto só para o teste

Não criar endpoint:

```text
/debug/context
```

em produção.

Use:

* spy test-only;
* instrumentation;
* response headers já existentes;
* fake provider controlado;
* logs capturados no harness.

---

# 22. Stress leve

Executar:

```text
100 requests
```

alternando:

```text
A
B
A
B
...
```

com parte concorrente.

Critério:

```text
contextLeaks = 0
```

---

# 23. Se houver qualquer vazamento

Parar o PR.

Não executar Scheduling.

Tenant leakage é blocker P0.

---

# 24. Agora provar Scheduling fisicamente

Esse é o maior blocker histórico desde o PR-08.

A regra funcional determina que o mesmo profissional não pode ter compromissos sobrepostos e que a duração integral precisa ser considerada. 

Além disso, a especificação exige revalidar a disponibilidade no backend antes de confirmar. 

---

# 25. O adapter a ser provado

Obrigatoriamente:

```text
ScheduleReservationPort
        ↓
D1 adapter real
        ↓
workerd D1
```

Não:

```text
InMemoryScheduleRepository
```

---

# 26. Cenário básico

Criar:

```text
Tenant A
Professional P
Customer C1
Customer C2
Service S
```

Slot:

```text
09:00–10:00
```

---

# 27. Duas reservas concorrentes

Executar:

```ts
await Promise.allSettled([
  reserve(C1, P, 09:00, 10:00),
  reserve(C2, P, 09:00, 10:00),
]);
```

---

# 28. Resultado obrigatório

```text
successes = 1
conflicts = 1

SELECT count(...)
= 1
```

A criação de agendamento e reserva do horário é explicitamente classificada como operação crítica atômica. 

---

# 29. Repetir o contention test

Uma única execução não basta.

Sugestão:

```text
iterations = 50
attempts   = 100
```

com slot/IDs independentes.

Gate:

```text
doubleBookings = 0
```

---

# 30. Não buscar “100% estatístico”

O objetivo não é benchmark formal.

É provar que a primitive escolhida:

```sql
INSERT ... WHERE NOT EXISTS (...)
```

se comporta corretamente no D1/workerd sob contention.

---

# 31. Teste adjacente

```text
09:00–10:00
10:00–11:00
```

Resultado:

```text
2 success
```

---

# 32. Overlap parcial

```text
09:00–10:00
09:30–10:30
```

Resultado:

```text
1 success
1 conflict
```

---

# 33. Contenção inversa

Também:

```text
09:30–10:30
09:00–10:00
```

para evitar algoritmo dependente da ordem.

---

# 34. Contenção por tenant

Mesmos horários em:

```text
Tenant A
Tenant B
```

devem coexistir.

Tenant deve participar de todas as predicates de conflito.

---

# 35. Estados de Appointment que ocupam agenda

Os testes devem utilizar apenas estados considerados ocupantes pela policy existente.

Não duplicar lista de status no SQL test.

Use:

```text
AppointmentOccupancyPolicy
```

ou contrato implementado no PR-08.

---

# 36. Se surgir double booking

Resultado:

```text
PR-11.7 FAIL
PR-12 BLOCKED
```

Não use:

```text
global Map
mutex
semaphore Node
```

Workers podem operar em isolates diferentes.

---

# 37. Abrir uma ADR/gap se a primitive falhar

Algo como:

```text
ADR-0011
D1 Appointment Reservation Concurrency Strategy
```

pode ser necessário.

Possíveis mecanismos alternativos devem ser avaliados separadamente.

Não improvisar dentro do PR.

---

# 38. Próximo proof: Reliability físico

A especificação exige que falhas não deixem operações críticas parcialmente concluídas. 

Agora precisamos verificar o `UnitOfWork` real.

---

# 39. Usar `TransactionContext.persistence`

O fluxo já preparado é:

```text
UnitOfWork
    │
    ├── domain persistence
    ├── idempotency
    ├── audit
    └── outbox
```

O teste deve atravessar o adapter D1 real.

---

# 40. Criar operation fixture específica

Não precisa criar `POST /appointments`.

Pode existir um use case/test harness interno:

```text
ReliableMutationFixture
```

somente dentro dos testes.

Ele agenda:

```text
business INSERT
audit INSERT
outbox INSERT
idempotency operations
```

no mesmo `UnitOfWork`.

---

# 41. Success proof

Executar uma operação válida.

Consultar D1 após conclusão.

Esperado:

```text
businessRows        1
auditEvents         1
outboxEvents        1
idempotencyStatus   COMPLETED
```

Auditoria precisa existir para criação de agendamento e outras mutações críticas segundo a especificação. 

---

# 42. Audit deve preservar correlation

Confirmar no registro:

```text
tenant
actor
resource
correlationId
```

conforme contrato implementado.

Sem PII desnecessária.

---

# 43. Outbox

Novo evento:

```text
status = PENDING
```

Nenhum consumer deve executá-lo.

---

# 44. Failure proof

Criar uma falha proposital dentro do grupo.

Exemplo:

```text
business statement valid
audit statement valid
outbox violates controlled constraint
```

Executar.

---

# 45. Não assumir rollback

Depois da falha, consultar:

```text
business row?
audit?
outbox?
idempotency?
```

Registrar a realidade.

O objetivo é verificar se `D1Database.batch()` satisfaz a semântica que a foundation atribuiu a ele.

---

# 46. Gate de Reliability

Só considerar PASS se o comportamento físico atender ao invariant:

```text
critical operation
does not become partially committed
```

RNF-017 exige exatamente isso. 

---

# 47. Se houver parcialidade

Não abrir PR-12.

Precisaremos criar:

> **PR-11.7A — D1 UnitOfWork Atomicity Correction**

antes de qualquer fluxo autoritativo.

---

# 48. Idempotência física

A especificação exige que operações críticas sejam protegidas contra repetição acidental. 

Testar a implementação existente no D1.

---

# 49. Replay

Primeira execução:

```text
tenant=A
operation=ReliableMutationFixture
key=K
hash=H
```

Resultado:

```text
COMPLETED
```

Repetir exatamente.

Esperado:

```text
same logical result

business rows 1
audit events  1
outbox events 1
```

---

# 50. Hash conflict

Depois:

```text
same tenant
same operation
same key=K
hash=H2
```

Resultado:

```text
IDEMPOTENCY_KEY_CONFLICT
```

Nenhum novo business write.

---

# 51. Cross-tenant idempotency

```text
Tenant A / K
Tenant B / K
```

devem coexistir.

Porque a chave já foi definida como:

```text
tenantId + operation + idempotencyKey
```

---

# 52. Teste PROCESSING/reentrância

Se a implementação suporta status `PROCESSING`, testar duas execuções simultâneas usando a mesma idempotency key.

O resultado deve seguir o contrato já implementado:

```text
uma operação é dona da execução
outra recebe replay/in-progress
```

Não inventar nova semântica.

---

# 53. Provar Clinical D1 além do RPC superficial

Os três testes atuais provaram chamada RPC.

Agora Clinical deve ser provado com persistence real.

Criar:

```text
Tenant A
Assessment APTO
```

no D1 usado pelo Clinical.

Operations chama:

```text
CLINICAL_SERVICE
→ checkAssessmentEligibility
```

Resultado precisa depender da row real.

---

# 54. APTO

```text
requiresAssessment=true
assessment=APTO
→ READY
```

---

# 55. NAO_APTO

```text
→ BLOCKED
```

---

# 56. Assessment cross-tenant

Assessment Tenant B não pode satisfazer:

```text
Tenant A
Customer A
Service A
```

Mesmo se IDs colidirem.

---

# 57. `requiresAssessment=false`

Continuar provando:

```text
Clinical invocation = 0
```

Isso reduz fan-out e custo.

---

# 58. Billing RPC físico já existe, mas falta status comercial

A suíte deve manter prova:

```text
Operations
→ BILLING_SERVICE
→ CalculateCommercialTerms
```

Transport:

```text
PASS
```

Business:

```text
BLOCKED
```

se policies continuam indisponíveis.

---

# 59. Não resolver CommercialTerms neste PR

Muito importante.

PR-11.7 é físico.

Não adicionar:

```text
Discount configuration
Deposit configuration
```

para fazer `READY`.

Isso virá no próximo PR se necessário.

---

# 60. HTTP Security regressions

Agora que a suíte está maior, fixar:

```text
GET /health → 200
unknown → 404
no auth → 401
invalid auth → 401
no membership → 403
no permission → 403
invalid payload → 400
missing resource → 404
```

Esses testes passam a proteger o bridge.

---

# 61. Mutation de Customer

Provar:

```text
PATCH
→ D1 mutation
```

e reconsultar D1 diretamente.

Isso demonstra que o HTTP bridge não é apenas read-only.

---

# 62. Request IDs

Cada response HTTP deve manter:

```text
x-request-id
x-correlation-id
```

Adicionar asserts permanentes.

---

# 63. Correlation RPC

Operations:

```text
correlation=X
```

Clinical/Billing:

```text
correlation=X
```

Testar fisicamente.

---

# 64. PII review

Capturar logs/traces dos testes quando possível e verificar ausência de:

```text
Authorization
telefone
email
documento
assessment clinical payload
```

Logs seguros são requisito explícito. 

---

# 65. Criar um gate agregado

Quando todos os testes estiverem estáveis, criar script:

```bash
npm run gate:pr12
```

ou nome equivalente.

Conceitualmente:

```text
lint
↓
typecheck
↓
unit tests
↓
workers tests
↓
dry-run workers
```

---

# 66. Exemplo conceitual

```json
{
  "scripts": {
    "gate:pr12": "npm run lint && npm run typecheck && npm run test:unit && npm run test:workers && npm run workers:dry-run"
  }
}
```

Adaptar aos scripts reais.

Não colocar comandos interativos.

---

# 67. Dry-run agregado

Pode existir:

```text
workers:dry-run
```

que execute:

```text
Operations
Clinical
Billing
```

sequencialmente.

---

# 68. Resultado obrigatório

```bash
npm run gate:pr12
```

deve retornar:

```text
exit code 0
```

Esse passa a ser o gate executável de release para o próximo fluxo.

---

# 69. Criar relatório de qualification

Atualizar/criar:

```text
docs/plans/
PR-11.7-physical-safety-qualification.md
```

com resultados concretos, não apenas “teste criado”.

---

# 70. Matriz final de provas

Ela deve ficar assim:

| Prova                  | Resultado |
| ---------------------- | --------: |
| Unit tests             |      PASS |
| Worker health          |      PASS |
| HTTP security          |      PASS |
| Operations D1          |      PASS |
| Cross-tenant D1        |      PASS |
| Context isolation      |      PASS |
| Clinical RPC           |      PASS |
| Clinical D1            |      PASS |
| Billing RPC transport  |      PASS |
| Scheduling concurrency |      PASS |
| Reliability atomicity  |      PASS |
| Idempotency replay     |      PASS |
| Idempotency conflict   |      PASS |
| Audit                  |      PASS |
| Outbox                 |      PASS |

---

# 71. Critério quantitativo de Scheduling

Relatório deve registrar:

```text
iterations
attempts
successes
conflicts
doubleBookings
```

Exemplo aceitável:

```text
iterations       50
attempts         100
successes         50
conflicts         50
doubleBookings     0
```

---

# 72. Critério quantitativo de contexto

Registrar:

```text
requests
tenant leaks
actor leaks
requestId leaks
```

Exemplo:

```text
requests          100
tenantLeaks         0
actorLeaks          0
requestIdLeaks      0
```

---

# 73. Critério de Reliability

Relatório:

```text
successProof PASS

failureProof:
business persisted = false
audit persisted = false
outbox persisted = false
...
```

ou o comportamento real equivalente.

Não escrever apenas:

```text
rollback PASS
```

sem evidência.

---

# 74. Free Tier

A suíte agora também deve ajudar a verificar número lógico de consultas.

O futuro `CreateAppointment` não pode carregar:

```text
todos appointments do dia/mês
```

para detectar conflito.

Verificar que a query de overlap usa:

```text
tenant
professional
interval
```

e os índices previstos.

---

# 75. `EXPLAIN` quando possível

Se D1/SQLite local permitir:

```sql
EXPLAIN QUERY PLAN ...
```

usar nas queries críticas:

```text
schedule conflict
license lookup
assessment latest
customer lookup
```

Registrar se usa índice.

Não precisa transformar esse PR em otimização geral.

---

# 76. Não introduzir KV para “resolver performance”

Primeiro prove D1.

Cache de:

```text
license
customer restriction
```

tem risco de stale authorization.

---

# 77. CommercialTerms readiness no final

Somente depois de todos os gates físicos:

```text
Billing RPC transport = PASS
```

executar uma avaliação de readiness:

```text
Can CommercialTerms become READY using
the current normative persisted configuration?
```

Atualmente a resposta provavelmente será:

```text
NO
```

---

# 78. Isso não torna PR-11.7 FAIL

O PR tem objetivo de segurança física.

Se:

```text
all physical gates = PASS
CommercialTerms = BLOCKED
```

o PR fecha com sucesso.

Mas:

```text
PR-12 = BLOCKED
```

---

# 79. Próximo PR nesse cenário

Será:

# PR-11.8 — Commercial Policy Materialization

Ele implementará os adapters reais de:

```text
DiscountPolicyPort
DepositPolicyPort
```

usando as regras canônicas existentes.

A documentação já define que os valores e critérios de perfil são configurados pela empresa, que o desconto precisa preservar snapshot histórico e que o sinal pode ser não exigido, fixo ou percentual e é calculado após o desconto.

---

# 80. Importante: há material normativo suficiente para PR-11.8

Ao contrário do início do roadmap, agora sabemos explicitamente que `Service` pode definir:

```text
exige sinal
sinal fixo
sinal percentual
permite desconto
preço mínimo
```



E Discount possui regras como:

```text
não gerar preço negativo
não ultrapassar operação
não reduzir abaixo do mínimo
respeitar limite de autorização
```



Portanto provavelmente será possível materializar políticas sem inventar percentuais.

---

# 81. Não implementá-las antes do fechamento físico

Ainda assim, mantenha a ordem:

```text
physical safety
        ↓
commercial rules
        ↓
CreateAppointment
```

Não misturar PR-11.7 e PR-11.8.

---

# 82. Definition of Done — Unit Suite

```text
[ ] todas as 6 falhas classificadas

[ ] dependency missing corrigida sem alterar runtime

[ ] Nest fixtures corrigidas/isoladas

[ ] error contracts estabilizados

[ ] npm run test PASS

[ ] zero failing unit tests
```

---

# 83. Definition of Done — D1

```text
[ ] migrations 0001–0004 utilizadas pelo harness

[ ] Operations repository usa D1 real

[ ] Clinical repository usa D1 real

[ ] cross-tenant read proof PASS

[ ] cross-tenant mutation proof PASS
```

---

# 84. Definition of Done — Context

```text
[ ] sequential isolation PASS

[ ] concurrent isolation PASS

[ ] >=100 alternating requests PASS

[ ] tenantLeaks = 0

[ ] actorLeaks = 0

[ ] requestIdLeaks = 0
```

---

# 85. Definition of Done — Scheduling

```text
[ ] ScheduleReservationPort real usado

[ ] contention test executável

[ ] >=20/50 contention iterations

[ ] exact overlap blocks

[ ] partial overlap blocks

[ ] adjacent intervals allowed

[ ] cross-tenant independent

[ ] doubleBookings = 0

[ ] nenhum lock em memória
```

---

# 86. Definition of Done — Reliability

```text
[ ] UnitOfWork usa D1 real

[ ] business mutation entra no persistence batch

[ ] success proof PASS

[ ] failure semantics fisicamente observadas

[ ] nenhum partial state proibido

[ ] Audit append PASS

[ ] Outbox PENDING PASS
```

---

# 87. Definition of Done — Idempotency

```text
[ ] initial execution PASS

[ ] same-key same-hash replay PASS

[ ] exactly one business mutation

[ ] exactly one audit creation

[ ] exactly one outbox creation

[ ] same-key different-hash conflict PASS

[ ] tenant A/key X independente tenant B/key X
```

---

# 88. Definition of Done — RPC

```text
[ ] Clinical RPC transport PASS

[ ] Clinical APTO via D1 PASS

[ ] Clinical NAO_APTO via D1 BLOCKED

[ ] Clinical cross-tenant PASS

[ ] requiresAssessment=false avoids Clinical

[ ] Billing RPC transport PASS

[ ] Billing BLOCKED preservado quando policy ausente

[ ] correlation propagated
```

---

# 89. Definition of Done — HTTP

```text
[ ] health 200

[ ] unknown 404

[ ] missing token 401

[ ] invalid token 401

[ ] missing membership 403

[ ] missing permission 403

[ ] invalid DTO 400

[ ] customer D1 read PASS

[ ] customer D1 mutation PASS

[ ] response identifiers present
```

---

# 90. Definition of Done — gates

```text
[ ] npm run lint PASS

[ ] npx tsc --build --force PASS

[ ] npm run test PASS

[ ] npm run test:workers PASS

[ ] Operations dry-run PASS

[ ] Clinical dry-run PASS

[ ] Billing dry-run PASS

[ ] git diff --check PASS

[ ] aggregate PR-12 gate PASS except commercial readiness
```

---

# 91. O que NÃO deve aparecer no diff

```text
POST /appointments

DiscountPolicy production implementation
DepositPolicy production implementation

Payment
Session
Package
Refund

Queue
Cron
Consumer

KV
R2
```

---

# 92. Relatório pós-PR obrigatório

Eu exigiria:

```text
PR-11.7 — Physical Safety Proofs + Test Suite Stabilization

Unit Suite
previous failures:
fixed:
remaining:

Workers Runtime
tests:
passed:
failed:

D1
Operations:
Clinical:
cross-tenant read:
cross-tenant mutation:

Context Isolation
sequential:
concurrent:
requests:
tenantLeaks:
actorLeaks:
requestIdLeaks:

Scheduling Concurrency
iterations:
attempts:
successes:
conflicts:
doubleBookings:
adjacent:
partialOverlap:
crossTenant:

Reliability
success:
failure:
business:
audit:
outbox:
idempotency:

Idempotency
replay:
hashConflict:
crossTenant:

RPC
Clinical transport:
Clinical D1:
Billing transport:
Billing business status:

Security
401:
403:
400:
404:

Observability
correlation:
PII:

Quality Gates
lint:
typecheck:
unit:
workers:
dry-run:

CreateAppointmentReadiness
runtime:
security:
D1:
tenant isolation:
concurrency:
reliability:
idempotency:
Clinical:
Billing transport:
CommercialTerms:

Next PR:
```

---

# 93. Critério para sair desse ciclo de PR-11.x

Depois do PR-11.7, eu não criaria mais outro PR técnico de runtime **se todos esses gates físicos estiverem verdes**.

Teremos encerrado a qualificação.

A única pergunta restante será comercial.

---

# 94. Roadmap a partir daqui

## Cenário mais provável

Se:

```text
PR-11.7 physical gates = PASS

CommercialTerms =
BLOCKED
```

então:

> **PR-11.8 — Commercial Policy Materialization**

Depois:

> **PR-12 — CreateAppointment Authoritative Flow**

## Cenário alternativo

Se os testes mostrarem que já existe configuração normativa capaz de produzir:

```text
CommercialTerms = READY
```

então:

> **PR-12** pode começar imediatamente.

---

# 95. Gate definitivo para PR-12

Eu agora transformaria isso em uma regra executável/documental:

```text
CreateAppointmentReady =
    UnitSuitePass
AND WorkersSuitePass
AND D1PhysicalPass
AND TenantIsolationPass
AND ContextIsolationPass
AND SchedulingConcurrencyPass
AND ReliabilityPhysicalPass
AND IdempotencyPhysicalPass
AND ClinicalRpcPass
AND BillingRpcPass
AND AppointmentEligibilityPass
AND CommercialTermsReady
```

Se qualquer item for falso:

```text
POST /appointments
MUST NOT EXIST
```

Essa disciplina está alinhada diretamente às regras canônicas: criação de agendamento exige pré-condições completas, ocupa o intervalo integral, não pode duplicar por concorrência, deve preservar preço/desconto/sinal como snapshot, e operações críticas precisam de atomicidade e idempotência.

**Portanto, o próximo PR deve ser PR-11.7 — Physical Safety Proofs + Test Suite Stabilization. Ele é o último PR técnico de qualificação antes de atacar a policy comercial e, então, finalmente liberar o PR-12.**
