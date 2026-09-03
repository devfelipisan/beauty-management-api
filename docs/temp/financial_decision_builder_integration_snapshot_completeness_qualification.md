Considerando o estado atual, o próximo PR deve **fechar o PR-26.4 antes de qualquer ativação financeira**.

O próximo passo correto é:

# PR-26.4.1 — Financial Decision Builder Integration + Snapshot Completeness Qualification

O objetivo é transformar:

```text
BuildFinancialDecisionSnapshot = IMPLEMENTADO
PaymentRefundDecision          = IMPLEMENTADO
Fingerprint                    = IMPLEMENTADO

EvaluateAppointmentChangeFinancials
→ ainda não usa o builder

Snapshot completeness
→ parcial

Validator
→ ainda não valida fingerprint

Payment versioning em Refund
→ parcial

Consumers financeiros
→ BLOCKED
```

em:

```text
FinancialDecisionBuilderIntegrated = PASS
SnapshotCompleteness               = PASS
FingerprintValidation              = PASS
PaymentVersionConsistency          = PASS
FinancialDecisionReady             = PASS

FinancialConsumers                 = BLOCKED
```

Só depois disso deve vir o **PR-26.5 — Financial Consumer Activation**.

---

## 1. Congelar a baseline

Antes de alterar qualquer código:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr26.1
npm run gate:pr26.2
npm run gate:pr26.3
npm run gate:pr26.4
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

Registrar no plano:

```text
SnapshotBuilderImplemented = PASS
BuilderIntegrated          = BLOCKED
SnapshotComplete           = BLOCKED
FingerprintValidated       = BLOCKED
FinancialDecisionReady     = BLOCKED
FinancialConsumers         = BLOCKED
```

---

# 2. Criar o documento do PR

Criar:

```text
docs/plans/PR-26.4.1-financial-decision-builder-integration.md
```

Com:

```text
Objective
Baseline
Current gaps

Builder integration
Cancellation evaluation
No-show evaluation

Deposit snapshot
Receivable snapshot
Payment refund decisions
Credit components
Retention components

Fingerprint validation
Payment version lifecycle

Snapshot invariants
Idempotency
Replay stability

Tenant isolation
Stale decision
Physical tests

FinancialDecisionReady
Definition of Done
Out of Scope
```

---

# 3. Primeiro integrar o builder ao evaluator

O problema principal atual é:

```text
BuildFinancialDecisionSnapshot
```

existir isoladamente.

Ele deve se tornar a única maneira válida de `EvaluateAppointmentChangeFinancials` construir estado financeiro.

Fluxo esperado:

```text
EvaluateAppointmentChangeFinancials
        ↓
resolve applicable policy
        ↓
BuildFinancialDecisionSnapshot
        ↓
apply policy decision
        ↓
materialize exact financial allocations
        ↓
validate snapshot structure
        ↓
READY(snapshot)
```

Não manter dois caminhos:

```text
old evaluator financial resolution
new builder financial resolution
```

---

# 4. Não permitir fallback para o comportamento anterior

Evitar:

```ts
if (builderAvailable) {
  ...
} else {
  // old inference
}
```

O estado esperado deve ser:

```text
builder failure
→ BLOCKED
```

e não fallback heurístico.

---

# 5. Evoluir `EvaluateAppointmentChangeFinancials`

Se hoje cancelamento e no-show usam o mesmo application service:

```text
EvaluateAppointmentChangeFinancials
```

manter essa composição.

Não criar:

```text
EvaluateCancellationFinancialsV2
EvaluateNoShowFinancialsV2
```

apenas para evitar refatoração.

---

# 6. Contexto mínimo da avaliação

O evaluator pode receber:

```text
tenantId
appointmentId
customerId
serviceId
changeType
origin
scheduledAt
evaluatedAt
known authoritative references
correlationId
```

Mas não:

```text
deposit amount
payment values
refund values
credit values
```

Esses continuam sendo responsabilidade do Billing.

---

# 7. Builder deve produzir estado, policy produz decisão

Separar duas etapas:

```text
FinancialDecisionState
```

representa:

```text
Deposit
Receivable
Payments
```

e:

```text
FinancialDecisionSnapshotV2
```

representa:

```text
state
+
policy
+
exact disposition
+
exact allocations
+
fingerprint
```

Essa distinção evita misturar leitura financeira com regra comercial.

---

# 8. Corrigir `depositId`

Esse é um blocker explícito.

Se uma disposition usa o sinal:

```text
RETURN
RETAIN
CONVERT_TO_CREDIT
```

o snapshot obrigatoriamente precisa conter:

```text
deposit.id
deposit.status
deposit.amountCents
deposit.version
```

---

# 9. Não permitir `depositDisposition != NONE` com `deposit=null`

Criar invariante:

```text
depositDisposition != NONE
AND deposit == null
→ INVALID_SNAPSHOT
```

Esse estado nunca deve sair como `READY`.

---

# 10. Resolver o Deposit por referência autoritativa

Pesquisar o modelo atual:

```bash
grep -R "depositId" apps libs database -n
grep -R "appointment_id" apps/billing-worker/src/deposits database -n
```

Se Deposit é fisicamente único por Appointment e isso está garantido por constraint, o builder pode resolver pelo relacionamento canônico.

Mas o snapshot final deve sempre congelar:

```text
depositId
```

---

# 11. Se houver mais de um Deposit possível

Não escolher:

```text
latest
first confirmed
highest amount
```

sem contrato.

Nesse caso:

```text
FINANCIAL_STATE_INCONSISTENT
```

---

# 12. Componente de crédito precisa ser explícito

Hoje o snapshot ainda não contém componentes suficientes.

Criar algo equivalente a:

```text
CreditDecision {
  amountCents

  sources: FinancialCreditSource[]
}
```

---

# 13. `FinancialCreditSource`

Pode ser:

```text
sourceType: DEPOSIT | PAYMENT
sourceId
sourceVersion
amountCents
```

Somente fontes reais.

---

# 14. Invariante do crédito

```text
creditDecision.amountCents
=
sum(creditDecision.sources.amountCents)
```

Sempre.

---

# 15. Não criar crédito sobre outstanding balance

Crédito interno representa dinheiro já recebido/convertível.

Não usar:

```text
Receivable outstanding
```

como fonte de crédito.

---

# 16. Se crédito vier do Deposit

Snapshot:

```text
sourceType = DEPOSIT
sourceId = depositId
sourceVersion = deposit.version
amount = ...
```

---

# 17. Se crédito vier de Payments

Usar Payment IDs específicos.

Não:

```text
sourceType=PAYMENTS
amount=5000
```

sem dizer quais.

---

# 18. Componente de retenção

Criar estrutura explícita:

```text
RetentionDecision {
  sources: [...]
  totalAmountCents
}
```

No MVP provavelmente a retenção financeira efetiva será principalmente do Deposit.

---

# 19. Para Deposit RETAIN

Snapshot precisa conter:

```text
depositId
version
amountCents
```

e:

```text
retention.totalAmountCents
```

coerente.

---

# 20. Payment RETAIN não necessariamente gera mutation

Como o Payment já foi recebido, `RETAIN` pode ser uma decisão histórica de:

```text
não reembolsar
```

Então não crie um movement monetário positivo duplicado.

O snapshot só precisa explicitar que:

```text
refund allocation = 0
```

para aquele Payment.

---

# 21. Integrar `PaymentRefundDecision[]`

O builder já produz:

```text
paymentId
original amount
refundable amount
allocated amount
version
already refunded
```

Agora isso deve ir integralmente para o snapshot utilizado pelo evaluator.

---

# 22. Não reduzir isso a total agregado

Não transformar:

```text
[
 P1 → 3000,
 P2 → 2000
]
```

em:

```text
refundTotal=5000
```

e descartar a distribuição.

O consumer futuro depende da distribuição congelada.

---

# 23. Allocation determinística já implementada

Foi escolhida:

```text
received_at ASC
id ASC
```

Agora documentar formalmente essa regra no plano/ADR.

---

# 24. Essa regra precisa virar contrato histórico

A partir deste PR, o comportamento:

```text
oldest payment first
```

passa a ser semântica financeira do sistema.

Não alterar posteriormente sem ADR/migration/versão de policy adequada.

---

# 25. Testar allocation simples

Payments:

```text
P1 refundable 4000
P2 refundable 6000
```

Requested:

```text
5000
```

Expected:

```text
P1 allocated 4000
P2 allocated 1000
```

---

# 26. Testar allocation exata

Requested:

```text
10000
```

Expected:

```text
4000 + 6000
```

---

# 27. Testar insufficient refundable amount

Requested:

```text
11000
```

Expected:

```text
BLOCKED
INSUFFICIENT_REFUNDABLE_AMOUNT
```

Nenhuma allocation parcial marcada como READY.

---

# 28. Testar Payments com mesmo `received_at`

O desempate precisa ser:

```text
id ASC
```

e produzir resultado determinístico.

---

# 29. Fingerprint deve incluir as novas estruturas

Atualizar o documento canônico do hash para incluir:

```text
deposit identity/version
receivable identity/version
PaymentRefundDecision[]
credit sources
retention sources
policy id/version
dispositions
```

---

# 30. Não incluir campos transitórios

Excluir:

```text
requestId
correlationId
traceId
evaluatedBy
```

do fingerprint, a menos que façam parte de business identity, o que não parece necessário.

---

# 31. Integrar fingerprint ao snapshot final

O builder deve:

```text
build snapshot without fingerprint
↓
canonicalize
↓
hash
↓
attach financialFingerprint
```

Não aceitar fingerprint vindo de caller.

---

# 32. Atualizar `ValidateFinancialDecisionSnapshot`

Esse é o terceiro blocker explícito.

Pipeline:

```text
validate structural invariants
↓
rebuild canonical fingerprint from snapshot
↓
compare with supplied fingerprint
↓
resolve current financial entities
↓
compare versions/state
```

---

# 33. Diferenciar fingerprint inválido de stale state

Se o snapshot foi adulterado:

```text
INVALID
FINANCIAL_FINGERPRINT_MISMATCH
```

Se o snapshot é internamente válido, mas banco mudou:

```text
STALE
DEPOSIT_VERSION_CHANGED
```

Isso é importante.

---

# 34. Não classificar tampering como `STALE`

`STALE` significa:

```text
era válido, estado mudou
```

Fingerprint mismatch significa:

```text
snapshot não é confiável
```

---

# 35. Validation order

Sugestão:

```text
1. structural validation
2. fingerprint validation
3. tenant/source validation
4. current entity lookup
5. version/value stale validation
```

Evita gastar reads com snapshot estruturalmente inválido.

---

# 36. Payment version em Refund

Esse é outro blocker explícito.

`IssueRefund` hoje precisa passar a incrementar:

```text
payments.version
```

sempre que:

```text
refunded_amount_cents
```

muda.

---

# 37. CAS recomendado

Conceitualmente:

```sql
UPDATE payments
SET
  refunded_amount_cents = refunded_amount_cents + ?,
  version = version + 1
WHERE tenant_id = ?
  AND id = ?
  AND version = ?
  AND amount_cents - refunded_amount_cents >= ?
```

Se o current `IssueRefund` não usa expected version em operações manuais, pelo menos:

```text
version++
```

deve ocorrer.

---

# 38. Não quebrar Refund concurrency já aprovado

Regression obrigatória:

```text
refund concorrente
over-refund
idempotency
```

continuam passando.

---

# 39. Payment version precisa estar em todos os adapters

Atualizar:

```text
domain Payment
D1 mapper
repository
fixtures
test builders
RPC/read models
```

Não apenas SQL.

---

# 40. Builder pós-refund

Antes:

```text
Payment version=1
refunded=0
```

Após:

```text
IssueRefund 2000
```

Expected:

```text
version=2
refunded=2000
```

Novo snapshot precisa refletir ambos.

---

# 41. Validator stale Payment

Snapshot antigo:

```text
version=1
```

Banco:

```text
version=2
```

Resultado:

```text
STALE
PAYMENT_VERSION_CHANGED
```

---

# 42. Mesmo se refundable coincidentemente for igual

Version mismatch ainda deve sinalizar mudança financeira relevante.

---

# 43. Integrar builder a Cancellation

Fluxo final do evaluation:

```text
Operations
↓
Billing.evaluateAppointmentCancellationFinancials
↓
load cancellation policy
↓
BuildFinancialDecisionSnapshot
↓
derive exact disposition/allocation
↓
assert snapshot invariants
↓
fingerprint
↓
READY(snapshot)
```

---

# 44. No `READY` sem builder

Eliminar qualquer caminho:

```text
READY({
 depositDisposition,
 refundAmount
})
```

sem snapshot completo.

---

# 45. Integrar builder a No-show

Mesmo pipeline.

A diferença deve ficar na policy:

```text
CancellationPolicy
vs
NoShowPolicy
```

não na resolução financeira.

---

# 46. Compartilhar `BuildFinancialDecisionSnapshot`

Não duplicar:

```text
BuildCancellationSnapshot
BuildNoShowSnapshot
```

a menos que só sejam wrappers finos.

---

# 47. Snapshot da policy

Incluir:

```text
policyId
policyVersion
policyType
```

para explicação histórica.

---

# 48. Persistência no evento Operations

Quando Billing retorna `READY`, o Operations já cria:

```text
AppointmentCanceled
AppointmentNoShowRecorded
```

O payload deve carregar **o snapshot V2 completo**.

---

# 49. Não salvar apenas fingerprint no Operations

Fingerprint sozinho não permite executar a decisão.

Precisamos do:

```text
snapshot completo
+
fingerprint
```

---

# 50. Snapshot pode aumentar Outbox payload

Mas ainda é pequeno e bounded:

```text
1 deposit
1 receivable
N payments daquele receivable
```

Para MVP isso é aceitável.

---

# 51. Ainda assim limitar N

Um Receivable não deveria ter milhares de Payments no MVP, mas definir um limite defensivo.

Algo como:

```text
MAX_FINANCIAL_SNAPSHOT_PAYMENTS
```

configurável.

---

# 52. Se exceder

Não truncar.

Retornar:

```text
FINANCIAL_SNAPSHOT_TOO_LARGE
```

ou capability blocked.

---

# 53. Free-tier e payload safety

Isso evita:

```text
huge Outbox payload
large D1 row
excessive Worker memory
```

---

# 54. Não colocar Ledger no snapshot

Mesmo se muitos Payments existirem.

Ledger continua fora.

---

# 55. Snapshot replay stability

Teste obrigatório:

```text
Cancel request K1
→ snapshot F1
```

Mude:

```text
Payment version
policy version
```

Depois:

```text
replay K1
```

Expected:

```text
original result
original snapshot
F1
```

---

# 56. Isso precisa vir da Idempotency foundation

Não reexecutar Billing evaluation no replay.

Se hoje o bridge reexecuta antes de consultar idempotency, corrigir a ordem.

---

# 57. Ordem correta da mutação HTTP

Idealmente:

```text
validate request
↓
idempotency lookup
↓
replay?
  yes → return stored response
  no  → evaluate financials
        ↓
        mutate
```

Evita RPC Billing desnecessário no replay.

---

# 58. Tenant isolation do builder

Criar provas:

```text
Appointment Tenant A
Deposit Tenant B
```

→ `BLOCKED/INVALID`.

---

# 59. Receivable cross-tenant

Mesmo.

---

# 60. Payment cross-tenant

Mesmo se IDs forem fornecidos por fixture alterada:

```text
INVALID_FINANCIAL_STATE
```

---

# 61. Cross-customer Payments

Tenant igual, customer diferente:

```text
BLOCKED
```

---

# 62. Payment de outro Receivable

Mesmo customer, outro Receivable:

```text
BLOCKED
```

---

# 63. Testes físicos do builder

Criar/expandir:

```text
test/workers/financial-decision-builder.spec.ts
```

Cobrir D1 real.

---

# 64. Teste cancel sem financeiro

Fixture:

```text
Deposit = none
Receivable = none
Payments = []
Policy = no financial effect
```

Expected:

```text
READY
snapshot sources empty
fingerprint valid
```

---

# 65. Não bloquear todo cancelamento por ausência de dinheiro

Somente quando a policy demanda uma source inexistente.

---

# 66. Teste policy RETURN sem Payment refundable

Se policy exige refund e não há source:

```text
BLOCKED
```

Não:

```text
READY refund=0
```

salvo se policy explicitamente decidiu zero.

---

# 67. Teste credit com Deposit

Expected:

```text
depositId
version
credit source DEPOSIT
credit total exact
```

---

# 68. Teste retain com Deposit

Expected:

```text
retention source DEPOSIT
```

---

# 69. Teste mixed state

Deposit:

```text
3000
```

Payments:

```text
P1 5000
P2 2000
```

Policy pode, se suportado, decidir:

```text
retain deposit
refund payments
```

Snapshot deve conseguir representar ambos sem ambiguidade.

---

# 70. Se current policy não suporta mixed disposition

Não criar no PR apenas para teste.

---

# 71. Stale decision physical suite

Criar:

```text
test/workers/financial-decision-stale.spec.ts
```

Agora ela deve testar snapshot real produzido pelo builder, não fixtures montadas manualmente.

---

# 72. Stale Deposit

```text
builder → deposit version 2
Deposit transition → version 3
validator(snapshot)
→ STALE
```

---

# 73. Stale Receivable

```text
builder → receivable version 5
RegisterPayment → version 6
validator
→ STALE
```

---

# 74. Stale Payment

```text
builder → P1 version 1
IssueRefund → P1 version 2
validator
→ STALE
```

---

# 75. Fingerprint corruption

Pegar snapshot real e alterar:

```text
refundAmount
```

Resultado:

```text
INVALID
FINANCIAL_FINGERPRINT_MISMATCH
```

---

# 76. Recompute fingerprint maliciously in test?

Se o teste recalcula fingerprint com valores manipulados, então o fingerprint passa, mas entity/version validation deve impedir inconsistência quando valores não correspondem ao estado.

Isso é bom para testar defesa em profundidade.

---

# 77. Builder determinism suite

Criar:

```text
test/workers/financial-snapshot-determinism.spec.ts
```

ou unit test suficiente.

---

# 78. Mesma state → mesmo fingerprint

Mesmo se D1 retornar Payments em ordem diferente, builder deve ordenar.

---

# 79. Payment order no query

Ainda assim ordenar no application/domain.

Não depender apenas do SQL `ORDER BY` para canonical hash.

Use ambos:

```text
ORDER BY received_at, id
+
application canonical sort
```

para defesa.

---

# 80. Atualizar `ValidateFinancialDecisionSnapshot` RPC

O RPC já existe:

```text
validateFinancialDecisionSnapshot
```

Agora prova física:

```text
snapshot real builder
→ VALID
```

depois:

```text
refund
→ STALE
```

---

# 81. Não ativar consumers neste PR

Mesmo com validator pronto.

O relatório deve terminar:

```text
FinancialDecisionReady = PASS
FinancialConsumers = BLOCKED
```

Isso é deliberado.

---

# 82. Não criar `IssueRefund` calls no consumer ainda

O próximo PR fará isso.

Neste PR, no máximo, consumer continua retornando:

```text
FINANCIAL_CONSUMER_NOT_ACTIVATED
```

ou permanece não roteado.

---

# 83. Evitar partial activation

Não ativar:

```text
RETAIN
```

só porque é mais simples, deixando:

```text
RETURN/CREDIT
```

bloqueados.

Melhor ativar todos juntos no PR-26.5 depois do gate de autoridade.

---

# 84. Atualizar contracts versionadamente

Como `FinancialDecisionSnapshotV2` já existe, evitar mudar silenciosamente seu shape sem ajustar:

```text
shared contract
producer
consumer
tests
docs
```

---

# 85. Se necessária evolução V3

Só criar `V3` se V2 já foi externalizado/estabilizado e mudança é incompatível.

Se V2 ainda está interno a essa sequência, completar V2 é melhor.

---

# 86. Migration `0026`?

Não necessariamente.

A única mudança física provável é:

```text
payments.version
```

que já entrou no `0025`.

Talvez precise de:

```text
appointment deposit/receivable refs
```

mas só após inspeção.

Não criar nova migration vazia.

---

# 87. Query plan

Validar:

```text
Deposit by tenant + appointment/ref
Receivable by tenant + source/ref
Payments by tenant + receivable
```

---

# 88. Payments query index

Ideal:

```text
payments(
  tenant_id,
  receivable_id,
  received_at,
  id
)
```

Mas verificar query plan antes de adicionar índice.

---

# 89. Não indexar `refunded_amount_cents` isoladamente

Provavelmente desnecessário.

---

# 90. Observabilidade

Builder:

```text
operation=BuildFinancialDecisionSnapshot
source=CANCELLATION|NO_SHOW
result=READY|BLOCKED|INVALID
paymentsCount
```

`paymentsCount` como campo de log, não metric label.

---

# 91. Métricas

```text
financial_snapshot.build.ready
financial_snapshot.build.blocked
financial_snapshot.invalid
financial_snapshot.stale
```

Low-cardinality.

---

# 92. Não logar allocations completas em produção

Refund allocation é dado financeiro.

Pode existir em Audit/snapshot, não em log normal.

---

# 93. Gate de allocation

Adicionar:

```bash
npm run test:financial-refund-allocation
```

Cobrir:

```text
one payment
multiple payments
partial prior refund
same received_at
insufficient amount
deterministic ordering
```

---

# 94. Gate de builder

```bash
npm run test:financial-decision-builder
```

---

# 95. Gate stale

```bash
npm run test:financial-decision-stale
```

---

# 96. Gate snapshot determinism

```bash
npm run test:financial-snapshot-determinism
```

---

# 97. Gate agregado

Criar:

```bash
npm run gate:financial-decision-authority
```

Com:

```text
builder unit tests
physical builder tests
allocation
fingerprint
validator
stale
tenant isolation
cancel snapshot
no-show snapshot
idempotency replay
```

---

# 98. Gate final

```bash
npm run gate:pr26.4.1
```

ou, se quiser manter numeração linear de Git/PR:

```text
PR-26.4 continuation
```

Mas como o PR-26.4 já foi relatado como parcialmente implementado, **eu prefiro nomear o próximo como PR-26.4.1** para não fingir que o gate anterior fechou toda a etapa.

---

# 99. `gate:pr26.4.1`

Idealmente:

```text
gate:pr26.4
+
gate:financial-decision-authority
+
dry-runs
```

---

# 100. Readiness intermediário

Atualizar:

```text
docs/plans/appointment-change-readiness.md
```

Com:

```text
FinancialDecisionReady = PASS
```

somente se:

```text
BuilderIntegrated              PASS
DepositIdentity                PASS
ReceivableIdentity             PASS
PaymentIdentity                PASS
PaymentVersions                PASS
RefundAllocation               PASS
CreditComponents               PASS
RetentionComponents            PASS
Fingerprint                    PASS
FingerprintValidation          PASS
TenantIsolation                PASS
StaleDetection                 PASS
ReplaySnapshotStability        PASS
ConsumerNeedsInference         FALSE
```

---

# 101. E continuar explicitamente

```text
FinancialConsumers = BLOCKED
AppointmentChangeReady = BLOCKED
```

Não marcar o fluxo completo como pronto prematuramente.

---

# 102. Definition of Done — Builder integration

```text
[ ] cancellation evaluation uses builder

[ ] no-show evaluation uses builder

[ ] old financial inference path removed

[ ] builder unavailable → BLOCKED

[ ] READY comes only from builder-backed snapshot
```

---

# 103. Definition of Done — Deposit

```text
[ ] depositId present when required

[ ] status present

[ ] amount present

[ ] version present

[ ] tenant/customer relationship validated

[ ] none vs unresolved distinguished
```

---

# 104. Definition of Done — Receivable

```text
[ ] explicit identity

[ ] version

[ ] status

[ ] paid/outstanding amounts

[ ] standard/package absence semantics

[ ] customer/source consistency
```

---

# 105. Definition of Done — Payments

```text
[ ] eligible Payments bounded

[ ] explicit IDs

[ ] versions

[ ] original amount

[ ] already refunded

[ ] refundable amount

[ ] exact allocated amount

[ ] fully refunded excluded
```

---

# 106. Definition of Done — Refund allocation

```text
[ ] deterministic ordering

[ ] received_at ASC

[ ] id ASC tie-break

[ ] total allocated = requested

[ ] allocation <= refundable per Payment

[ ] insufficient funds → BLOCKED

[ ] consumer requires no allocation logic
```

---

# 107. Definition of Done — Credit

```text
[ ] exact credit amount

[ ] explicit source components

[ ] source IDs

[ ] source versions

[ ] sum components = total credit

[ ] no credit from unknown financial state
```

---

# 108. Definition of Done — Retain

```text
[ ] explicit retained source

[ ] Deposit ID/version when applicable

[ ] amount explicit

[ ] no implicit source selection
```

---

# 109. Definition of Done — Fingerprint

```text
[ ] canonical payload

[ ] SHA-256

[ ] Payments canonical ordering

[ ] policy id/version included

[ ] financial allocations included

[ ] same state → same fingerprint

[ ] relevant mutation → different fingerprint

[ ] transient metadata excluded
```

---

# 110. Definition of Done — Validator

```text
[ ] recomputes fingerprint

[ ] mismatch → INVALID

[ ] Deposit version mismatch → STALE

[ ] Receivable mismatch → STALE

[ ] Payment version mismatch → STALE

[ ] refundable amount mismatch → STALE

[ ] tenant mismatch → INVALID

[ ] incomplete snapshot → INVALID
```

---

# 111. Definition of Done — Payment version lifecycle

```text
[ ] Refund increments Payment.version

[ ] refund CAS remains safe

[ ] concurrent refund regression PASS

[ ] builder observes new version

[ ] validator detects stale old Payment
```

---

# 112. Definition of Done — Cancellation

```text
[ ] READY snapshot includes every executable source

[ ] AppointmentCanceled persists full V2 snapshot

[ ] same Idempotency-Key replay returns original snapshot

[ ] policy changes after cancellation do not change snapshot
```

---

# 113. Definition of Done — No-show

```text
[ ] same authoritative financial builder

[ ] full executable snapshot

[ ] no duplicate financial discovery implementation

[ ] replay snapshot stable
```

---

# 114. Definition of Done — Tenant isolation

```text
[ ] cross-tenant Deposit blocked

[ ] cross-tenant Receivable blocked

[ ] cross-tenant Payment blocked

[ ] cross-customer Payment blocked

[ ] Payment from wrong Receivable blocked
```

---

# 115. Definition of Done — Free Tier

```text
[ ] one bounded Deposit read

[ ] one bounded Receivable read

[ ] one bounded Payments query

[ ] no Ledger scan

[ ] no KV

[ ] no Queue

[ ] no R2

[ ] no Cron
```

---

# 116. Regression

Rodar obrigatoriamente:

```text
PR24
PR25
PR26
PR26.1
PR26.2
PR26.3
PR26.4

Payment concurrency
Refund concurrency
Package readiness
```

Todos permanecem verdes.

---

# 117. Comandos finais

```bash
npm run lint
npx tsc --build --force

npm run test
npm run test:workers

npm run test:financial-refund-allocation
npm run test:financial-decision-builder
npm run test:financial-decision-snapshot
npm run test:financial-decision-stale
npm run test:financial-snapshot-determinism

npm run gate:pr26.4
npm run gate:financial-decision-authority
npm run gate:pr26.4.1

npm run workers:dry-run
git diff --check
```

Tudo:

```text
PASS
```

---

# 118. Relatório pós-implementação esperado

O Codex deve terminar aproximadamente assim:

```text
PR-26.4.1 — Financial Decision Builder Integration

Baseline
PR26.4:

Builder Integration
cancellation:
no-show:
legacy inference path:

Deposit
resolution:
id:
status:
amount:
version:
none-vs-unresolved:

Receivable
id:
status:
paid:
outstanding:
version:

Payments
eligible count:
ordering:
versions:
refundable:
allocations:

Refund Allocation
strategy:
requested:
available:
allocated:
insufficient:

Credit
amount:
sources:
versions:

Retention
source:
amount:
version:

Payment Version
refund increment:
concurrency regression:

Fingerprint
canonicalization:
SHA-256:
determinism:
mutation sensitivity:

Validator
fingerprint:
deposit stale:
receivable stale:
payment stale:
tenant invalid:
incomplete snapshot:

Cancellation Snapshot
READY completeness:
outbox payload:
idempotency replay:
policy version:

NoShow Snapshot
READY completeness:
outbox payload:
replay:

Physical D1
builder:
queries:
query plans:

Tenant Isolation
deposit:
receivable:
payments:
customer:
receivable relation:

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
PR26.4:

Quality
unit:
workers:
allocation:
builder:
snapshot:
stale:
determinism:
lint:
typecheck:
dry-runs:
gate:

Remaining blockers:

Next PR:
```

# Próximo PR depois disso

Se o resultado for:

```text
FinancialDecisionReady = PASS
FinancialConsumers = BLOCKED
```

aí sim o próximo PR deve ser:

# PR-26.5 — Financial Consumer Activation + RETURN / RETAIN / CREDIT Qualification

E nesse PR o consumer poderá ser deliberadamente simples em termos de decisão:

```text
receive frozen snapshot
        ↓
validate fingerprint + versions
        ↓
VALID?
        ├── no → reconciliation
        └── yes
             ↓
execute exact mutations
```

O consumer **não decidirá**:

```text
qual Deposit?
qual Receivable?
qual Payment?
quanto devolver?
de qual Payment retirar?
quanto creditar?
o que reter?
```

Tudo isso já virá congelado pelo PR-26.4.1.

Esse é o melhor próximo passo porque o projeto já construiu corretamente as peças isoladas. O que falta agora é torná-las uma única cadeia autoritativa: **builder → evaluator → snapshot V2 completo → fingerprint → validator**. Só depois disso Refund/Credit/Retain podem ser ativados sem voltar a introduzir inferência financeira no momento mais crítico do fluxo.
