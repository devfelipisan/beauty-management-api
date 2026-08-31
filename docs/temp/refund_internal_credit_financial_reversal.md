Com a fundação do **PR-24 concluída** e os gates financeiros básicos passando, o próximo passo correto é fechar as capacidades que foram deliberadamente deixadas fora, mas que são necessárias para tornar o financeiro realmente reversível e consistente.

O próximo PR deve ser:

# PR-25 — Refund + Internal Credit + Financial Reversal

O objetivo é sair de:

```text
Receivable
  ├── OPEN
  ├── PARTIALLY_PAID
  └── PAID

Payment
  └── confirmed receipt

Ledger
  └── append-only positive movements
```

para:

```text
Receivable
    │
    ├── payments
    ├── refunds
    ├── credits
    └── reversals
            │
            ▼
      Append-only Ledger
            │
            ├── PAYMENT_RECEIVED
            ├── REFUND_ISSUED
            ├── CREDIT_GRANTED
            └── CREDIT_APPLIED
```

A regra central deve ser:

```text
pagamento confirmado
≠ deletar depois
```

Correção financeira deve acontecer por **movimentos compensatórios**, nunca por exclusão ou reescrita do histórico.

---

# 1. Baseline obrigatória

Antes de qualquer alteração:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr23.3
npm run gate:financial-foundation
npm run gate:pr24
```

Depois:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers
npm run test:payment-concurrency
npm run workers:dry-run
git diff --check
```

Tudo precisa permanecer:

```text
PASS
```

Registrar:

```text
FinancialFoundationReady = PASS
```

como baseline.

---

# 2. Criar o plano formal

Criar:

```text
docs/plans/PR-25-refund-internal-credit-financial-reversal.md
```

Com:

```text
Objective
Scope

Refund
Financial reversal
Internal credit
Credit application

Ledger semantics
Receivable impact

Idempotency
Concurrency
Atomicity

Payment traceability
Tenant isolation
Permissions

Outbox
Customer timeline

Free-tier impact

Definition of Done
Out of scope
```

---

# 3. Não alterar o princípio do Ledger

O PR-24 estabeleceu:

```text
LedgerMovement = append-only
```

PR-25 deve reforçar isso.

Proibido:

```sql
DELETE FROM payments
```

ou:

```sql
UPDATE ledger_movements
SET amount = ...
```

para corrigir histórico.

A correção sempre vira outro fato.

---

# 4. Separar conceitos

Não tratar tudo como “refund”.

Precisamos distinguir:

```text
Refund
= devolução financeira de valor recebido

InternalCredit
= valor que fica disponível ao cliente no sistema

LedgerReversal
= movimento contábil compensatório
```

---

# 5. Criar módulo Refunds

```bash
nest g module refunds \
  --project billing-worker
```

Estrutura:

```text
refunds/
├── domain/
├── application/
├── ports/
└── adapters/
```

---

# 6. Criar agregado `Refund`

```bash
nest g class \
  refunds/domain/refund \
  --project billing-worker \
  --no-spec
```

Campos mínimos:

```text
id
tenantId

paymentId
receivableId
customerId

amountCents

reasonCode?
notes?

status

refundedAt
refundedBy

createdAt
```

---

# 7. Refund deve referenciar Payment real

Não permitir:

```text
refund arbitrário
```

sem origem.

Obrigatório:

```text
paymentId
```

e:

```text
receivableId
```

coerente.

---

# 8. Status simples

Como o MVP registra o fato financeiro e não integra gateway real ainda, um modelo simples pode ser:

```text
CONFIRMED
```

Se houver necessidade futura:

```text
PENDING
FAILED
```

virão depois.

Não inventar workflow de adquirente.

---

# 9. Refund parcial

Permitir:

```text
payment = 10000
refund = 4000
```

desde que:

```text
sum(refunds for payment) <= payment.amount
```

---

# 10. Refund integral

Também:

```text
payment 10000
refund 10000
```

---

# 11. Nunca permitir refund maior que valor disponível

A regra deve considerar:

```text
paymentAmount
-
alreadyRefundedAmount
```

Então:

```text
availableToRefund >= requestedRefund
```

---

# 12. Não verificar isso só em memória

Precisa de proteção concorrente real.

Dois refunds simultâneos:

```text
Payment 10000

Refund A 7000
Refund B 7000
```

não podem totalizar:

```text
14000
```

---

# 13. Criar projection de `refundedAmountCents`

Pode estar:

```text
payments.refunded_amount_cents
```

ou em read model derivado.

Eu recomendo projection no Payment para CAS eficiente:

```text
0 <= refundedAmount <= amount
```

---

# 14. CAS para Refund

Conceitualmente:

```sql
UPDATE payments
SET refunded_amount_cents =
    refunded_amount_cents + ?
WHERE tenant_id = ?
  AND id = ?
  AND amount_cents - refunded_amount_cents >= ?
```

`changes=1`.

---

# 15. Refund não significa necessariamente reabrir Receivable

Esse é um ponto importante.

Se:

```text
Receivable PAID
↓
Refund
```

precisamos decidir se o cliente:

```text
volta a dever
```

ou se:

```text
a obrigação permanece quitada
e a empresa devolveu dinheiro
```

São cenários diferentes.

---

# 16. Portanto criar `RefundEffectPolicy`

Não inferir automaticamente:

```text
Refund → Receivable OPEN
```

Para este PR, recomendo:

```text
Refund
= saída financeira
= não recria dívida automaticamente
```

A menos que exista regra explícita de cancelamento/reabertura.

Assim:

```text
Receivable permanece com seu histórico de liquidação
```

e o Ledger explica a devolução.

---

# 17. Isso prepara PR-26

No PR de:

```text
Cancellation / No-show / Rescheduling
```

aí haverá regras específicas dizendo:

```text
refund
credit
retain deposit
reopen obligation
```

PR-25 só cria as primitives.

---

# 18. Criar tipos de Ledger

Adicionar:

```text
REFUND_ISSUED
```

E, para crédito:

```text
CREDIT_GRANTED
CREDIT_APPLIED
```

Não reutilizar:

```text
PAYMENT_RECEIVED
```

com amount negativo.

Prefiro manter:

```text
type + direction
```

explícitos.

---

# 19. Direção financeira

Se `LedgerMovement` já possui:

```text
direction
```

usar algo como:

```text
CREDIT / DEBIT
```

ou semântica consolidada atual.

Não criar segunda nomenclatura concorrente.

---

# 20. Refund é append-only

Refund confirmado cria:

```text
Refund
+
LedgerMovement REFUND_ISSUED
+
Audit
+
Outbox RefundIssued
+
Idempotency
```

na mesma UnitOfWork.

---

# 21. Criar `IssueRefund`

```bash
nest g service \
  refunds/application/issue-refund \
  --project billing-worker
```

Input:

```text
tenantId
paymentId
amountCents
reason?
executionContext
idempotencyKey
```

Não aceitar:

```text
refundedBy
refundedAt
receivableId arbitrary
```

se puder ser derivado do Payment.

---

# 22. Endpoint

```http
POST /tenants/:tenantId/payments/:paymentId/refunds
```

Headers:

```text
Idempotency-Key
```

---

# 23. Permission

Algo equivalente a:

```text
refund.create
```

ou:

```text
payment.refund
```

Reutilizar padrão real se existir.

---

# 24. Auditoria

Registrar:

```text
RefundIssued
```

Metadata:

```text
paymentId
receivableId
refundId
amountCents
reasonCode
actorId
```

Sem dados pessoais excessivos.

---

# 25. Não deletar Payment

Depois do Refund:

```text
Payment CONFIRMED
```

continua no histórico.

Refund é outro registro.

---

# 26. Criar Outbox `RefundIssued`

Billing → Operations.

Payload mínimo:

```text
eventId
tenantId
customerId
paymentId
refundId
receivableId
amountCents
refundedAt
correlationId
```

---

# 27. Timeline Operations

Criar:

```text
REFUND_ISSUED
```

idempotentemente.

Não editar:

```text
PAYMENT_RECEIVED
```

anterior.

Timeline deve mostrar os dois fatos:

```text
PAYMENT_RECEIVED
REFUND_ISSUED
```

---

# 28. Agora Internal Credit

Criar módulo:

```bash
nest g module credits \
  --project billing-worker
```

---

# 29. Criar `CustomerCreditAccount`

Pode ser um agregado/projection:

```text
tenantId
customerId
availableAmountCents
updatedAt
```

Mas o histórico real precisa estar no Ledger.

---

# 30. Não usar apenas `customer.creditBalance`

Sem movimentos.

Precisamos de:

```text
CreditMovement
```

ou reaproveitar `LedgerMovement` com tipos específicos.

Eu prefiro reaproveitar Ledger:

```text
CREDIT_GRANTED
CREDIT_APPLIED
```

e manter uma projection:

```text
customer_credit_balances
```

para leitura/CAS.

---

# 31. Criar `InternalCredit`

Se quiser domínio explícito:

```bash
nest g class \
  credits/domain/internal-credit-account \
  --project billing-worker \
  --no-spec
```

Campos:

```text
tenantId
customerId
availableAmountCents
```

---

# 32. Saldo nunca negativo

Assim como package/payment:

```text
availableAmountCents >= 0
```

sempre.

---

# 33. Criar `GrantInternalCredit`

```bash
nest g service \
  credits/application/grant-internal-credit \
  --project billing-worker
```

Mas esse comando não deve ser livre para qualquer usuário.

Pode ser usado por:

```text
RefundToCredit
```

ou autorização financeira explícita.

---

# 34. Não criar “dinheiro grátis” sem origem

Todo `CREDIT_GRANTED` precisa de:

```text
sourceType
sourceId
```

Por exemplo:

```text
REFUND
MANUAL_AUTHORIZED_ADJUSTMENT
```

Se manual adjustment não está no escopo, não expor.

---

# 35. Melhor fluxo neste PR

Implementar:

```text
Refund → CASH/ORIGINAL_METHOD
```

e opcionalmente:

```text
Refund → INTERNAL_CREDIT
```

como escolha explícita.

---

# 36. Talvez separar `RefundMode`

Conceitualmente:

```text
RETURN_FUNDS
INTERNAL_CREDIT
```

Mas isso precisa estar claro.

---

# 37. Minha recomendação

Não misturar `Refund` e `Credit` semanticamente.

Criar dois comandos:

```text
IssueRefund
GrantCreditFromPayment
```

ou:

```text
ConvertRefundToInternalCredit
```

Mas sem gateway real, pode ser mais simples:

```text
RefundDestination:
EXTERNAL
INTERNAL_CREDIT
```

Se a documentação permitir.

---

# 38. Não inventar destination sem regra

Se ainda não existe contrato normativo suficiente, implemente:

```text
IssueRefund
GrantInternalCredit
```

separadamente.

---

# 39. Aplicação de crédito em Receivable

Agora finalmente podemos habilitar:

```text
INTERNAL_CREDIT
```

como método financeiro real.

Mas não modelá-lo como um `Payment` comum sem pensar.

---

# 40. Credit application

Quando cliente usa saldo interno:

```text
CustomerCreditAccount
↓ decrement
Receivable
↓ outstanding decrement
Ledger
├── CREDIT_APPLIED
```

Pode também criar um Payment lógico com:

```text
method=INTERNAL_CREDIT
```

para uniformizar histórico.

---

# 41. Eu recomendo criar Payment com `INTERNAL_CREDIT`

Porque a regra de pagamento já reconhece esse método.

Fluxo:

```text
RegisterPayment(method=INTERNAL_CREDIT)
↓
validate credit balance
↓
atomic:
  credit balance decrement
  Receivable decrement
  Payment insert
  Ledger CREDIT_APPLIED
  Audit
  Outbox
```

---

# 42. Não criar `PAYMENT_RECEIVED` e `CREDIT_APPLIED` duplicando valor

Definir claramente:

Para internal credit:

```text
Payment(method=INTERNAL_CREDIT)
```

existe como registro funcional.

Ledger movement pode ser:

```text
CREDIT_APPLIED
```

e não:

```text
PAYMENT_RECEIVED
+
CREDIT_APPLIED
```

para o mesmo valor, a menos que Ledger modele dupla entrada — o que ainda não existe.

Evitar double-counting.

---

# 43. External methods continuam `PAYMENT_RECEIVED`

```text
CASH
PIX
DEBIT_CARD
CREDIT_CARD
TRANSFER
```

---

# 44. Internal credit CAS

Exemplo:

```text
credit balance = 10000
```

Dois Receivables tentam usar:

```text
7000 + 7000
```

concorrentemente.

Resultado:

```text
one success
one blocked
remaining credit = 3000
```

Nunca negativo.

---

# 45. Multi-resource atomicity

Aqui teremos:

```text
CustomerCreditAccount
+
Receivable
+
Payment
+
Ledger
+
Audit
+
Outbox
+
Idempotency
```

no mesmo Billing D1.

Isso é uma boa prova da `D1UnitOfWork` corrigida no PR-24.

---

# 46. Criar payment path específico

No `RegisterPayment`:

```text
method != INTERNAL_CREDIT
→ current path

method = INTERNAL_CREDIT
→ InternalCreditPaymentStrategy
```

Sem `if` gigante se puder evitar.

---

# 47. Ports

Pode criar:

```text
InternalCreditRepository
```

ou:

```text
CustomerCreditBalanceRepository
```

tenant-aware.

---

# 48. Migration `0020`

Se `0019` foi a última:

```text
0020_refund_internal_credit_financial_reversal.sql
```

Tabelas/alterações:

```text
refunds

customer_credit_balances
```

Possivelmente adicionar:

```text
payments.refunded_amount_cents
```

se não existir.

---

# 49. Constraints

`refunds`:

```text
amount_cents > 0
```

`payments`:

```text
refunded_amount_cents >= 0
refunded_amount_cents <= amount_cents
```

`customer_credit_balances`:

```text
available_amount_cents >= 0
```

---

# 50. Unique business identities

Refund:

```text
Idempotency-Key
```

mais, quando houver uma referência externa, proteção adequada.

Não impedir múltiplos refunds parciais legítimos do mesmo Payment.

---

# 51. Refund concurrency test

Criar:

```text
test/workers/refund-concurrency.spec.ts
```

Cenário:

```text
Payment amount=10000
refunded=0
```

Dois refunds de:

```text
7000
```

concorrentes.

Expected:

```text
one success
one blocked
refunded=7000
refund rows=1
ledger refunds=1
```

---

# 52. Refund exact partition

```text
Payment=10000
Refund A=4000
Refund B=6000
```

concorrentes.

Expected:

```text
both success
refunded=10000
```

---

# 53. Refund after fully refunded

Blocked:

```text
PAYMENT_FULLY_REFUNDED
```

ou código equivalente.

---

# 54. Refund same Idempotency-Key

One logical refund.

---

# 55. Refund different keys

Se saldo refundable suportar, múltiplos partial refunds são válidos.

Não confundir isso com replay.

---

# 56. UnitOfWork refund failure tests

Criar:

```text
test/workers/refund-uow-failures.spec.ts
```

Inject falha em:

```text
Refund insert
Ledger
Audit
Outbox
Idempotency
```

Nenhum partial refund projection.

---

# 57. Internal credit concurrency

Criar:

```text
test/workers/internal-credit-concurrency.spec.ts
```

Balance:

```text
10000
```

Dois payments de:

```text
7000
```

Expected:

```text
1 success
1 blocked
balance=3000
```

---

# 58. Internal credit exact consumption

Balance:

```text
10000
```

Payments:

```text
4000
6000
```

Expected:

```text
balance=0
both Receivables updated correctly
```

---

# 59. No negative credit

Under high contention:

```text
balance=10000
100 attempts of 100
```

Expected:

```text
100 success
balance=0
```

101st blocked.

---

# 60. Cross-tenant credit

Tenant A cannot spend Tenant B credit.

---

# 61. Cross-customer credit

Customer A credit cannot pay Customer B Receivable.

---

# 62. Grant credit idempotency

Same source + same idempotency:

```text
one balance increase
one ledger movement
```

---

# 63. Grant credit source uniqueness

If credit comes from refund:

```text
same refund
```

cannot grant twice.

Constraint:

```text
tenant + sourceType + sourceId + CREDIT_GRANTED
```

or equivalent.

---

# 64. Refund-to-credit E2E

If implementing this path:

```text
Payment
↓
Refund/Credit decision
↓
Internal credit balance
↓
new Receivable
↓
RegisterPayment INTERNAL_CREDIT
↓
balance decreases
↓
Receivable paid/partial
```

---

# 65. Timeline events

Billing emits:

```text
RefundIssued
InternalCreditGranted
InternalCreditApplied
```

Operations projects:

```text
REFUND_ISSUED
INTERNAL_CREDIT_GRANTED
INTERNAL_CREDIT_APPLIED
```

permission-aware.

---

# 66. Não expor crédito financeiro para qualquer perfil

Timeline pode ocultar valor para perfis sem permission financeira.

---

# 67. Permissions

Adicionar/reutilizar:

```text
refund.create
refund.read

credit.grant
credit.read

payment.create
```

`credit.grant` deve ser altamente restrito.

---

# 68. Não permitir `credit.grant` manual se não houver regra

Se manual granting não está normativo, não expor endpoint genérico:

```http
POST /credits
```

Use apenas caminhos derivados de fatos permitidos.

---

# 69. Read endpoints

Refunds:

```http
GET /tenants/:tenantId/payments/:paymentId/refunds
```

Credit balance:

```http
GET /tenants/:tenantId/customers/:customerId/credit
```

Ledger movements sob permission.

---

# 70. Não retornar ledger inteiro sem paginação

Sempre:

```text
cursor
limit
```

---

# 71. Financial equation

Depois de Refund, não misturar:

```text
Receivable paid amount
```

com:

```text
cash retained
```

O Receivable responde:

```text
quanto da obrigação foi liquidado?
```

O Ledger responde:

```text
quais movimentos financeiros aconteceram?
```

Essa distinção é importante.

---

# 72. Portanto `paidAmountCents` não precisa diminuir no Refund

Essa é minha recomendação para este modelo:

```text
Receivable PAID
```

pode continuar `PAID`.

O Ledger mostra que houve refund depois.

Se uma regra de negócio reabrir obrigação, isso será PR-26.

---

# 73. Não usar Refund para cancelar Receivable automaticamente

Preservar separação.

---

# 74. `RN-CONC-002`

Se PR-24 já fechou saldo financeiro, PR-25 não é requisito para afirmar conclusão básica.

Mas PR-25 passa a fechar a **reversibilidade financeira**.

Documentar:

```text
RN-CONC-002 = PASS candidate from PR-24
FinancialReversalReady = PASS/ BLOCKED
```

---

# 75. Criar readiness específico

```text
docs/plans/financial-reversal-readiness.md
```

Matriz:

```text
Refund              PASS
PartialRefund       PASS
NoOverRefund        PASS
RefundConcurrency   PASS

InternalCredit      PASS
CreditApplication   PASS
NoNegativeCredit    PASS
CreditConcurrency   PASS

LedgerAppendOnly    PASS
Replay              PASS
ACKLoss             PASS
TenantIsolation     PASS
```

---

# 76. Outbox replay

`RefundIssued` delivered 10x:

```text
timeline rows = 1
```

`InternalCreditGranted` 10x:

```text
timeline rows = 1
```

---

# 77. ACK-loss

Billing applies domain mutation, Operations timeline receives, Billing markSent fails.

Redelivery must not duplicate timeline.

Same established pattern.

---

# 78. No Queue

Continuar:

```text
D1
Outbox
Service Bindings
```

---

# 79. No KV

Saldo financeiro nunca em KV.

---

# 80. No R2

Não necessário.

---

# 81. No Cron

Nenhum.

---

# 82. Query safety

Indexes prováveis:

```text
refunds(
  tenant_id,
  payment_id,
  refunded_at
)

customer_credit_balances(
  tenant_id,
  customer_id
)

ledger_movements(
  tenant_id,
  customer_id,
  occurred_at
)
```

Validar com query plan.

---

# 83. Observabilidade

Refund:

```text
operation=IssueRefund
result
```

Credit:

```text
operation=ApplyInternalCredit
result
```

Sem dados sensíveis.

---

# 84. Métricas

```text
refund.issued
refund.partial
refund.full
refund.over_limit_blocked

credit.granted
credit.applied
credit.insufficient
```

Low-cardinality.

---

# 85. Gate específico de refund

```bash
npm run test:refund-concurrency
```

---

# 86. Gate de internal credit

```bash
npm run test:internal-credit-concurrency
```

---

# 87. Gate de reversal

Criar:

```bash
npm run gate:financial-reversal
```

Incluindo:

```text
refund unit/workers
refund concurrency
refund UoW failures
credit tests
credit concurrency
tenant isolation
timeline delivery
```

---

# 88. Gate `pr25`

```bash
npm run gate:pr25
```

Idealmente:

```text
gate:pr24
+
gate:financial-reversal
+
dry-runs
```

---

# 89. Definition of Done — Refund

```text
[ ] Refund aggregate

[ ] linked to Payment

[ ] linked to Receivable

[ ] positive cents

[ ] partial refund

[ ] full refund

[ ] cumulative refunds <= Payment

[ ] concurrent refund safe

[ ] Idempotency-Key

[ ] server-side refundedAt

[ ] trusted refundedBy

[ ] Payment not deleted
```

---

# 90. Definition of Done — Refund Ledger

```text
[ ] REFUND_ISSUED

[ ] append-only

[ ] source Payment

[ ] source Refund

[ ] amount preserved

[ ] replay-safe
```

---

# 91. Definition of Done — Credit

```text
[ ] Customer credit balance

[ ] tenant/customer scoped

[ ] available >= 0

[ ] GrantInternalCredit

[ ] source identity

[ ] duplicate grant blocked

[ ] credit history in Ledger
```

---

# 92. Definition of Done — Credit Payment

```text
[ ] INTERNAL_CREDIT becomes usable

[ ] balance checked authoritatively

[ ] Receivable CAS

[ ] credit balance CAS

[ ] Payment created

[ ] Ledger CREDIT_APPLIED

[ ] all in one UnitOfWork

[ ] partial credit payment supported

[ ] full credit payment supported
```

---

# 93. Definition of Done — Concurrency

```text
[ ] refund 70+70 against 100 tested

[ ] refund 40+60 tested

[ ] credit 70+70 against 100 tested

[ ] credit 40+60 tested

[ ] credit high contention tested

[ ] no negative refund availability

[ ] no negative internal credit

[ ] no in-memory mutex
```

---

# 94. Definition of Done — Atomicity

```text
[ ] Refund projection + Refund + Ledger atomic

[ ] Audit atomic

[ ] Outbox atomic

[ ] Idempotency atomic

[ ] InternalCredit + Receivable + Payment + Ledger atomic

[ ] injected failures leave no partial state
```

---

# 95. Definition of Done — Timeline

```text
[ ] RefundIssued event

[ ] InternalCreditGranted event

[ ] InternalCreditApplied event

[ ] Billing → Operations

[ ] timeline deduplicated

[ ] ACK-loss safe
```

---

# 96. Definition of Done — Security

```text
[ ] refund permission

[ ] credit permission

[ ] tenant isolation

[ ] customer isolation

[ ] caller cannot forge refundedBy

[ ] caller cannot forge refundedAt

[ ] no card-sensitive data

[ ] financial timeline permission-aware
```

---

# 97. Definition of Done — Free-first

```text
[ ] D1 only

[ ] bounded indexed queries

[ ] no Queue

[ ] no KV

[ ] no R2

[ ] no Cron

[ ] no polling
```

---

# 98. Regression

Executar:

```text
PR23.3 PASS
PR24 PASS

PackageReadyForPayment PASS

payment partial PASS
payment complete PASS
payment concurrency PASS

package-funded no double charge PASS
```

---

# 99. Comandos finais

```bash
npm run lint
npx tsc --build --force

npm run test
npm run test:workers

npm run test:payment-concurrency
npm run test:refund-concurrency
npm run test:internal-credit-concurrency

npm run gate:pr24
npm run gate:financial-reversal
npm run gate:pr25

npm run workers:dry-run
git diff --check
```

Tudo:

```text
PASS
```

---

# 100. Relatório pós-implementação esperado

O Codex deve fechar aproximadamente assim:

```text
PR-25 — Refund + Internal Credit + Financial Reversal

Baseline
PR24:
Financial foundation:

Refund
domain:
partial:
full:
cumulative limit:
idempotency:
permission:

Refund Concurrency
payment amount:
attempts:
success:
blocked:
refunded total:

Internal Credit
balance:
grant:
source:
application:
partial payment:
full payment:

Credit Concurrency
initial balance:
attempts:
success:
blocked:
remaining:

Ledger
REFUND_ISSUED:
CREDIT_GRANTED:
CREDIT_APPLIED:
append-only:

Atomicity
refund:
credit:
payment:
ledger:
audit:
outbox:
idempotency:

Cross Worker
RefundIssued:
InternalCreditGranted:
InternalCreditApplied:
timeline:
replay:
ACK-loss:

Tenant Isolation
refund:
credit:
payment:
ledger:
timeline:

Security
permissions:
actor:
PII/payment data:

Free Tier
D1:
KV:
R2:
Queue:
Cron:

FinancialReversalReady:

Regression
PackageReadyForPayment:
PR24:
Payment concurrency:

Quality
unit:
workers:
refund concurrency:
credit concurrency:
lint:
typecheck:
dry-runs:
PR25 gate:

Remaining blockers:

Next PR:
```

---

# Próximo PR depois do PR-25

Com Refund/Credit/Reverse movements consolidados, o próximo PR deve tratar o lugar onde essas primitives realmente ganham regras negociais mais complexas:

# PR-26 — Appointment Cancellation + Rescheduling + No-show Financial Effects

Esse PR deverá definir, conforme contratos canônicos:

```text
Appointment cancellation
        │
        ├── deposit retained?
        ├── deposit refunded?
        ├── converted to credit?
        └── package unit untouched

Rescheduling
        │
        └── no package consumption

No-show
        │
        ├── package not consumed automatically
        └── deposit/financial rule
```

e usar justamente:

```text
Refund
InternalCredit
LedgerMovement
```

em vez de criar atalhos destrutivos.

Portanto, o próximo PR correto é **PR-25 — Refund + Internal Credit + Financial Reversal**. O PR-24 já resolveu a entrada de dinheiro e o saldo a receber; agora é necessário garantir que a saída/reversão de valor também seja tratada de forma **append-only, concorrente, idempotente e rastreável**, antes de implementar cancelamento/no-show, que depende diretamente dessas primitives.
