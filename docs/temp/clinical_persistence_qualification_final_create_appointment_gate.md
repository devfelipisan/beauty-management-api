Com o PR-11.8 concluído, eu **não abriria ainda o PR-12**, porque o próprio relatório deixou um único gate físico pendente:

```text
Clinical Assessment
APTO / NAO_APTO
persistido em D1
→ RPC real
→ AppointmentEligibility
```

Todo o restante necessário ao `CreateAppointment` já está muito próximo de READY:

```text
Scheduling concurrency      PASS
Reliability                 PASS
Idempotency                 PASS
Tenant isolation            PASS
Context isolation           PASS
Workers runtime             PASS
Billing RPC                 PASS
CommercialTerms READY       PASS
Clinical transport          PASS

Clinical persistence proof  PENDING
```

Portanto, o próximo PR deve ser pequeno, cirúrgico e conclusivo:

# PR-11.9 — Clinical Persistence Qualification + Final CreateAppointment Gate

O objetivo é **fechar a última prova física**, executar novamente toda a qualificação e produzir formalmente:

```text
CreateAppointmentReady = PASS
```

Sem implementar `POST /appointments` ainda.

---

# 1. Escopo exato

O PR-11.9 deve implementar/provar apenas:

```text
Assessment D1 fixture real

APTO persistido
NAO_APTO persistido
APTO_COM_RESTRICOES persistido

Clinical Repository real
Clinical RPC real

Operations
→ AssessmentEligibilityPort
→ CLINICAL_SERVICE
→ Clinical Worker
→ D1

cross-tenant Assessment isolation

assessment validity

requiresAssessment=false short-circuit

final AppointmentEligibility integration

gate:create-appointment
```

Não entram:

```text
POST /appointments

novo domínio

Payment
Refund
Package
Session

Queue
Cron
Outbox consumer

KV
R2

novas policies comerciais
```

---

# 2. Primeiro gate: preservar tudo que já passou

Antes de qualquer alteração:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:physical-safety
```

Resultado obrigatório:

```text
exit code 0
```

Também:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers
```

Baseline esperada:

```text
Unit:
31 arquivos
52 testes
PASS

Workers:
4 arquivos
13 testes
PASS
```

Se houver regressão, corrigir antes da prova Clinical.

---

# 3. Não criar nova migration

O relatório informa que:

```text
assessments
```

já existe desde:

```text
0004_appointment_admission_dependencies.sql
```

Logo PR-11.9 não deveria precisar de:

```text
0006_...
```

apenas para testes.

Primeiro provar o schema que já existe.

---

# 4. Inspecionar a migration Clinical existente

Verificar:

```bash
grep -n "assessments" \
  database/d1/migrations/0004_appointment_admission_dependencies.sql
```

Confirmar os campos reais.

Esperado conceitualmente:

```text
id
tenant_id
customer_id
service_id
professional_id

result

performed_at
valid_until

created_at
...
```

Usar os nomes existentes, não criar fixture baseada em pressuposição.

---

# 5. Confirmar índices

A query fundamental do Clinical é algo equivalente a:

```text
tenant
+
customer
+
service
+
latest assessment
```

Verificar o índice real.

Se faltar índice necessário para a consulta já implementada, isso pode justificar uma migration pequena.

Mas não criar índice apenas porque “parece bom”.

Use a query real.

---

# 6. Inspecionar o `AssessmentRepository`

Verificar:

```bash
cat apps/clinical-worker/src/assessments/ports/assessment-repository.ts
```

e:

```bash
cat apps/clinical-worker/src/assessments/adapters/d1-assessment-repository.ts
```

A operação deve ser orientada a eligibility, algo como:

```text
findLatestForEligibility(...)
```

e tenant-aware.

---

# 7. Primeiro teste físico: APTO

Adicionar teste Workers específico, por exemplo:

```text
test/workers/
clinical-assessment-persistence.spec.ts
```

ou integrar ao arquivo existente, se ficar pequeno.

Preparar fixtures:

```text
Tenant A
Customer A
Service A
Professional A
```

E inserir Assessment:

```text
result = APTO
```

usando D1 real do harness.

---

# 8. Não mockar o Clinical repository

A prova precisa atravessar:

```text
Operations Worker
        ↓
AssessmentEligibilityPort
        ↓
Clinical Service Binding adapter
        ↓
CLINICAL_SERVICE
        ↓
Clinical WorkerEntrypoint
        ↓
CheckAssessmentEligibility
        ↓
D1AssessmentRepository
        ↓
D1
```

Essa cadeia inteira precisa ser real.

Não:

```text
FakeAssessmentRepository
```

para esta prova.

---

# 9. Resultado APTO

Dado:

```text
Service.requiresAssessment = true
```

e:

```text
Assessment.result = APTO
```

resultado obrigatório:

```text
AssessmentEligibility = READY
```

e depois:

```text
AppointmentEligibility
```

deve continuar avaliando os demais gates.

---

# 10. Provar que o resultado veio do D1

Após inserir `APTO`:

```text
READY
```

Depois alterar/remover a fixture e executar novamente.

O resultado precisa mudar.

Isso evita um falso positivo causado por um adapter fixo ou cache errado.

---

# 11. Segundo cenário: NAO_APTO

Criar Assessment:

```text
result = NAO_APTO
```

Mesma cadeia física.

Resultado:

```text
BLOCKED
```

com reason correspondente ao contrato atual.

Não testar por texto livre.

Preferir:

```text
error/reason code
```

---

# 12. Não criar regra nova para NAO_APTO

A policy já existe.

Este PR apenas prova fisicamente:

```text
persistência
→ repository
→ RPC
→ policy
```

Não modificar comportamento para fazer o teste passar, salvo bug real.

---

# 13. Terceiro cenário: APTO_COM_RESTRICOES

Também precisa ser fisicamente provado.

Criar:

```text
result = APTO_COM_RESTRICOES
```

O resultado deve seguir exatamente a policy já implementada.

Se atualmente é considerado elegível:

```text
READY
```

preservar.

Se alguma restrição explícita é necessária:

```text
BLOCKED
```

somente conforme contrato existente.

---

# 14. Não confundir Customer restriction com Assessment restriction

São dois mecanismos diferentes:

```text
Customer.blockedForNewAppointments
```

versus:

```text
Assessment.result = APTO_COM_RESTRICOES
```

O teste deve impedir que alguém misture ambos no futuro.

---

# 15. Validity test

Se a avaliação possui:

```text
validUntil
```

provar fisicamente:

```text
validUntil > now
→ usable
```

e:

```text
validUntil < now
→ BLOCKED
```

---

# 16. Sem validade explícita

Se:

```text
validUntil = null
```

a policy deve seguir a semântica já documentada.

Não inventar expiração.

---

# 17. Latest Assessment semantics

Esse teste é importante.

Criar:

```text
Assessment 1
APTO
performedAt = older

Assessment 2
NAO_APTO
performedAt = newer
```

A decisão deve utilizar o registro definido pelo contrato, provavelmente o mais recente.

Resultado:

```text
BLOCKED
```

se essa é a semântica implementada.

---

# 18. Inverter

Depois:

```text
Assessment 1
NAO_APTO
older

Assessment 2
APTO
newer
```

Resultado:

```text
READY
```

Isso prova que o repository não retorna row arbitrária.

---

# 19. Cross-tenant Assessment — obrigatório

Criar:

```text
Tenant A
Customer A
Service A
```

Mas somente:

```text
Assessment Tenant B
customerId/customer equivalentes
service equivalente
result APTO
```

Então:

```text
Tenant A
```

não pode receber:

```text
READY
```

com base naquela avaliação.

Esperado:

```text
BLOCKED
```

por ausência de Assessment válido no tenant correto.

---

# 20. Mesmo ID físico em outro tenant

Se o schema/fixtures permitirem, testar IDs semelhantes.

Objetivo:

```text
tenant_id
```

precisa fazer parte da seleção.

Não confiar apenas em IDs globalmente únicos para isolamento.

---

# 21. Cross-service Assessment

Assessment de:

```text
Service A
```

não deve satisfazer eligibility de:

```text
Service B
```

se o contrato é service-specific, como já foi modelado.

---

# 22. Cross-customer

Mesma regra:

```text
Assessment Customer A
```

não serve para:

```text
Customer B
```

---

# 23. `requiresAssessment=false`

Este teste já deveria existir logicamente, mas agora precisa permanecer no harness físico.

Dado:

```text
Service.requiresAssessment = false
```

não importa se:

```text
Clinical Worker
```

tem ou não Assessment.

Resultado:

```text
Assessment check = NOT_REQUIRED
```

e:

```text
CLINICAL_SERVICE invocation count = 0
```

quando mensurável.

---

# 24. Esse short-circuit é importante para Free Tier

Evita:

```text
Operations
→ Clinical
```

em todos os agendamentos.

Logo isso deve virar regression test permanente.

---

# 25. Clinical unavailable

Quando:

```text
requiresAssessment=true
```

e o Clinical falha:

```text
BLOCKED
```

continua obrigatório.

Este PR não deve remover a proteção fail-closed agora que o caminho real está funcionando.

---

# 26. Correlation propagation

Na chamada física:

```text
Operations correlationId = X
```

provar:

```text
Clinical correlationId = X
```

O Clinical pode gerar:

```text
requestId próprio
```

Isso é esperado.

---

# 27. Não enviar PII no RPC

Revalidar o request.

Permitido:

```text
tenantId
customerId
serviceId
correlationId
```

Conforme contrato.

Não:

```text
customerName
phone
email
document
assessment details
JWT completo
```

---

# 28. Não retornar Assessment completo

O Clinical deve responder:

```text
READY/BLOCKED
reason
```

ou contrato equivalente.

Não:

```text
Assessment entity
```

---

# 29. Prova integrada do AppointmentEligibility

Depois dos testes isolados de Clinical RPC, montar um cenário totalmente elegível.

Fixtures:

```text
Tenant ACTIVE

License ACTIVE

Plan capability available

Customer ACTIVE
blockedForNewAppointments=false

Service ACTIVE
requiresAssessment=true

Professional ACTIVE
Professional-Service enabled

Assessment APTO

free interval
no conflicting Appointment
```

Executar:

```text
CheckAppointmentEligibility
```

através da infraestrutura real onde aplicável.

Esperado:

```text
READY
```

---

# 30. Cenário final `NAO_APTO`

Com todo o resto válido e apenas:

```text
Assessment = NAO_APTO
```

resultado:

```text
BLOCKED
```

Isso prova que Assessment realmente é um gate de admissão.

---

# 31. Regressão comercial simultânea

Depois de fechar Clinical, executar novamente o cenário do PR-11.8:

```text
basePriceCents = 20000
discountCents = 2000
finalPriceCents = 18000
deposit = 20%
depositCents = 3600
```

por:

```text
Operations
→ BILLING_SERVICE
→ Billing
```

Resultado:

```text
CommercialTerms = READY
```

Isso garante que fechar Clinical não quebrou Billing.

---

# 32. Criar cenário comercial mais simples

Além do exemplo com discount/deposit, provar:

```text
allowsDiscount = false
deposit = NOT_REQUIRED
```

Resultado:

```text
CommercialTerms READY

discountCents = 0
deposit absent
```

Esse caminho será útil no PR-12 para fixtures mais simples.

---

# 33. Não testar `CreateAppointment` neste PR

Ainda não faça uma “prévia” escondida:

```text
eligibility
+
commercial terms
+
insert appointment
```

O insert autoritativo é exatamente o PR-12.

PR-11.9 deve apenas provar as dependencies.

---

# 34. Criar gate final

Agora sim materializar o gate que o PR-11.8 preparou conceitualmente:

```bash
npm run gate:create-appointment
```

Esse gate deve executar, no mínimo:

```text
lint
typecheck
unit
workers
physical safety
Clinical persistence proofs
CommercialTerms READY proof
dry-runs
```

---

# 35. Reutilizar gates existentes

Não duplicar todos os comandos manualmente se já existe:

```bash
npm run gate:physical-safety
```

Então:

```text
gate:create-appointment
        ↓
gate:physical-safety
+
final Clinical proof
+
CommercialTerms readiness
```

ou equivalente.

---

# 36. Não usar script que passa apesar de teste ignorado

O gate deve falhar se:

```text
clinical persistence tests
```

forem:

```text
skip
todo
```

para cenários obrigatórios.

---

# 37. Criar documento formal de readiness

Atualizar/criar:

```text
docs/plans/create-appointment-readiness.md
```

Estado final esperado:

| Gate                   | Resultado |
| ---------------------- | --------: |
| Worker runtime         |      PASS |
| HTTP bridge            |      PASS |
| Authentication         |      PASS |
| Tenancy                |      PASS |
| Permission             |      PASS |
| D1                     |      PASS |
| Tenant isolation       |      PASS |
| Context isolation      |      PASS |
| Scheduling concurrency |      PASS |
| Reliability            |      PASS |
| Idempotency            |      PASS |
| License                |      PASS |
| Plan                   |      PASS |
| Customer restrictions  |      PASS |
| Clinical RPC           |      PASS |
| Clinical D1 APTO       |      PASS |
| Clinical D1 NAO_APTO   |      PASS |
| Billing RPC            |      PASS |
| Discount Policy        |      PASS |
| Deposit Policy         |      PASS |
| CommercialTerms READY  |      PASS |

Então:

```text
CreateAppointmentReady = PASS
```

---

# 38. Congelar essa matriz

Depois disso, não reabrir decisões anteriores dentro do PR-12 sem uma regressão real.

O PR-12 deve consumir fundações já qualificadas.

---

# 39. Reexecutar scheduling proof

Mesmo sem mudanças em Scheduling:

```bash
npm run gate:physical-safety
```

continua obrigatório.

Esperado:

```text
20 iterations
40 attempts
20 success
20 conflict
0 double booking
```

ou resultados equivalentes da suíte.

---

# 40. Reexecutar Reliability

Também:

```text
UnitOfWork
Audit
Outbox
Idempotency
```

devem continuar PASS.

---

# 41. Unit tests

Adicionar apenas os testes Clinical necessários e executar:

```bash
npm run test
```

Resultado:

```text
0 failures
```

O número poderá subir de:

```text
52
```

para mais casos.

---

# 42. Workers tests

Executar:

```bash
npm run test:workers
```

Os 13 atuais continuam PASS e novos testes são adicionados.

Nenhum deve ser substituído.

---

# 43. Architecture tests

Preservar:

```text
Operations Domain
  X
Clinical Domain
```

O novo test Clinical não deve incentivar import direto.

Operations continua conhecendo:

```text
AssessmentEligibilityPort
```

e contrato RPC.

---

# 44. Verificar D1 ownership

Mesmo que o harness use um ambiente de storage conveniente:

```text
Operations
```

não deve consultar diretamente:

```text
assessments
```

para decidir eligibility.

Fluxo sempre:

```text
Operations
→ Clinical
```

Isso preserva bounded context.

---

# 45. Não compartilhar repository Clinical

Proibido:

```text
Operations
→ D1AssessmentRepository
```

mesmo no teste.

---

# 46. Health regressions

Nos três Workers:

```text
GET /health → 200
```

e continuar sem:

```text
D1
RPC
Audit
Outbox
```

---

# 47. Dry-runs

Reexecutar:

```bash
npm run workers:dry-run
```

ou script equivalente criado no PR-11.7.

Esperado:

```text
Operations PASS
Clinical PASS
Billing PASS
```

---

# 48. `wrangler types`

Se nenhum binding mudou, talvez não haja diff.

Mesmo assim executar conforme gate existente.

---

# 49. No migration bootstrap

Não alterar isso.

Clinical não deve aplicar migration ao receber RPC.

Harness aplica migrations em setup.

Runtime produtivo apenas consome schema.

---

# 50. PII review

Nos novos testes, conferir que observabilidade Clinical não registra:

```text
assessment answers
allergies
medications
phone
email
document
```

Apenas:

```text
tenant
service
result category
eligibility
correlation
```

quando necessário.

---

# 51. Free Tier impact

Este PR deve documentar uma otimização já importante:

```text
Service requiresAssessment=false
→ Clinical invocation = 0
```

Quando true:

```text
→ 1 Clinical RPC
→ indexed Assessment lookup
```

Evitar múltiplas chamadas.

---

# 52. Query de Assessment precisa ser bounded

Não:

```text
SELECT all assessments
```

para depois ordenar em TypeScript.

Preferir:

```text
WHERE tenant
AND customer
AND service
ORDER BY performed_at DESC
LIMIT 1
```

ou query efetivamente equivalente.

---

# 53. Verificar query plan

Se o harness/D1 permitir:

```sql
EXPLAIN QUERY PLAN ...
```

confirmar uso do índice.

Não é blocker se a ferramenta não expuser facilmente, mas é desejável.

---

# 54. Não adicionar KV cache

Assessment eligibility é dado sensível e pode mudar.

Não cachear antes de política de invalidação.

---

# 55. Error mapping

Se o Clinical RPC falhar tecnicamente:

```text
AppointmentEligibility
→ BLOCKED
```

mas a futura API não deve retornar stack Cloudflare.

Preservar error contract.

---

# 56. Resultado esperado do PR

Ao final:

```text
PhysicalSafetyGate
       PASS

ClinicalPersistenceGate
       PASS

CommercialReadinessGate
       PASS

           ↓

CreateAppointmentReadiness
       PASS
```

E ainda:

```text
POST /appointments
       DOES NOT EXIST
```

Esse é o estado ideal.

---

# 57. Definition of Done — Clinical

```text
[ ] Assessment APTO inserido em D1 real do harness

[ ] Operations → Clinical → D1 → READY

[ ] Assessment NAO_APTO inserido

[ ] Operations → Clinical → D1 → BLOCKED

[ ] APTO_COM_RESTRICOES provado

[ ] valid assessment provado

[ ] expired assessment provado quando aplicável

[ ] latest-assessment selection provada

[ ] cross-tenant assessment rejeitado

[ ] cross-service assessment rejeitado

[ ] cross-customer assessment rejeitado

[ ] requiresAssessment=false evita RPC
```

---

# 58. Definition of Done — integrated eligibility

```text
[ ] Tenant ACTIVE

[ ] License operational

[ ] Plan capability available

[ ] Customer ACTIVE

[ ] Customer unrestricted

[ ] Service ACTIVE

[ ] Professional ACTIVE

[ ] Professional enabled

[ ] Assessment APTO

[ ] Availability PASS

[ ] Conflict absent

[ ] final eligibility = READY
```

E cenário de regressão:

```text
[ ] same fixture + NAO_APTO
    → BLOCKED
```

---

# 59. Definition of Done — Commercial regression

```text
[ ] Billing RPC PASS

[ ] CommercialTerms READY without discount/deposit

[ ] CommercialTerms READY with configured discount

[ ] Deposit percentage calculated after discount

[ ] 20000 - 2000 = 18000

[ ] 20% of 18000 = 3600

[ ] tenant isolation preserved

[ ] unavailable/invalid policy remains BLOCKED
```

---

# 60. Definition of Done — physical safety regression

```text
[ ] unit tests PASS

[ ] worker tests PASS

[ ] tenant isolation PASS

[ ] 100-request context isolation PASS

[ ] scheduling contention PASS

[ ] 0 double bookings

[ ] reliability PASS

[ ] idempotency replay PASS

[ ] idempotency conflict PASS

[ ] audit PASS

[ ] outbox PASS
```

---

# 61. Definition of Done — final gate

```text
[ ] npm run lint PASS

[ ] tsc --build --force PASS

[ ] npm run test PASS

[ ] npm run test:workers PASS

[ ] npm run gate:physical-safety PASS

[ ] npm run gate:create-appointment PASS

[ ] Operations dry-run PASS

[ ] Clinical dry-run PASS

[ ] Billing dry-run PASS

[ ] git diff --check PASS
```

---

# 62. Proibido neste PR

O diff não deve conter:

```text
POST /appointments

CreateAppointmentUseCase

AppointmentController create route

Payment

ConfirmDeposit
ExpireDeposit

ApproveExceptionalDiscount workflow

Session

Queue
Cron
Consumer

KV
R2
```

A única exceção seria algum contrato puramente documental necessário ao gate, não implementação funcional do próximo PR.

---

# 63. Relatório final obrigatório

Eu faria o Codex responder:

```text
PR-11.9 — Clinical Persistence Qualification + Final Appointment Readiness

Baseline
physicalSafety:
unit:
workers:

Clinical D1
APTO:
APTO_COM_RESTRICOES:
NAO_APTO:
valid:
expired:
latest:
crossTenant:
crossService:
crossCustomer:
noAssessmentRequired:

Clinical RPC
transport:
correlation:
failure:

Appointment Eligibility
fullyEligibleScenario:
unfitScenario:

Commercial Regression
Billing RPC:
noDiscountNoDeposit:
discount:
deposit:
discountPlusDeposit:

Scheduling Regression
iterations:
attempts:
successes:
conflicts:
doubleBookings:

Reliability Regression
atomicity:
replay:
conflict:
audit:
outbox:

Security/Tenant
contextIsolation:
tenantIsolation:

Quality
lint:
typecheck:
unit:
workers:
dryRuns:

gate:physical-safety:
gate:create-appointment:

CreateAppointmentReadiness:
PASS / BLOCKED

Remaining blockers:

Next PR:
```

---

# 64. Critério objetivo para liberar PR-12

Finalmente, sem mais subjetividade:

```text
PR-12_RELEASED =
    gate:physical-safety == PASS
AND ClinicalPersistenceQualification == PASS
AND FullyEligibleAppointmentScenario == READY
AND BillingRpc == PASS
AND CommercialTermsReady == true
AND gate:create-appointment == PASS
```

Se tudo isso passar:

# Próximo: PR-12 — CreateAppointment Authoritative Flow

E desta vez não há necessidade de um novo `PR-11.x`.

---

# 65. O que o PR-12 poderá então implementar

Somente após o PR-11.9:

```http
POST /tenants/:tenantId/appointments
```

com pipeline:

```text
Cloudflare HTTP Bridge
        ↓
Authentication
        ↓
Trusted Tenant
        ↓
Permission
        ↓
DTO Validation
        ↓
Idempotency-Key
        ↓
CheckAppointmentEligibility
        │
        ├── Tenant
        ├── License
        ├── Plan
        ├── Customer
        ├── Restriction
        ├── Service
        ├── Professional
        ├── Clinical Assessment
        ├── Availability
        └── Conflict
        ↓
CommercialTermsPort
        ↓
Billing Worker
        ↓
CommercialTerms READY
        ↓
UnitOfWork
        │
        ├── reserve slot
        ├── persist Appointment snapshot
        ├── Audit
        ├── Outbox
        └── Idempotency completion
        ↓
COMMIT
        ↓
201 Created
```

O ponto central agora é: **não há mais uma fundação arquitetural nova a construir. PR-11.9 deve apenas fechar a única prova física Clinical que ficou explicitamente pendente e transformar todo o histórico dos PR-05–11.8 em um gate executável que autoriza PR-12.**

Se `npm run gate:create-appointment` terminar com `exit code 0`, considero o ciclo preparatório encerrado e o próximo PR deve obrigatoriamente ser o **PR-12 — CreateAppointment Authoritative Flow**.
