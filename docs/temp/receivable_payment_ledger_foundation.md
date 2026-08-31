Com o **PR-23.3 concluído** e:

```text
PackageReadyForPayment = PASS
```

o próximo PR finalmente pode iniciar o domínio financeiro.

O próximo passo correto é:

# PR-24 — Receivable + Payment + Ledger Foundation

O objetivo desse PR é criar a **fonte autoritativa do saldo financeiro**, sem ainda tentar resolver todo o financeiro de uma vez.

A fundação deve permitir:

```text
Appointment / Session / Package
            │
            ▼
        Receivable
            │
            ├── gross amount
            ├── deposit applied
            ├── package settlement context
            ├── amount paid
            └── outstanding balance
                    │
                    ▼
                 Payment
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
       CASH        PIX       CARD ...
                    │
                    ▼
             LedgerMovement
```

O PR deve fechar principalmente:

```text
saldo devido
pagamento parcial
pagamento completo
aplicação do sinal
movimentos financeiros append-only
idempotência
concorrência
auditabilidade
```

Mas deve deixar `Refund`, `Chargeback`, `Credit` avançado e fechamento de caixa para PRs seguintes.

---

# 1. Baseline obrigatória

Antes de alterar código:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr22
npm run gate:pr23
npm run gate:pr23.1
npm run gate:pr23.2
npm run gate:pr23.3
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

Estado obrigatório:

```text
PackageReadyForPayment = PASS
```

Se o gate de packages regredir:

```text
PR-24 = BLOCKED
```

---

# 2. Criar plano formal

Criar:

```text
docs/plans/PR-24-receivable-payment-ledger-foundation.md
```

Com:

```text
Objective
Scope

Financial ownership
Receivable
Payment
Ledger

Commercial snapshots
Deposit application
Package settlement
Outstanding balance

Payment methods
Partial payment
Overpayment policy

Idempotency
Concurrency
Audit
Outbox

Customer timeline
Tenant isolation
Permissions

Free-tier strategy

RN-CONC-002 qualification
Definition of Done
Out of Scope
```

---

# 3. Ownership deve continuar no Billing Worker

A fronteira correta é:

```text
billing-worker
├── CommercialTerms
├── Deposit
├── Packages
├── Receivables
├── Payments
└── Ledger
```

Operations continua proprietário de:

```text
Appointment
Customer
Timeline projection
```

Clinical continua proprietário de:

```text
Session
```

Não criar financeiro no Operations.

---

# 4. Não compartilhar tabelas como atalho

Mesmo que o D1 físico seja compartilhado:

```text
Billing
X
SELECT appointments
SELECT sessions
```

como integração de domínio.

Billing deve receber os fatos necessários por contratos e eventos.

---

# 5. Separar três conceitos financeiros

Não criar apenas:

```text
Payment
```

O PR precisa separar:

```text
Receivable
Payment
LedgerMovement
```

Onde:

```text
Receivable
= obrigação financeira

Payment
= tentativa/recebimento específico

LedgerMovement
= fato contábil append-only
```

---

# 6. Criar módulo Receivables

```bash
nest g module receivables \
  --project billing-worker
```

Estrutura:

```text
apps/billing-worker/src/receivables/
├── domain/
├── application/
├── ports/
└── adapters/
```

---

# 7. Criar `Receivable`

```bash
nest g class \
  receivables/domain/receivable \
  --project billing-worker \
  --no-spec
```

Campos mínimos conceituais:

```text
id
tenantId

customerId

sourceType
sourceId

appointmentId?
sessionId?
customerPackageId?

grossAmountCents
discountAmountCents
netAmountCents

depositAppliedCents
packageAppliedCents?

paidAmountCents
outstandingAmountCents

status

createdAt
updatedAt
```

Não aceitar todos esses valores do caller.

---

# 8. Fonte financeira deve ser explícita

`sourceType` pode representar:

```text
APPOINTMENT
PACKAGE
```

ou equivalente.

Não inventar dez tipos ainda.

O MVP precisa inicialmente cobrir:

```text
serviço/sessão
pacote
```

---

# 9. Não criar Receivable duplicado

A mesma obrigação lógica deve possuir identidade única.

Por exemplo:

```text
tenant + sourceType + sourceId
```

deve produzir no máximo um Receivable.

Constraint física:

```text
UNIQUE (
  tenant_id,
  source_type,
  source_id
)
```

---

# 10. Status do Receivable

Começar com algo simples:

```text
OPEN
PARTIALLY_PAID
PAID
```

Talvez:

```text
CANCELED
```

somente se já necessário.

Não adicionar:

```text
OVERDUE
DEFAULTED
WRITTEN_OFF
DISPUTED
```

neste PR.

---

# 11. `outstandingAmountCents` nunca negativo

Invariante:

```text
0 <= outstandingAmountCents <= netAmountCents
```

considerando os créditos/aplicações válidos.

---

# 12. Evitar float

Todos os valores:

```text
integer cents
```

como já consolidado desde CommercialTerms.

---

# 13. Criar objeto de domínio financeiro

Pode ser útil:

```text
MoneyAmount
```

somente se já houver abstraction reutilizável.

Não duplicar money class se o projeto já possui helpers de centavos.

---

# 14. Criar módulo Payments

```bash
nest g module payments \
  --project billing-worker
```

---

# 15. Criar `Payment`

```bash
nest g class \
  payments/domain/payment \
  --project billing-worker \
  --no-spec
```

Campos:

```text
id
tenantId

receivableId
customerId

amountCents
method
status

receivedAt
receivedBy

externalReference?
notes?

createdAt
```

---

# 16. Métodos de pagamento

A documentação do MVP prevê:

```text
CASH
PIX
DEBIT_CARD
CREDIT_CARD
TRANSFER
INTERNAL_CREDIT
```

Usar nomes canônicos equivalentes.

Não implementar integrações reais com adquirentes agora.

---

# 17. Payment status

Como estamos registrando pagamentos recebidos, não precisamos criar uma FSM gigantesca.

Pode começar com:

```text
CONFIRMED
```

como fato registrado manualmente/autoritativamente.

Se houver necessidade de tentativa assíncrona futura:

```text
PENDING
```

virá depois.

---

# 18. Não fingir gateway de pagamento

Nenhum:

```text
Stripe
Mercado Pago
PagSeguro
Stone
Rede
```

neste PR.

O sistema registra o fato financeiro.

---

# 19. Criar Ledger

```bash
nest g module ledger \
  --project billing-worker
```

---

# 20. Criar `LedgerMovement`

```bash
nest g class \
  ledger/domain/ledger-movement \
  --project billing-worker \
  --no-spec
```

Campos:

```text
id
tenantId

customerId
receivableId?

type
amountCents

direction

sourceType
sourceId

occurredAt

createdBy
correlationId
```

---

# 21. Ledger deve ser append-only

Nunca:

```text
UPDATE ledger_movements
DELETE ledger_movements
```

para corrigir histórico.

Futuras correções:

```text
new inverse movement
```

---

# 22. Tipos mínimos de LedgerMovement

Neste PR:

```text
RECEIVABLE_CREATED
DEPOSIT_APPLIED
PAYMENT_RECEIVED
```

Talvez:

```text
PACKAGE_APPLIED
```

se package settlement realmente gera movimento monetário.

Mas cuidado para não duplicar PackageMovement.

---

# 23. Package não deve gerar cobrança novamente

Se:

```text
settlementSource = PACKAGE
```

a sessão já foi coberta por um CustomerPackage.

O PR financeiro não deve criar uma obrigação da sessão que cobre novamente:

```text
full service price
```

como saldo a receber do cliente.

---

# 24. Essa decisão precisa ser congelada em ADR

Criar:

```text
docs/adr/0013-receivable-payment-ledger-model.md
```

ou próximo número real.

Documentar:

```text
STANDARD appointment/session
→ receivable for session/service

PACKAGE-funded appointment/session
→ no duplicate session receivable

CustomerPackage acquisition
→ own receivable
```

Esse ponto é crítico.

---

# 25. Package acquisition vira Receivable

Quando CustomerPackage for materializado por uma venda real:

```text
CustomerPackage
```

precisa poder apontar para:

```text
receivableId
```

ou source relationship equivalente.

Mas PR-23 permitiu materialização autorizada sem Payment.

PR-24 deve criar o fluxo financeiro real.

---

# 26. Não retroagir fixtures antigas automaticamente

CustomerPackages criados para provas dos PRs 23 não precisam ganhar Receivable automaticamente por migration.

Documentar:

```text
legacy/proof package materializations
= financial settlement unknown
```

Não inventar saldo.

---

# 27. Criar `CreateReceivable`

```bash
nest g service \
  receivables/application/create-receivable \
  --project billing-worker
```

Mas ele deve ser **interno**, chamado por fatos comerciais autoritativos.

Não expor:

```http
POST /receivables
```

livremente para qualquer usuário.

---

# 28. Fontes de criação

No início:

```text
Appointment/Session commercial obligation
CustomerPackage acquisition
```

---

# 29. Standard Appointment / Session

O PR-12 já possui CommercialTerms snapshot:

```text
basePrice
discount
finalPrice
deposit
```

Precisamos usar esse snapshot.

Não recalcular preço no PR-24.

---

# 30. Não chamar `CalculateCommercialTerms` novamente

Uma vez criado o Appointment:

```text
snapshot financeiro
```

é autoridade histórica.

O Receivable deriva dele.

---

# 31. Quando criar o Receivable?

Há duas possibilidades:

```text
at Appointment creation
```

ou:

```text
at Session completion
```

Para o fluxo atual, o melhor é analisar a semântica existente do depósito e da dívida.

---

# 32. Recomendação

Criar Receivable quando a obrigação comercial fica definitivamente materializada.

Para serviço por sessão, isso pode ocorrer em:

```text
CreateAppointment
```

se preço já está congelado.

Mas isso exigiria retrofitar PR-12.

Alternativa incremental:

```text
SessionCompleted
→ Receivable materialization
```

---

# 33. Cuidado com depósito

O depósito acontece antes da sessão.

Se Receivable só nasce no final, ainda precisamos preservar o valor de depósito previamente confirmado.

Isso é possível porque o Billing já possui Deposit lifecycle.

---

# 34. Modelo incremental recomendado

No PR-24:

```text
SessionCompleted
        ↓
MaterializeSessionReceivable
        ↓
gross/net from Appointment commercial snapshot
        ↓
find confirmed deposit
        ↓
apply deposit
        ↓
outstanding balance
```

Esse é um primeiro passo sólido.

---

# 35. Package-funded Session

Se Session:

```text
settlementSource = PACKAGE
```

então:

```text
MaterializeSessionReceivable
→ NOT_APPLICABLE
```

ou:

```text
zero customer receivable
```

Eu prefiro `NOT_APPLICABLE`, para não criar receitas zeradas falsas.

---

# 36. CustomerPackage acquisition

Terá seu próprio Receivable:

```text
sourceType = CUSTOMER_PACKAGE
sourceId = customerPackageId
```

Isso pode ser criado quando a venda do pacote for formalizada.

---

# 37. Criar contrato de evento financeiro da Session

Se `SessionCompleted` já chega ao Billing por `PackageConsumptionRequested` apenas quando há pacote, Billing precisa também saber das sessões STANDARD.

Há duas opções.

---

# 38. Melhor opção

Clinical deve emitir:

```text
SessionFinancialSettlementRequested
```

para toda Session completada.

Payload mínimo:

```text
eventId
tenantId
sessionId
appointmentId
customerId
serviceId

settlementSource
customerPackageId?

commercial snapshot identity / required values
completedAt
correlationId
```

---

# 39. Não enviar dados demais

Pode ser suficiente mandar:

```text
appointmentId
```

e Billing consultar Operations via RPC para obter o frozen commercial context.

Mas isso adiciona outra chamada.

---

# 40. Free-first

É provavelmente melhor o event carregar os valores comerciais mínimos já congelados:

```text
basePriceCents
discountCents
finalPriceCents
depositExpectedCents?
```

desde que esses valores sejam fatos já congelados da Session/Appointment e não possam ser manipulados pelo caller.

---

# 41. Porém Clinical talvez não tenha todos esses valores

Session provavelmente contém snapshots relevantes de PR-12/16.

Inspecionar antes:

```bash
grep -R "basePriceCents" apps/clinical-worker apps/operations-worker -n
grep -R "finalPriceCents" apps/clinical-worker apps/operations-worker -n
```

Não duplicar sem necessidade.

---

# 42. Alternativa mais limpa

Operations já possui Appointment commercial snapshot.

Então:

```text
SessionCompleted
→ Operations
```

pode emitir:

```text
FinancialSettlementRequested
```

para Billing.

Isso preserva a autoridade comercial no Operations.

---

# 43. Recomendo este fluxo

```text
Clinical
SessionCompleted
        ↓
Operations
ApplySessionCompleted
        ↓
Appointment COMPLETED
        ↓
Outbox FinancialSettlementRequested
        ↓
Billing
```

Para package-funded Session:

```text
Billing
→ recognizes settlementSource=PACKAGE
→ no service Receivable
```

Para standard:

```text
→ materialize Receivable
```

---

# 44. Isso mantém Clinical fora do financeiro

É arquiteturalmente mais limpo.

Clinical publica apenas o fato clínico.

Operations traduz para o fato comercial de liquidação.

---

# 45. Criar `FinancialSettlementRequested`

Contrato em:

```text
libs/contracts/src/payments/
```

Payload:

```text
eventId
tenantId

appointmentId
sessionId
customerId
serviceId

settlementSource

basePriceCents
discountCents
finalPriceCents

depositId?
depositAmountCents?

customerPackageId?

completedAt
correlationId
```

Somente fatos já autoritativos.

---

# 46. Não aceitar esses valores de endpoint público

São emitidos internamente pelo Operations.

---

# 47. Operations Outbox

Ao aplicar `SessionCompleted`:

```text
Appointment COMPLETED
Timeline SESSION_COMPLETED
profile effects
```

agora também:

```text
FinancialSettlementRequested
```

na UnitOfWork local.

---

# 48. Mas cuidado com Package

Se:

```text
settlementSource=PACKAGE
```

o evento pode ainda ser útil para registrar settlement concluído por package.

Mas não deve gerar receivable de sessão.

---

# 49. Billing consumer

Criar:

```bash
nest g service \
  receivables/application/apply-financial-settlement-requested \
  --project billing-worker
```

---

# 50. Resultado interno

```text
STANDARD
→ Create/Materialize Receivable

PACKAGE
→ NO_SESSION_RECEIVABLE
```

E manter PackageConsumptionRequested como fluxo separado.

---

# 51. Não misturar package unit e dinheiro

Dois fatos:

```text
PackageConsumptionRequested
```

e:

```text
FinancialSettlementRequested
```

podem ocorrer pela mesma Session, mas têm responsabilidades diferentes.

---

# 52. Deposit confirmed precisa ser aplicado

O PR-13 possui Deposit lifecycle.

Se depósito:

```text
CONFIRMED
```

o Receivable deve considerar:

```text
outstanding =
finalPrice - depositConfirmed
```

---

# 53. Deposit PENDING não conta

Não aplicar:

```text
PENDING
EXPIRED
CANCELED
```

como pagamento.

---

# 54. Não descontar depósito duas vezes

Criar um LedgerMovement único:

```text
DEPOSIT_APPLIED
```

com business uniqueness ligada a:

```text
depositId + receivableId
```

ou outra identidade adequada.

---

# 55. Confirmed Deposit já é valor recebido

O financeiro precisa refletir:

```text
paidAmountCents
```

incluindo depósito confirmado.

---

# 56. Exemplo

```text
finalPrice = 18.000
confirmedDeposit = 3.600
```

Receivable:

```text
netAmount = 18.000
paidAmount = 3.600
outstanding = 14.400
status = PARTIALLY_PAID
```

Se não houver outros payments.

---

# 57. Não criar novo Payment para o depósito retroativamente

Deposit é agregado existente.

Pode gerar:

```text
LedgerMovement DEPOSIT_APPLIED
```

sem inventar `Payment` duplicado.

---

# 58. Criar `RegisterPayment`

```bash
nest g service \
  payments/application/register-payment \
  --project billing-worker
```

Endpoint:

```http
POST /tenants/:tenantId/receivables/:receivableId/payments
```

---

# 59. Permissão

Algo como:

```text
payment.create
```

ou equivalente financeiro/comercial já definido.

---

# 60. Idempotency-Key obrigatório

Pagamento é uma das operações mais críticas.

```text
REGISTER_PAYMENT
```

---

# 61. Input

```text
amountCents
method
externalReference?
```

Não:

```text
newBalance
status
receivedBy
receivedAt
```

Caller não é autoridade desses campos.

---

# 62. `receivedAt`

Server-side para registro padrão.

Se existir backoffice posterior para lançar pagamento retroativo, será outro comando.

---

# 63. `receivedBy`

ExecutionContext.

---

# 64. Partial payment

Se:

```text
outstanding = 10000
payment = 4000
```

Resultado:

```text
paid += 4000
outstanding = 6000
status = PARTIALLY_PAID
```

---

# 65. Final payment

Depois:

```text
payment = 6000
```

Resultado:

```text
outstanding = 0
status = PAID
```

---

# 66. Overpayment

Não inventar crédito automático neste PR.

Se:

```text
payment > outstanding
```

retornar:

```text
PAYMENT_EXCEEDS_OUTSTANDING
```

Até que Internal Credit esteja implementado formalmente.

---

# 67. Isso evita dinheiro desaparecer

Não faça:

```text
outstanding = max(0, outstanding - payment)
```

e ignore excesso.

---

# 68. CAS financeiro obrigatório

Registrar dois pagamentos simultâneos exige proteção física.

Receivable:

```text
outstanding=10000
```

Dois payments de 7000 simultâneos.

Sem CAS:

```text
paid=14000
```

seria possível.

---

# 69. Primitive de pagamento

Precisamos de mutation condicional:

```text
amount <= current outstanding
```

e atualização atômica.

---

# 70. Uma opção

```sql
UPDATE receivables
SET
  paid_amount_cents = paid_amount_cents + ?,
  outstanding_amount_cents = outstanding_amount_cents - ?,
  status = CASE ...
WHERE tenant_id = ?
  AND id = ?
  AND outstanding_amount_cents >= ?
  AND status IN ('OPEN','PARTIALLY_PAID')
```

`changes=1`.

---

# 71. Payment row e LedgerMovement precisam ser atômicos com isso

Na UnitOfWork:

```text
Receivable CAS
+
Payment insert
+
LedgerMovement PAYMENT_RECEIVED
+
Audit
+
Outbox
+
Idempotency
```

---

# 72. Não permitir `outstanding < 0`

Constraint física:

```text
outstanding_amount_cents >= 0
```

e CAS.

---

# 73. Payment business uniqueness

Idempotency-Key protege retry.

Mas se houver:

```text
externalReference
```

para Pix/transferência, poderá haver unique adicional.

Não inventar unique global se a referência não é universalmente fornecida.

---

# 74. Ledger movement

Pagamento confirmado gera:

```text
PAYMENT_RECEIVED
```

com:

```text
paymentId
receivableId
amount
```

---

# 75. Payment nunca é deletado

O documento normativo prevê que pagamentos não devem ser excluídos.

Logo:

```text
DELETE payment
```

não deve existir.

---

# 76. Refund fica fora

Mas a arquitetura deve permitir futuramente:

```text
REFUND
```

como novo movimento inverso.

Não implemente agora.

---

# 77. Migration `0019` ou próximo número real

Depois de verificar migrations:

```bash
ls database/d1/migrations
```

Criar algo como:

```text
0019_receivable_payment_ledger_foundation.sql
```

se `0018` é a última.

---

# 78. Tabelas

```text
receivables
payments
ledger_movements
```

Possivelmente:

```text
receivable_deposit_applications
```

se precisar proteger aplicação única do Deposit.

---

# 79. `receivables`

Campos sugeridos:

```text
id
tenant_id

customer_id

source_type
source_id

appointment_id
session_id
customer_package_id

gross_amount_cents
discount_amount_cents
net_amount_cents

deposit_applied_cents
paid_amount_cents
outstanding_amount_cents

status

created_at
updated_at
```

---

# 80. Constraints

```text
gross >= 0
discount >= 0
discount <= gross

net >= 0

deposit_applied >= 0
paid >= 0
outstanding >= 0

paid <= net
outstanding <= net
```

A equação precisa ser coerente.

---

# 81. Cuidado com `paidAmount`

Decidir se:

```text
paidAmount
```

inclui:

```text
deposit
```

Minha recomendação:

```text
paidAmount = total value already settled
```

incluindo depósito.

Então:

```text
outstanding = net - paidAmount
```

e `depositAppliedCents` é apenas breakdown.

---

# 82. Isso simplifica

```text
paidAmount = deposit + payments
```

---

# 83. Ledger é a fonte histórica

Receivable é projection/counter atual.

Ledger explica como chegou lá.

---

# 84. Criar `ReceivableRepository`

```bash
nest g interface \
  receivables/ports/receivable-repository \
  --project billing-worker
```

Métodos:

```text
findById
findBySource
create
applyPayment
```

orientados ao domínio.

---

# 85. Criar `PaymentRepository`

```bash
nest g interface \
  payments/ports/payment-repository \
  --project billing-worker
```

---

# 86. Criar `LedgerRepository`

```bash
nest g interface \
  ledger/ports/ledger-repository \
  --project billing-worker
```

Append-only.

---

# 87. D1 adapters

Usar Nest CLI providers para cada adapter.

---

# 88. Internal credit

Embora método exista na regra, `INTERNAL_CREDIT` depende de um saldo de crédito real.

Não permitir:

```text
method=INTERNAL_CREDIT
```

sem Credit domain.

---

# 89. Como resolver neste PR

O enum pode reconhecer:

```text
INTERNAL_CREDIT
```

mas `RegisterPayment` retorna:

```text
PAYMENT_METHOD_NOT_AVAILABLE
```

até PR de Credit.

Ou simplesmente não expor esse método operacionalmente.

Documentar.

---

# 90. Outros métodos

```text
CASH
PIX
DEBIT_CARD
CREDIT_CARD
TRANSFER
```

podem funcionar como pagamentos registrados manualmente.

---

# 91. Não guardar número completo de cartão

Nunca.

No máximo:

```text
externalReference
```

ou metadata não sensível futura.

---

# 92. Não implementar PCI scope

Nenhum PAN/CVV.

---

# 93. Outbox `PaymentReceived`

Billing deve emitir:

```text
PaymentReceived
```

para Operations timeline.

Payload mínimo:

```text
eventId
tenantId
customerId
receivableId
paymentId

amountCents
method
receivedAt

sourceType
sourceId

correlationId
```

---

# 94. Timeline

Operations cria:

```text
PAYMENT_RECEIVED
```

permission-aware.

---

# 95. Deposit timeline

Se já existe `DepositConfirmed`, não duplicar timeline de pagamento como se fosse um `PaymentReceived` novo.

Pode existir:

```text
DEPOSIT_CONFIRMED
```

e posteriormente:

```text
DEPOSIT_APPLIED
```

se realmente útil.

---

# 96. Não dupla contagem financeira

Deposit:

```text
confirmed
```

já representa recebimento.

Ao aplicar no Receivable, não criar um segundo valor recebido.

O Ledger pode ter:

```text
DEPOSIT_APPLIED
```

como vínculo contábil, mas o total financeiro precisa saber que é o mesmo dinheiro.

---

# 97. Isso merece invariantes específicas

```text
same deposit
→ applied to at most one logical receivable/source
```

salvo regra futura.

---

# 98. Criar `ApplyDepositToReceivable`

Pode ser interno:

```bash
nest g service \
  receivables/application/apply-deposit-to-receivable \
  --project billing-worker
```

normalmente chamado na materialização do Receivable.

---

# 99. Deposit maior que Receivable

O CommercialTerms já garante depósito <= preço final.

Logo para Appointment original isso não deveria ocorrer.

Se ocorrer por inconsistência:

```text
BLOCKED / INVALID_FINANCIAL_STATE
```

Não truncar.

---

# 100. Concurrency física deve entrar desde o PR-24

Dado o rigor que construímos em packages, não repetir o erro de deixar prova financeira para muitos PRs depois.

Criar desde já:

```text
test/workers/payment-concurrency.spec.ts
```

---

# 101. Cenário saldo 100, dois payments 70

Concorrentes:

```text
payment A = 70
payment B = 70
```

Expected:

```text
one success
one blocked
outstanding = 30
paid = 70
payments = 1
ledger movements = 1
```

Nunca:

```text
paid = 140
outstanding = -40
```

---

# 102. Cenário saldo 100, payments 40 + 60

Concorrentes.

Resultado:

```text
both succeed
paid = 100
outstanding = 0
status = PAID
payments = 2
```

A ordem pode variar, o estado final não.

---

# 103. Cenário 100 requests

Receivable:

```text
outstanding=10000
```

100 requests de 100.

Esperado:

```text
100 success
outstanding=0
```

ou quantidade configurada adequada.

---

# 104. N+1th payment

Depois de `PAID`:

```text
payment
→ RECEIVABLE_ALREADY_PAID
```

---

# 105. Replay

Mesma Idempotency-Key:

```text
one Payment
one LedgerMovement
one decrement
```

---

# 106. Different key / same business payment

Sem externalReference comum, são duas intenções de pagamento reais.

Não deduplicar heuristicamente.

Se saldo permitir, ambas podem ser válidas.

---

# 107. UnitOfWork failure tests

Criar:

```text
test/workers/payment-uow-failures.spec.ts
```

Provar falha em:

```text
Payment insert
Ledger insert
Audit
Outbox
Idempotency
```

Não deixa Receivable parcial.

---

# 108. Failure Ledger

Receivable não deve ter saldo reduzido sem movement.

---

# 109. Failure Outbox

Se `PaymentReceived` é obrigatório para timeline:

```text
payment should not partially commit
```

conforme padrão local.

---

# 110. Materialização de Receivable idempotente

`FinancialSettlementRequested` redelivery:

```text
Receivable rows = 1
```

Deposit application:

```text
1
```

Ledger:

```text
no duplicates
```

---

# 111. Standard Session E2E

Fluxo:

```text
CreateAppointment STANDARD
↓
Deposit optional
↓
Session complete
↓
Operations FinancialSettlementRequested
↓
Billing Receivable
↓
Register payment(s)
↓
Receivable PAID
↓
PaymentReceived
↓
Operations Timeline
```

---

# 112. Package-funded Session E2E

```text
settlementSource=PACKAGE
↓
Session complete
↓
Package consumed
↓
FinancialSettlementRequested
↓
Billing no service Receivable
```

Resultado:

```text
service receivables = 0
```

Isso é uma prova importantíssima contra cobrança dupla.

---

# 113. Package purchase E2E

Pode ser parcialmente implementado:

```text
PackageDefinition
↓
purchase/materialization command
↓
Receivable CUSTOMER_PACKAGE
↓
payment
↓
materialize/activate CustomerPackage
```

Mas atenção: isso pode aumentar muito o escopo.

---

# 114. Melhor deixar purchase orchestration para PR-24.1

Neste PR-24, criar apenas o foundation:

```text
Receivable sourceType CUSTOMER_PACKAGE
```

e provar materialização manual/autorizada.

Depois:

```text
PR-24.1 — Package Purchase Financial Orchestration
```

se necessário.

---

# 115. Não mexer na qualificação já aprovada de packages

`PackageReadyForPayment` deve continuar:

```text
PASS
```

durante o PR-24.

Adicionar regression:

```text
gate:pr23.3 PASS
```

dentro do gate financeiro.

---

# 116. Query endpoints

Receivable:

```http
GET /tenants/:tenantId/customers/:customerId/receivables
GET /tenants/:tenantId/receivables/:id
```

Paginados.

---

# 117. Payment history

```http
GET /tenants/:tenantId/receivables/:id/payments
```

Paginado.

---

# 118. Ledger endpoint?

Eu evitaria expor ledger bruto para todos.

Pode existir:

```http
GET /tenants/:tenantId/receivables/:id/ledger
```

somente com permissão financeira.

---

# 119. Permissions

Separar:

```text
receivable.read
payment.create
payment.read
ledger.read
```

Não usar permissões operacionais genéricas.

---

# 120. Customer não precisa expor endpoint financeiro interno neste backend agora

Foco em staff/admin/financeiro.

---

# 121. Tenant isolation

Testar em todas as camadas:

```text
Receivable
Payment
Ledger
Settlement RPC
Timeline
```

---

# 122. Cross-customer

Tenant correto, Customer errado:

```text
cannot register payment to another customer's receivable
```

quando command inclui customer context.

---

# 123. Outbox Billing → Operations

Adicionar route:

```text
PaymentReceived
→ Operations
```

Reutilizar dispatcher.

---

# 124. Operations consumer

Criar:

```bash
nest g service \
  customer-history/application/apply-payment-received \
  --project operations-worker
```

ou coordinator equivalente.

Append:

```text
PAYMENT_RECEIVED
```

idempotentemente.

---

# 125. Não atualizar Relationship Profile por Payment

Perfil é comportamental, não financeiro.

---

# 126. Observabilidade

Receivable:

```text
operation=MaterializeReceivable
sourceType
result
```

Payment:

```text
operation=RegisterPayment
method
result
```

Sem:

```text
full customer identity
card data
```

---

# 127. Métricas

```text
receivable.created
receivable.partially_paid
receivable.paid

payment.received
payment.replay
payment.overpayment_blocked
payment.concurrent_conflict
```

Sem IDs.

---

# 128. Free Tier

O modelo é adequado:

```text
D1 writes only on financial events
Service Bindings only for integration
No polling
No Queue
No R2
No KV
No Cron
```

---

# 129. Índices

Prováveis:

```text
receivables(
  tenant_id,
  customer_id,
  status,
  created_at
)

receivables(
  tenant_id,
  source_type,
  source_id
)

payments(
  tenant_id,
  receivable_id,
  received_at
)

ledger_movements(
  tenant_id,
  receivable_id,
  occurred_at
)
```

Validar com `EXPLAIN QUERY PLAN`.

---

# 130. Não criar índice em `notes`

Obviamente.

---

# 131. Migration empty DB

Aplicar:

```text
0001 → 0019
```

ou número real.

Depois:

```text
No migrations to apply
```

---

# 132. Criar gate `test:payment-concurrency`

```bash
npm run test:payment-concurrency
```

---

# 133. Criar gate `test:payment-uow-failures`

```bash
npm run test:payment-uow-failures
```

---

# 134. Criar `gate:financial-foundation`

Deve executar:

```text
receivable tests
payment tests
ledger tests
financial settlement tests
payment concurrency
UoW failures
tenant isolation
timeline delivery
```

---

# 135. Criar `gate:pr24`

```bash
npm run gate:pr24
```

Idealmente:

```text
gate:pr23.3
+
gate:financial-foundation
+
workers dry-run
```

---

# 136. Definition of Done — Receivable

```text
[ ] Receivable aggregate

[ ] source identity

[ ] unique per logical source

[ ] integer cents

[ ] OPEN
[ ] PARTIALLY_PAID
[ ] PAID

[ ] gross
[ ] discount
[ ] net

[ ] deposit application

[ ] paid amount

[ ] outstanding amount

[ ] outstanding never negative
```

---

# 137. Definition of Done — Deposit

```text
[ ] only CONFIRMED deposit applies

[ ] expired/canceled/pending deposit ignored

[ ] deposit applied at most once

[ ] deposit amount does not exceed Receivable

[ ] paid/outstanding values consistent

[ ] no duplicate Payment created for deposit
```

---

# 138. Definition of Done — Payment

```text
[ ] RegisterPayment

[ ] CASH
[ ] PIX
[ ] DEBIT_CARD
[ ] CREDIT_CARD
[ ] TRANSFER

[ ] partial payment

[ ] final payment

[ ] Idempotency-Key

[ ] server-side receivedAt

[ ] trusted receivedBy

[ ] overpayment blocked

[ ] payment never deleted
```

---

# 139. Definition of Done — Ledger

```text
[ ] append-only

[ ] RECEIVABLE_CREATED

[ ] DEPOSIT_APPLIED

[ ] PAYMENT_RECEIVED

[ ] source references

[ ] amount integer cents

[ ] replay-safe

[ ] no destructive correction path
```

---

# 140. Definition of Done — Settlement

```text
[ ] FinancialSettlementRequested

[ ] STANDARD Session → Receivable

[ ] PACKAGE Session → no duplicate service Receivable

[ ] commercial snapshot not recalculated

[ ] DiscountPolicy not called again

[ ] event redelivery creates no duplicate Receivable
```

---

# 141. Definition of Done — Concurrency

```text
[ ] two payments exceeding combined balance tested

[ ] only valid set succeeds

[ ] outstanding never negative

[ ] simultaneous exact-balance payments tested

[ ] final status deterministic

[ ] no in-memory mutex
```

---

# 142. Definition of Done — UnitOfWork

```text
[ ] Receivable update + Payment + Ledger atomic

[ ] Audit included

[ ] Outbox included

[ ] Idempotency included

[ ] Ledger failure leaves no payment effect

[ ] Outbox failure leaves no payment effect
```

---

# 143. Definition of Done — Timeline

```text
[ ] PaymentReceived event

[ ] Billing → Operations

[ ] timeline PAYMENT_RECEIVED

[ ] eventId deduplication

[ ] ACK-loss safe
```

---

# 144. Definition of Done — Security

```text
[ ] payment permissions

[ ] ledger permissions

[ ] tenant isolation

[ ] customer isolation

[ ] caller cannot forge receivedBy

[ ] caller cannot forge receivedAt

[ ] no card-sensitive data stored

[ ] no financial details in generic logs
```

---

# 145. Definition of Done — Free Tier

```text
[ ] bounded indexed D1 queries

[ ] no Queue

[ ] no R2

[ ] no KV

[ ] no Cron

[ ] no polling

[ ] no runtime full-ledger scans
```

---

# 146. `RN-CONC-002` depois do PR-24

Este é o PR que deve finalmente permitir uma nova avaliação formal:

```text
Session                 PASS
Appointment             PASS
History                 PASS
Customer profile        PASS
Package consumption     PASS
Return recommendation   PASS
Audit                   PASS
Financial balance       PASS

RN-CONC-002 FULL        candidate PASS
```

Mas eu só marcaria:

```text
RN-CONC-002 FULL = PASS
```

se o gate físico provar também:

```text
FinancialSettlementRequested replay
Receivable materialization replay
Deposit application replay
Payment atomicity
Package-funded no-double-charge
```

---

# 147. O que fica fora do PR-24

Não implementar:

```text
Refund
Chargeback

Internal Credit balance

Financial reversal

Cash register / cash session

Reconciliation with payment gateways

Payment provider webhooks

Installments

Card fees

Commission

Accounts payable

Invoices

Taxes

Accounting exports
```

---

# 148. Relatório esperado do Codex

O pós-implementação deveria seguir algo próximo de:

```text
PR-24 — Receivable + Payment + Ledger Foundation

Baseline
PackageReadyForPayment:

Receivable
domain:
source types:
statuses:
commercial snapshot:
deposit:
paid:
outstanding:

Financial Settlement
SessionCompleted:
Operations event:
STANDARD:
PACKAGE:
replay:

Deposit Application
confirmed:
pending:
expired:
duplicate application:

Payment
methods:
partial:
full:
overpayment:
idempotency:

Ledger
RECEIVABLE_CREATED:
DEPOSIT_APPLIED:
PAYMENT_RECEIVED:
append-only:

Concurrency
initial outstanding:
attempts:
success:
blocked:
negative balances:

UnitOfWork
payment failure:
ledger failure:
audit failure:
outbox failure:
idempotency failure:
partial states:

Cross Worker
Operations → Billing:
Billing → Operations:
replay:
ACK-loss:

Timeline
PAYMENT_RECEIVED:
deduplication:

Tenant Isolation
receivables:
payments:
ledger:
settlement:
timeline:

Package Regression
PackageReadyForPayment:
package-funded session receivable count:
double charge:

Free Tier
D1:
KV:
R2:
Queue:
Cron:

RN-CONC-002
session:
appointment:
history:
profile:
package:
return:
audit:
financial:
full:

Quality
unit:
workers:
payment concurrency:
UoW failures:
lint:
typecheck:
dry-run:
PR24 gate:

Remaining blockers:

Next PR:
```

---

# Depois do PR-24

Se o financeiro básico estiver fisicamente qualificado, eu não avançaria direto para notificações ainda.

O próximo passo provavelmente deveria ser:

# PR-25 — Refund + Internal Credit + Financial Reversal

porque a regra financeira exige que pagamentos não sejam apagados e que estorno seja representado por movimento inverso.

Depois:

```text
PR-26 — Cancellation / No-show / Rescheduling Financial Effects
```

e então:

```text
PR-27 — Notifications / Reminders / Return Automation
```

A sequência financeira ficaria:

```text
PR-24
Receivable
Payment
Ledger
Partial Payment
        ↓
PR-25
Refund
Credit
Reverse movements
        ↓
PR-26
Cancellation
No-show
Rescheduling
Deposit/Package financial effects
```

Portanto, com `PackageReadyForPayment = PASS`, o próximo PR correto é finalmente o **PR-24 — Receivable + Payment + Ledger Foundation**. O foco principal deve ser garantir desde o início que **o saldo nunca fique negativo, pagamentos concorrentes não ultrapassem a dívida, depósito confirmado seja aplicado exatamente uma vez, uma Session coberta por pacote não gere cobrança duplicada e cada alteração financeira seja explicável por um Ledger append-only**.
