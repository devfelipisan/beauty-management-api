Com o estado atual do **PR-26.3**, o próximo PR ainda não deve ativar `AppointmentCanceled` e `AppointmentNoShowRecorded`.

O bloqueio agora está muito bem definido:

```text
Snapshot V2                = IMPLEMENTADO
Versionamento financeiro   = IMPLEMENTADO
Validação VALID/STALE       = IMPLEMENTADA

Builder autoritativo       = INCOMPLETO
Deposit identity           = AUSENTE NO SNAPSHOT PRODUZIDO
Payments elegíveis         = AUSENTES
Refund allocation          = AUSENTE
Financial fingerprint      = PARCIAL
Consumers financeiros      = BLOCKED
```

Portanto, o próximo PR correto é:

# PR-26.4 — Authoritative Financial Snapshot Builder + Refund Allocation Materialization

O objetivo é fazer com que o Billing consiga construir, no momento da avaliação, uma decisão que responda de maneira inequívoca:

```text
Qual Deposit foi considerado?
Qual era sua versão?

Qual Receivable foi considerado?
Qual era sua versão?

Quais Payments estavam elegíveis?
Quanto de cada Payment ainda era reembolsável?
Quanto exatamente deve ser devolvido por Payment?

Qual valor deve virar crédito?
Qual valor deve ser retido?

Qual estado financeiro foi utilizado para tomar a decisão?
```

Só depois dessa resposta estar persistida/congelada será seguro ativar os consumers no PR seguinte.

A sequência passa a ser:

```text
PR-26.3
Snapshot V2 + validator
        ↓
PR-26.4
Authoritative Snapshot Builder
+ Refund Allocation
+ Financial Fingerprint
        ↓
FinancialDecisionReady = PASS
        ↓
PR-26.5
Financial Consumer Activation
RETURN / RETAIN / CREDIT
```

## 1. Escopo do PR-26.4

Entram:

```text
BuildFinancialDecisionSnapshot

Deposit resolution autoritativa

Receivable resolution autoritativa

Payment eligibility

PaymentRefundDecision[]

refund allocation determinística

credit allocation

retention allocation

FinancialDecisionFingerprint

snapshot structural invariants

snapshot persistence in Appointment change event

Cancellation evaluation integration

No-show evaluation integration

snapshot tests

stale tests

tenant isolation

concurrency during evaluation

readiness gate
```

Continuam fora:

```text
executar Refund

executar Credit

executar Retain

cancelar Receivable

AppointmentCanceled consumer financeiro

AppointmentNoShowRecorded consumer financeiro

automatic reconciliation

TRANSFER de Deposit
```

Essa separação é importante: o PR deve provar que sabemos **o que executar**, antes de executar dinheiro.

---

# 2. Baseline obrigatória

Executar:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr26
npm run gate:pr26.1
npm run gate:pr26.2
npm run gate:pr26.3
```

Depois:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers
npm run workers:dry-run
git diff --check
```

Registrar:

```text
FinancialSnapshotContract   = PASS
FinancialSnapshotValidation = PASS

FinancialSnapshotBuilder    = BLOCKED
FinancialDecisionReady      = BLOCKED
FinancialConsumers          = BLOCKED
```

---

# 3. Criar plano formal

Criar:

```text
docs/plans/
PR-26.4-authoritative-financial-snapshot-builder.md
```

Estrutura:

```text
Objective
Baseline

Current gap

Financial sources

Deposit resolution
Receivable resolution
Payments resolution

Refund eligibility
Refund allocation

Credit allocation
Retention allocation

Snapshot construction
Fingerprint

Cancellation integration
No-show integration

Concurrency
Tenant isolation
Idempotency

Snapshot invariants
Physical tests

Free-tier considerations

FinancialDecisionReady

Definition of Done
Out of Scope
```

---

# 4. Não resolver dinheiro pelo Appointment

Este PR deve estabelecer uma regra forte:

```text
Appointment
≠
financial source of truth
```

O Appointment pode carregar referências:

```text
depositId?
receivableId?
customerPackageId?
```

mas o estado atual desses recursos deve vir do Billing.

Não usar snapshots antigos do Appointment para decidir:

```text
deposit is confirmed
payment refundable amount
receivable outstanding
```

---

# 5. Criar `BuildFinancialDecisionSnapshot`

No Billing:

```bash
nest g service \
  appointment-change-policies/application/build-financial-decision-snapshot \
  --project billing-worker
```

Responsabilidade:

```text
request context
↓
resolve Deposit
↓
resolve Receivable
↓
resolve eligible Payments
↓
calculate refundable values
↓
evaluate dispositions
↓
freeze allocations
↓
calculate fingerprint
↓
produce FinancialDecisionSnapshotV2
```

Ele não executa mutation financeira.

---

# 6. O builder não deve receber valores financeiros do Operations

Input conceitual:

```text
tenantId
appointmentId
customerId
serviceId

cancellation/no-show context

known financial references?
correlationId
```

Não aceitar:

```text
depositAmountCents
paidAmountCents
refundAmountCents
creditAmountCents
```

do Operations.

Esses valores são derivados no Billing.

---

# 7. Primeiro resolver Deposit autoritativamente

Precisamos definir como identificar o Deposit certo.

Se o Appointment já carrega:

```text
depositId
```

usar essa identidade.

Se ainda não carrega, corrigir o contrato upstream.

Não fazer:

```sql
SELECT *
FROM deposits
WHERE appointment_id = ?
ORDER BY created_at DESC
LIMIT 1
```

como inferência silenciosa, salvo se esse relacionamento for canonicamente único e fisicamente garantido.

---

# 8. Melhor cenário

Garantir fisicamente:

```text
Appointment
0..1 active authoritative Deposit
```

com uma identidade explícita:

```text
depositId
```

---

# 9. Se `depositId` ainda não existe no Appointment

Adicionar referência, não valor.

Possível migration:

```text
0025_financial_source_references.sql
```

somente se realmente necessário.

Campo:

```text
appointments.deposit_id
```

ou equivalente na estrutura real.

Mas primeiro pesquisar:

```bash
grep -R "deposit_id" database apps libs -n
grep -R "depositId" apps libs -n
```

Não duplicar conceito existente.

---

# 10. Snapshot do Deposit

Quando existir:

```text
deposit {
  id
  status
  amountCents
  version
}
```

Quando não existir:

```text
deposit = null
```

Isso é diferente de:

```text
deposit desconhecido
```

---

# 11. Diferenciar `NONE` de `UNRESOLVED`

Esse é um detalhe importante.

Snapshot não deve confundir:

```text
Appointment sem Deposit
```

com:

```text
deveria haver Deposit, mas Billing não conseguiu resolvê-lo
```

Criar semântica clara:

```text
NONE
RESOLVED
INVALID
```

ou equivalente.

---

# 12. Receivable resolution

Mesmo princípio.

Se a Session/Appointment Standard possui Receivable:

```text
receivableId
```

precisa apontar para um recurso específico.

Não selecionar “receivable atual” por heuristic.

---

# 13. Para Package-funded Appointment

Pode legitimamente haver:

```text
receivable = null
```

para a Session.

O builder precisa saber que:

```text
settlementSource = PACKAGE
```

é motivo válido para ausência.

---

# 14. Não confundir ausência válida com inconsistência

Exemplos:

```text
PACKAGE
receivable = null
→ VALID
```

versus:

```text
STANDARD
financial settlement materialized
receivable expected
receivable = null
→ FINANCIAL_STATE_INCONSISTENT
```

---

# 15. Snapshot do Receivable

Quando existir:

```text
receivable {
  id
  status
  netAmountCents
  paidAmountCents
  outstandingAmountCents
  version
}
```

---

# 16. Não usar apenas `paidAmountCents` para refund

Isso não informa:

```text
quais Payments
quanto já foi devolvido
```

Precisamos resolver Payments individuais.

---

# 17. Criar `EligiblePaymentReader`

Port:

```bash
nest g interface \
  appointment-change-policies/ports/eligible-payment-reader \
  --project billing-worker
```

Pode ter operação:

```text
findRefundableByReceivable(...)
```

tenant-aware e bounded.

---

# 18. Não carregar todos os Payments históricos do cliente

Somente:

```text
Payments daquele Receivable
```

e, idealmente:

```text
status financeiro compatível
amount - refundedAmount > 0
```

---

# 19. Query bounded

Algo como:

```sql
WHERE tenant_id = ?
  AND receivable_id = ?
  AND amount_cents > refunded_amount_cents
```

Com índice adequado.

---

# 20. Snapshot de Payment

Para cada Payment elegível:

```text
PaymentRefundDecision {
  paymentId
  paymentVersion

  paymentAmountCents
  refundedAmountCents

  refundableAmountCents

  refundAmountCents
}
```

Os dois últimos não são necessariamente iguais.

---

# 21. `refundableAmountCents`

É:

```text
payment.amount
-
payment.refundedAmount
```

na avaliação.

---

# 22. `refundAmountCents`

É quanto a policy decidiu devolver daquele Payment.

Essa diferença é essencial.

---

# 23. Exemplo

Payment:

```text
amount = 10.000
alreadyRefunded = 2.000

refundable = 8.000
```

Policy:

```text
refund only 5.000
```

Snapshot:

```text
refundableAmount = 8.000
refundAmount = 5.000
```

---

# 24. Não recalcular essa distribuição no consumer

O consumer futuro executará:

```text
P1 → 5.000
```

não:

```text
total refund = 5.000
→ discover where to take it from
```

---

# 25. Definir algoritmo de allocation

Quando policy diz:

```text
refund payments = 7.000
```

e existem:

```text
P1 refundable = 4.000
P2 refundable = 5.000
```

precisamos congelar:

```text
P1 = ?
P2 = ?
```

---

# 26. Não deixar essa ordem arbitrária

Definir regra determinística.

Minha recomendação para MVP:

```text
FIFO by receivedAt, then paymentId
```

ou:

```text
LIFO
```

somente se a documentação financeira indicar isso.

Se não há regra normativa, não escolha silenciosamente.

---

# 27. Melhor alternativa quando não há regra

A policy pode dizer:

```text
refund ALL eligible payments
```

e não um valor parcial agregado.

Nesse caso:

```text
refundAmount = refundableAmount
```

por Payment.

É muito menos ambíguo.

---

# 28. Se partial refund total é necessário

Documentar explicitamente a allocation rule no ADR/plano.

Não esconder num loop.

---

# 29. Criar `RefundAllocationPolicy`

Pode ser pure domain/application helper:

```text
allocate(
  requestedRefund,
  eligiblePayments
)
```

Sem D1/Nest.

---

# 30. Invariantes

Obrigatórias:

```text
refundAmount >= 0

refundAmount <= refundableAmount

sum(refundAmount)
<=
sum(refundableAmount)
```

e:

```text
sum allocated = requested refund
```

quando READY.

---

# 31. Se não é possível alocar

Resultado:

```text
BLOCKED
INSUFFICIENT_REFUNDABLE_AMOUNT
```

Não diminuir valor silenciosamente.

---

# 32. Credit allocation

Mesmo princípio.

Se policy quer:

```text
CONVERT_TO_CREDIT
```

precisamos saber a origem do valor.

Pode vir de:

```text
Deposit
Payments
```

O snapshot precisa declarar componentes.

---

# 33. Criar `CreditDecision`

Algo como:

```text
credit {
  amountCents

  sources: [
    {
      sourceType
      sourceId
      amountCents
      version
    }
  ]
}
```

Isso permite auditoria e deduplication futura.

---

# 34. Não criar crédito maior que dinheiro elegível

Invariante:

```text
creditAmount
<=
eligible refundable/convertible amount
```

---

# 35. Retention decision

Também precisa de identidade.

Exemplo:

```text
retain {
  depositId
  amountCents
  depositVersion
}
```

Não apenas:

```text
depositDisposition=RETAIN
```

---

# 36. Para Payment `RETAIN`

Talvez nenhuma mutation seja necessária, porque o dinheiro já está recebido.

O snapshot pode registrar:

```text
paymentDisposition = RETAIN
```

para explicar por que não houve refund.

Mas não precisa criar um novo movimento monetário.

---

# 37. Separar `effect` de `explanation`

Exemplo:

```text
Payment retained
```

pode ser apenas decisão histórica.

```text
Deposit CONFIRMED → RETAINED
```

é mutation de lifecycle.

---

# 38. Builder de Cancellation

`EvaluateCancellationFinancials` atual deve virar algo próximo de:

```text
load policy
↓
build authoritative financial state
↓
policy evaluates state
↓
create allocations
↓
freeze snapshot
↓
return READY(snapshot)
```

---

# 39. Builder de No-show

Mesma infraestrutura:

```text
BuildFinancialDecisionSnapshot
```

com policy diferente.

Não duplicar resolução de Payments/Deposit.

---

# 40. Snapshot precisa ser imutável

Depois que Operations recebe:

```text
READY + snapshot
```

e grava `AppointmentCanceled`/`AppointmentNoShowRecorded`, o payload não muda.

---

# 41. Persistir snapshot no fato operacional

Pode estar:

```text
appointment change history
```

e/ou:

```text
outbox payload
```

O importante é que redelivery preserve exatamente o mesmo snapshot.

---

# 42. Não reconstruir snapshot no retry HTTP

Idempotency replay de:

```text
POST /cancel
```

deve devolver o snapshot/result original.

Não chamar Billing novamente.

---

# 43. Esse é teste obrigatório

Primeiro cancel:

```text
Billing decision V2 snapshot A
```

Depois estado financeiro muda.

Replay da mesma `Idempotency-Key`:

```text
must return original cancellation result
```

não reevaluar e gerar snapshot B.

---

# 44. Financial fingerprint

Agora o builder pode construir fingerprint completo.

Conteúdo canônico:

```text
policy id/version

deposit:
  id/status/amount/version

receivable:
  id/status/amounts/version

payments sorted:
  id/version/amount/refunded/refundable/refund allocation

credit allocation

retain allocation
```

---

# 45. Não colocar disposition textual duplicada inconsistentemente

O canonical document usado no hash deve ser derivado do snapshot final.

---

# 46. Criar helper

Por exemplo:

```text
FinancialSnapshotFingerprint
```

pure function.

---

# 47. Teste determinismo

Mesmo estado financeiro:

```text
builder call 1
builder call 2
```

produz:

```text
same logical snapshot
same fingerprint
```

ignorando IDs do request/correlation.

---

# 48. Mudança de Payment

Qualquer mudança relevante:

```text
refundedAmount
version
```

deve mudar fingerprint.

---

# 49. Mudança irrelevante

Por exemplo metadata que não afeta decisão:

```text
note
```

não deve mudar fingerprint.

Isso reduz falso stale.

---

# 50. Versão do Payment

O relatório anterior não confirmou versionamento explícito do Payment.

Agora precisamos decidir.

Se Payment possui:

```text
refunded_amount_cents
```

que muda no refund, o snapshot precisa detectar isso.

---

# 51. Adicionar `payments.version`

Se ainda não existe.

Migration `0025` ou próximo número real:

```text
ALTER TABLE payments
ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
```

e todo refund:

```text
version = version + 1
```

---

# 52. Essa mudança precisa alcançar `IssueRefund`

O CAS passa a atualizar:

```text
refunded_amount_cents
version
```

atomicamente.

---

# 53. Não alterar version em read-only operações

Só mutation financeira relevante.

---

# 54. PaymentSnapshotVersion é essencial para stale detection

Sem ela, teríamos que depender só de:

```text
refundedAmount
```

que funciona parcialmente, mas version deixa a semântica mais consistente.

---

# 55. Criar `FinancialStateReader`

Pode ser útil agrupar:

```text
Deposit
Receivable
Payments
```

num port/application query.

Mas não crie repository god object.

Uma opção:

```text
FinancialDecisionStateReader
```

específico para este use case.

---

# 56. Ele pode retornar

```text
FinancialDecisionState {
  deposit?
  receivable?
  refundablePayments[]
}
```

Esse é um read model, não domínio compartilhado.

---

# 57. Tenant isolation

Toda resolução precisa usar:

```text
tenant + id
```

Não:

```text
findById(id)
```

sozinho.

---

# 58. Customer consistency

Payment:

```text
Payment.customerId
```

deve corresponder ao Appointment/Receivable Customer.

Se não:

```text
FINANCIAL_STATE_INCONSISTENT
```

---

# 59. Receivable consistency

Payment precisa pertencer:

```text
receivableId
```

exato.

Não apenas ao mesmo Customer.

---

# 60. Deposit consistency

Deposit precisa pertencer ao mesmo:

```text
tenant
appointment/customer
```

conforme modelo.

---

# 61. Package-funded cancellation

Se:

```text
settlementSource = PACKAGE
```

não deve aparecer Receivable de Session arbitrariamente.

Pode ainda existir Deposit?

Depende das regras comerciais.

Builder deve respeitar os recursos reais, não assumir.

---

# 62. Sem dinheiro

Appointment:

```text
deposit=null
receivable=null
payments=[]
```

pode produzir:

```text
READY
financial effects NONE
```

se policy permitir.

---

# 63. Isso evita bloquear cancelamento gratuito

Não exigir recursos financeiros inexistentes quando não necessários.

---

# 64. Snapshot completeness depende da disposition

Exemplo:

```text
depositDisposition = NONE
```

não exige `depositId`.

Mas:

```text
depositDisposition = RETURN
```

exige.

---

# 65. Criar `FinancialSnapshotInvariantPolicy`

Pure validation:

```text
validateStructure(snapshot)
```

antes de retornar READY.

---

# 66. Invariantes para RETURN

```text
exact source IDs present

positive amounts

amounts <= refundable

versions present
```

---

# 67. Para CREDIT

```text
sources explicit
total equals source components
versions present
```

---

# 68. Para RETAIN

```text
deposit identity/version required
```

quando retenção de Deposit.

---

# 69. Para Receivable cancellation

```text
receivable identity/version required
```

---

# 70. `READY` nunca pode carregar snapshot incompleto

Esse deve ser um princípio global.

Ou:

```text
READY + executable snapshot
```

ou:

```text
BLOCKED
```

Nunca:

```text
READY but consumer has to discover missing data
```

---

# 71. Essa é a Definition of Authority do PR

Formalizar:

```text
ConsumerNeedsFinancialInference = false
```

---

# 72. Testes unitários do builder

Criar arquivo:

```text
build-financial-decision-snapshot.spec.ts
```

Cenários:

```text
no financial resources
deposit only
receivable no payment
one payment
multiple payments
partial prior refund
full prior refund
credit decision
retain decision
tenant mismatch
inconsistent receivable/payment
```

---

# 73. Teste Deposit RETURN

```text
Deposit:
CONFIRMED
amount=3000
version=4
```

Snapshot:

```text
id exact
amount=3000
version=4
RETURN
```

---

# 74. Teste Payment partial refund

```text
P1:
amount=10000
refunded=3000
version=2
```

Policy refund:

```text
5000
```

Snapshot:

```text
refundable=7000
refund=5000
version=2
```

---

# 75. Teste múltiplos Payments

Validar order determinística.

---

# 76. Teste Payment fully refunded

Não deve entrar como elegível:

```text
refundable=0
```

---

# 77. Teste over-refund solicitado

Policy demanda:

```text
12000
```

mas total refundable:

```text
10000
```

Resultado:

```text
BLOCKED
INSUFFICIENT_REFUNDABLE_AMOUNT
```

---

# 78. Não truncar para 10000

Importante.

---

# 79. Teste credit amount superior às sources

`BLOCKED`.

---

# 80. Teste fingerprint

Adicionar suite:

```text
financial-snapshot-fingerprint.spec.ts
```

---

# 81. Teste builder físico com D1

Criar:

```text
test/workers/financial-decision-builder.spec.ts
```

Usando:

```text
workerd
D1 real
```

---

# 82. Provar que builder lê estado atual real

Fixture:

```text
Deposit version 1
Receivable version 2
Payment version 3
```

Snapshot deve refletir exatamente.

---

# 83. Depois modificar Payment

Executar `IssueRefund`.

Novo builder:

```text
Payment version 4
refundable changed
fingerprint changed
```

---

# 84. Concorrência de build vs refund

Duas operações:

```text
Build snapshot
IssueRefund
```

podem acontecer em paralelo.

Não precisamos fazer builder bloquear mutation.

O resultado será:

```text
snapshot before or after mutation
```

e validator futuro detectará stale se necessário.

---

# 85. Isso é aceitável

Builder é:

```text
read snapshot
```

não reservation.

O sistema depende de:

```text
snapshot + later version validation + CAS
```

---

# 86. Não tentar lock read state cross-request

Isso aumentaria complexidade desnecessariamente.

---

# 87. Cancellation evaluation E2E

Criar teste:

```text
test/workers/cancellation-financial-snapshot.spec.ts
```

Fluxo:

```text
financial resources prepared
↓
POST cancel
↓
Billing evaluate
↓
Operations persists AppointmentCanceled
```

Inspecionar Outbox payload.

Assert:

```text
depositId present when required
receivableId present when required
payments explicit
versions present
allocations explicit
fingerprint present
```

---

# 88. Não entregar ao consumer ainda

O teste pode parar antes da delivery financeira.

Neste PR consumers continuam blocked.

Isso é proposital.

---

# 89. No-show snapshot E2E

Mesmo.

---

# 90. Idempotency replay do cancel

Primeiro cancel:

```text
snapshot fingerprint F1
```

Depois mudar Payment.

Replay same key:

```text
returns original result/F1
```

Não:

```text
new decision F2
```

---

# 91. Novo cancellation attempt depois de canceled

Deve seguir FSM/idempotency atual.

Não reevaluar financeiro.

---

# 92. Policy versioning

Testar:

```text
evaluate using Policy v1
```

Depois policy v2 ativa.

Snapshot continua:

```text
policyVersion=v1
```

---

# 93. Fingerprint inclui policy version

Assim a decisão histórica fica explicável.

---

# 94. Não incluir policy record inteiro

Apenas:

```text
policyId/version
```

e decisão congelada.

---

# 95. Migration física

Possivelmente `0025`.

Elementos possíveis:

```text
payments.version

appointment/deposit reference if missing

unique/index changes
```

Não adicionar tabela só porque PR tem número.

---

# 96. Query indexes

Validar:

```text
payments:
tenant_id + receivable_id

deposit:
tenant_id + id

receivable:
tenant_id + id
```

Já devem ser eficientes.

---

# 97. `EXPLAIN QUERY PLAN`

No worker/test harness, verificar queries do builder.

O cancelamento não pode fazer:

```text
scan all customer payments
```

---

# 98. Free Tier

Esperado por evaluation:

```text
1 Deposit lookup
1 Receivable lookup
1 bounded Payments query
1 policy lookup
```

Isso é adequado.

Evitar:

```text
ledger replay scan
```

para reconstruir saldos.

---

# 99. Ledger não deve ser lido para cada cancelamento

As projections:

```text
Deposit
Receivable
Payment.refundedAmount
```

existem justamente para evitar isso.

Ledger continua historical source/evidence.

---

# 100. Não usar KV cache

Estado financeiro precisa ser strongly authoritative no D1.

---

# 101. Não usar Queue

Nenhuma necessidade.

---

# 102. Criar script de builder

```bash
npm run test:financial-decision-builder
```

---

# 103. Criar script de snapshot allocation

```bash
npm run test:financial-refund-allocation
```

---

# 104. Gate `financial-decision-authority`

Criar:

```bash
npm run gate:financial-decision-authority
```

Inclui:

```text
snapshot builder
allocation
fingerprint
tenant isolation
physical D1 builder
cancellation snapshot E2E
no-show snapshot E2E
idempotency replay
```

---

# 105. Gate PR

```bash
npm run gate:pr26.4
```

Idealmente:

```text
gate:pr26.3
+
gate:financial-decision-authority
+
dry-runs
```

---

# 106. Criar readiness formal

Atualizar `appointment-change-readiness.md` com um gate intermediário:

```text
FinancialDecisionReady
```

---

# 107. Matriz esperada

```text
Snapshot V2                      PASS
Deposit Identity                 PASS
Deposit Version                  PASS

Receivable Identity              PASS
Receivable Version               PASS

Eligible Payments                PASS
Payment Version                  PASS
Refundable Amount                PASS

Refund Allocation                PASS
Credit Allocation                PASS
Retention Source                 PASS

Deterministic Fingerprint        PASS

Tenant Validation                PASS
Customer Validation              PASS
Receivable/Payment Consistency   PASS

Cancellation Snapshot            PASS
NoShow Snapshot                  PASS

Replay Snapshot Stability        PASS

ConsumerNeedsInference           FALSE

FinancialDecisionReady           PASS

FinancialConsumers               BLOCKED
AppointmentChangeReady           BLOCKED
```

É importante manter os dois últimos bloqueados até o PR seguinte.

---

# 108. Definition of Done — Deposit

```text
[ ] explicit depositId

[ ] status snapshot

[ ] amount snapshot

[ ] version snapshot

[ ] tenant/customer consistency

[ ] no latest-deposit inference
```

---

# 109. Definition of Done — Receivable

```text
[ ] explicit receivableId

[ ] status snapshot

[ ] paid/outstanding snapshot

[ ] version snapshot

[ ] absence valid for PACKAGE where applicable

[ ] missing STANDARD receivable detected when required
```

---

# 110. Definition of Done — Payments

```text
[ ] explicit Payment IDs

[ ] Payment version

[ ] amount

[ ] already refunded

[ ] refundable amount

[ ] exact refund allocation

[ ] tenant/receivable/customer validation

[ ] fully-refunded Payments excluded
```

---

# 111. Definition of Done — Refund allocation

```text
[ ] deterministic

[ ] no negative allocation

[ ] no allocation > refundable

[ ] sum allocations = requested refund

[ ] insufficient refundable total → BLOCKED

[ ] consumer will not have to decide distribution
```

---

# 112. Definition of Done — Credit

```text
[ ] exact amount

[ ] exact sources

[ ] source versions

[ ] amount equals source components

[ ] no credit created from unknown money
```

---

# 113. Definition of Done — Retain

```text
[ ] financial source explicit

[ ] Deposit ID/version when retaining Deposit

[ ] no inferred retain target
```

---

# 114. Definition of Done — Fingerprint

```text
[ ] deterministic canonical representation

[ ] policy version included

[ ] Deposit state included

[ ] Receivable state included

[ ] Payment allocations included

[ ] relevant mutation changes fingerprint

[ ] irrelevant metadata does not change fingerprint
```

---

# 115. Definition of Done — Cancellation

```text
[ ] EvaluateCancellationFinancials uses builder

[ ] READY only with executable snapshot

[ ] BLOCKED on incomplete snapshot

[ ] AppointmentCanceled contains full snapshot

[ ] retry does not rebuild snapshot
```

---

# 116. Definition of Done — No-show

```text
[ ] EvaluateNoShowFinancials uses same authoritative builder

[ ] decision policy differs without duplicating financial-state loading

[ ] READY only with executable snapshot

[ ] AppointmentNoShowRecorded contains full snapshot
```

---

# 117. Definition of Done — Validation

O validator do PR-26.3 deve agora conseguir operar sem inferência:

```text
[ ] current Deposit loaded by snapshot ID

[ ] current Receivable loaded by snapshot ID

[ ] Payments loaded by snapshot IDs

[ ] version mismatch → STALE

[ ] refundable mismatch → STALE

[ ] tenant mismatch → INVALID

[ ] missing required source → INVALID
```

---

# 118. Definition of Done — Replay

```text
[ ] same cancel Idempotency-Key returns original snapshot

[ ] state change after cancellation does not rebuild snapshot

[ ] same no-show key does not rebuild snapshot
```

---

# 119. Definition of Done — Security

```text
[ ] Operations cannot choose refund amount

[ ] Operations cannot choose eligible Payment IDs

[ ] caller cannot choose Deposit ID arbitrarily without domain validation

[ ] every financial entity tenant-scoped

[ ] no sensitive Payment metadata in snapshot
```

---

# 120. Definition of Done — Free Tier

```text
[ ] bounded Deposit query

[ ] bounded Receivable query

[ ] indexed Payments query

[ ] no Ledger full scan

[ ] no KV

[ ] no R2

[ ] no Queue

[ ] no Cron
```

---

# 121. Regression obrigatória

```text
PR24 PASS
PR25 PASS
PR26 PASS
PR26.1 PASS
PR26.2 PASS
PR26.3 PASS

Payment concurrency PASS
Refund concurrency PASS
PackageReadyForPayment PASS
```

---

# 122. Comandos finais

```bash
npm run lint
npx tsc --build --force

npm run test
npm run test:workers

npm run test:financial-decision-builder
npm run test:financial-refund-allocation
npm run test:financial-decision-snapshot

npm run gate:pr26.3
npm run gate:financial-decision-authority
npm run gate:pr26.4

npm run workers:dry-run
git diff --check
```

Resultado:

```text
PASS
```

---

# 123. Relatório pós-implementação esperado

O Codex deve produzir algo próximo de:

```text
PR-26.4 — Authoritative Financial Snapshot Builder

Baseline
PR26.3:

Financial Sources
deposit resolution:
receivable resolution:
payments resolution:

Deposit Snapshot
id:
status:
amount:
version:

Receivable Snapshot
id:
status:
paid:
outstanding:
version:

Payments
eligible count:
fully refunded excluded:
versions:
refundable values:

Refund Allocation
requested:
available:
allocation strategy:
payment allocations:
sum:

Credit Allocation
amount:
sources:
versions:

Retain
source:
deposit:

Fingerprint
algorithm:
canonicalization:
policy version:
determinism:
mutation detection:

Cancellation Evaluation
builder:
READY completeness:
snapshot persistence:
replay stability:

No-show Evaluation
builder:
READY completeness:
snapshot persistence:

Physical D1
deposit query:
receivable query:
payment query:
query plans:

Tenant Isolation
deposit:
receivable:
payments:

Validation Compatibility
VALID:
STALE deposit:
STALE receivable:
STALE payment:
INVALID:

Security
caller financial inputs:
PII:
financial inference:

Free Tier
D1 reads:
Ledger scans:
KV:
R2:
Queue:
Cron:

FinancialDecisionReady:

FinancialConsumers:
AppointmentChangeReady:

Regression
PR24:
PR25:
PR26:
PR26.1:
PR26.2:
PR26.3:

Quality
unit:
workers:
builder:
allocation:
snapshot:
lint:
typecheck:
dry-runs:
PR26.4 gate:

Remaining blockers:

Next PR:
```

# Próximo PR depois do PR-26.4

Se o resultado for:

```text
FinancialDecisionReady = PASS
```

o próximo PR passa a ser finalmente:

# PR-26.5 — Financial Consumer Activation + RETURN / RETAIN / CREDIT Qualification

Aí sim teremos informação suficiente para:

```text
AppointmentCanceled
        ↓
validate snapshot
        ↓
RETURN
RETAIN
CREDIT
        ↓
Refund / Internal Credit / Deposit lifecycle
        ↓
Ledger
        ↓
Audit
        ↓
Outbox
```

e para provar fisicamente:

```text
stale decision
CAS conflict
multi-Payment refund
ACK-loss
replay
financial UoW
```

Sem o PR-26.4, ativar esses consumers ainda faria exatamente aquilo que o projeto vem evitando corretamente desde o início: **descobrir dinheiro no momento da execução usando heurísticas**.

Portanto, o próximo passo correto é **PR-26.4 — Authoritative Financial Snapshot Builder + Refund Allocation Materialization**. O projeto já sabe validar um snapshot; agora precisa aprender a construir um snapshot que seja completo o suficiente para que o próximo consumer apenas execute uma decisão congelada, sem consultar “qual depósito?”, “qual pagamento?” ou “quanto devolver?” por conta própria.
