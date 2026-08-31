Com o **PR-22 concluído**, o próximo PR deve fechar a próxima parte explícita de `RN-CONC-002`: **pacotes e consumo de sessão**.

A documentação normativa determina que um pacote possua cliente, serviço, quantidade, valores, validade, saldo e status; que uma unidade só seja consumida quando a sessão for concluída; que o saldo nunca fique negativo; que a mesma sessão não possa consumir duas unidades; e que cada consumo seja rastreável até uma sessão específica.  A proposta técnica também já posiciona `packages`, `customer_packages` e `package_movements` como entidades próprias e inclui `package_movements` na operação lógica de conclusão de sessão.

# PR-23 — Packages + Customer Packages + Idempotent Session Consumption

O objetivo do PR é chegar a:

```text
Package
  │
  ├── ACTIVE
  │
  ├── balance > 0
  │
  └── valid
          │
          ▼
CustomerPackage
          │
          ▼
SessionCompleted
          │
          ▼
ConsumePackageUnit
          │
          ├── PackageMovement
          ├── balance - 1
          ├── Audit
          ├── Timeline
          └── Idempotency
```

com a propriedade fundamental:

```text
same SessionCompleted
delivered 1x, 2x or 10x
        ↓
package consumption = exactly 1 logical unit
```

Este PR **não deve ainda implementar Payment/Ledger completo**.

---

## 1. Baseline obrigatória

Antes de alterar código:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr20
npm run gate:pr21
npm run gate:pr22
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

Todos os gates anteriores precisam permanecer verdes.

---

# 2. Criar o plano formal

Criar:

```text
docs/plans/PR-23-packages-session-consumption.md
```

O documento deve congelar:

```text
Objective
Scope

Package ownership
Package vs CustomerPackage
Package lifecycle
Commercial snapshots
Purchase/materialization boundary

Session association
Consumption eligibility
Package selection
Package movements

Idempotency
Concurrency
Balance protection

SessionCompleted integration
Outbox / RPC
Timeline
Audit

Expiration
Cancellation
Historical integrity

Cloudflare Free constraints

Tests
Definition of Done
Out of scope
```

---

# 3. Decidir corretamente o ownership

A fronteira mais coerente com o desenho atual é:

```text
billing-worker
├── CommercialTerms
├── Deposit
├── Package
├── CustomerPackage
└── PackageMovement
```

Pacote envolve:

```text
valor original
desconto
valor final
saldo econômico
```

e posteriormente será origem de Payment.

Portanto, não o colocaria em Clinical.

Operations conhece apenas a referência necessária para agenda/histórico.

---

# 4. Não confundir três conceitos

O PR deve separar:

```text
PackageDefinition
CustomerPackage
PackageMovement
```

Conceitualmente:

```text
PackageDefinition
= oferta/configuração

CustomerPackage
= pacote adquirido por um cliente

PackageMovement
= alteração histórica de saldo
```

A documentação técnica já prevê `packages`, `customer_packages` e `package_movements` separadamente. 

---

# 5. Não criar apenas `Customer.balance`

Seria insuficiente.

Precisamos responder futuramente:

```text
qual pacote?
qual serviço?
qual sessão consumiu?
qual valor foi congelado?
qual validade?
qual saldo anterior/posterior?
```

Por isso `PackageMovement` é obrigatório.

---

# 6. Criar o módulo de Packages no Billing

Se inexistente:

```bash
nest g module packages \
  --project billing-worker
```

Estrutura:

```text
apps/billing-worker/src/packages/
├── domain/
├── application/
├── ports/
└── adapters/
```

---

# 7. Criar `PackageDefinition`

Via CLI:

```bash
nest g class \
  packages/domain/package-definition \
  --project billing-worker \
  --no-spec
```

Campos mínimos, conforme regras efetivamente necessárias:

```text
id
tenantId

serviceId

quantity

basePriceCents
discountCents
finalPriceCents

validity
status

createdAt
updatedAt
```

Não inventar categorias/fidelidade/campanhas neste PR.

---

# 8. O desconto do pacote é congelado

`RN-PAC-007` determina que pacote vendido com desconto não deve receber novo desconto por sessão. 

Portanto:

```text
Package purchased:
base = 100000
discount = 10000
final = 90000
```

Cada sessão posterior:

```text
does NOT call DiscountPolicy again
```

para reduzir outra unidade.

---

# 9. Não recalcular CommercialTerms a cada consumo

Consumo do pacote é:

```text
unit balance movement
```

e não:

```text
new sale
```

Isso precisa ficar explícito no Domain/Application.

---

# 10. Criar `CustomerPackage`

```bash
nest g class \
  packages/domain/customer-package \
  --project billing-worker \
  --no-spec
```

Campos mínimos:

```text
id
tenantId

packageDefinitionId?
customerId
serviceId

totalQuantity
remainingQuantity

basePriceCents
discountCents
finalPriceCents

purchasedAt
validUntil

status

createdAt
updatedAt
```

Se o PackageDefinition puder mudar futuramente, `CustomerPackage` precisa congelar os valores comerciais usados na compra.

---

# 11. Status canônicos

Somente os definidos:

```text
ACTIVE
COMPLETED
EXPIRED
CANCELED
```

Correspondendo a `RN-PAC-002`. 

Não adicionar:

```text
PENDING_PAYMENT
SUSPENDED
PAUSED
REFUNDED
```

sem regra.

---

# 12. Invariantes do CustomerPackage

No Domain:

```text
totalQuantity > 0

0 <= remainingQuantity <= totalQuantity

finalPriceCents >= 0

discountCents <= basePriceCents

ACTIVE + remaining=0
→ invalid / should transition COMPLETED
```

Saldo nunca negativo é obrigatório por `RN-PAC-004`. 

---

# 13. Validity precisa ser explícita

Pode ser:

```text
validUntil
```

no CustomerPackage.

Não recomendo armazenar somente:

```text
validityDays
```

porque o pacote adquirido precisa ter uma data histórica concreta de validade.

Pode preservar ambos se necessário:

```text
validityRuleSnapshot
validUntil
```

---

# 14. PackageDefinition não pode alterar pacote comprado

Se:

```text
PackageDefinition v1
quantity = 10

customer buys
→ CustomerPackage quantity=10
```

e depois definição vira:

```text
quantity=8
```

o pacote comprado continua:

```text
10
```

É a mesma política de congelamento já usada em Appointment e Session.

---

# 15. Criar `PackageMovement`

```bash
nest g class \
  packages/domain/package-movement \
  --project billing-worker \
  --no-spec
```

Campos:

```text
id
tenantId

customerPackageId
customerId

type
quantity

balanceBefore
balanceAfter

sessionId?
appointmentId?

sourceEventId
occurredAt
createdBy/system
```

---

# 16. Tipo inicial de movimento

Neste PR, não inventar dezenas de tipos.

Precisamos obrigatoriamente de:

```text
CONSUMPTION
```

Talvez:

```text
INITIAL_CREDIT
```

se a criação do CustomerPackage usar movement para inicializar saldo.

Isso é uma boa prática, mas avalie o modelo real.

Não criar:

```text
TRANSFER
MANUAL_ADJUSTMENT
REFUND
BONUS
```

sem use cases concretos.

---

# 17. PackageMovement deve ser append-only

Nunca:

```text
UPDATE quantity
DELETE movement
```

normalmente.

Correções futuras devem gerar movimento compensatório.

Isso alinha o pacote à rastreabilidade financeira do restante do projeto.

---

# 18. Migration `0017`

Se `0016` é a última migration real:

```text
database/d1/migrations/
0017_packages_session_consumption.sql
```

Possíveis tabelas:

```text
package_definitions
customer_packages
package_movements
```

e, se necessário:

```text
session_package_links
```

mas eu tentaria evitar tabela extra quando `package_movements.session_id` já fornece a rastreabilidade necessária.

---

# 19. Constraints importantes

`customer_packages`:

```text
remaining_quantity >= 0
remaining_quantity <= total_quantity
```

`package_movements`:

```text
quantity > 0
```

e para evitar consumo duplicado:

```text
UNIQUE (
  tenant_id,
  customer_package_id,
  session_id,
  movement_type
)
```

quando `session_id` estiver presente.

---

# 20. Essa constraint é extremamente importante

`RN-PAC-005` diz:

> a mesma sessão não poderá consumir duas unidades. 

Não confie apenas em `Idempotency-Key`.

Porque duas chamadas com:

```text
different idempotency keys
same session
```

também não podem consumir duas vezes.

Precisamos de uma **invariante física de negócio**.

---

# 21. Criar repositories

Via CLI/convenção:

```bash
nest g interface \
  packages/ports/customer-package-repository \
  --project billing-worker

nest g interface \
  packages/ports/package-movement-repository \
  --project billing-worker
```

Se Definition for persistente:

```bash
nest g interface \
  packages/ports/package-definition-repository \
  --project billing-worker
```

---

# 22. D1 adapters

Criar providers:

```bash
nest g provider \
  packages/adapters/d1-customer-package-repository \
  --project billing-worker

nest g provider \
  packages/adapters/d1-package-movement-repository \
  --project billing-worker
```

Tenant-aware sempre.

---

# 23. Não consultar Operations D1 diretamente

Billing recebe:

```text
customerId
serviceId
sessionId
```

por contrato/evento.

Não:

```sql
SELECT * FROM sessions
```

dentro do Billing.

---

# 24. Como criar CustomerPackage?

Há uma lacuna importante.

A documentação define os dados do pacote, mas o fluxo de compra e pagamento ainda não está implementado.

Portanto o PR deve separar:

```text
Package configuration/materialization
```

de:

```text
payment settlement
```

---

# 25. Não fingir que pacote foi pago

Podemos criar o fundamento para:

```text
CreateCustomerPackage
```

mas não declarar:

```text
paid
```

ou criar ledger.

O pagamento real será PR-24.

---

# 26. Opção mais segura para PR-23

Implementar:

```text
CreatePackageDefinition
MaterializeCustomerPackage
ConsumePackageUnit
```

com materialização autorizada/manual para testes e futuros fluxos.

Documentar:

```text
CustomerPackage financial acquisition settlement
= pending PR-24
```

---

# 27. Criar `CreatePackageDefinition`

```bash
nest g service \
  packages/application/create-package-definition \
  --project billing-worker
```

Valida:

```text
tenant
service
quantity
commercial terms
validity
```

---

# 28. PackageDefinition e Service

Billing precisa validar `serviceId`.

Use:

```text
ServiceCommercialContext
```

ou um contrato pequeno Operations→Billing já existente.

Não compartilhar Service entity.

---

# 29. Criar `MaterializeCustomerPackage`

```bash
nest g service \
  packages/application/materialize-customer-package \
  --project billing-worker
```

Este use case recebe uma venda/autorização já decidida.

Mas não deve inventar a origem financeira.

Uma request pode exigir:

```text
sourceOperationId
```

para permitir futuro vínculo a Payment.

---

# 30. Idempotência da materialização

Same logical package purchase:

```text
same source operation
```

não pode criar dois CustomerPackages.

Criar proteção adequada.

---

# 31. CustomerPackage começa ACTIVE?

Somente se a regra de materialização significa pacote adquirido/ativado.

Como Payment ainda não existe, documente claramente a semântica.

Se não houver autoridade para ativação antes do pagamento, melhor que o endpoint administrativo de PR-23 seja interno/test-only ou capability foundation.

---

# 32. Não inventar `PENDING` no enum

Como `RN-PAC-002` só define quatro estados, não adicionar `PENDING_PAYMENT` apenas para resolver arquitetura.

Melhor manter:

```text
materialization occurs only after an external/authorized acquisition decision
```

e PR-24 fará o comando real de venda.

---

# 33. Agora o núcleo: `ConsumePackageUnit`

Criar:

```bash
nest g service \
  packages/application/consume-package-unit \
  --project billing-worker
```

Esse é o caso de uso principal do PR.

---

# 34. Input conceitual

```text
tenantId
customerPackageId
sessionId
customerId
serviceId
sourceEventId
correlationId
```

Não receber:

```text
balanceAfter
```

do caller.

Não receber:

```text
quantity=5
```

se cada sessão consome exatamente uma unidade conforme o MVP.

---

# 35. Antes de consumir

Validar:

```text
package exists
tenant matches
customer matches
service matches
status ACTIVE
not expired
remainingQuantity > 0
session not previously consumed
```

---

# 36. Service compatibility

`RN-PAC-001` associa Package a um serviço. 

Logo:

```text
CustomerPackage.serviceId = Service A

SessionCompleted Service B
→ cannot consume
```

---

# 37. Customer compatibility

Mesmo:

```text
Package Customer A
Session Customer B
→ blocked
```

---

# 38. Package expired

Se:

```text
validUntil < now
```

não consumir.

O status pode precisar convergir para:

```text
EXPIRED
```

mas não crie Cron agora.

O use case pode:

```text
detect expired
→ mark EXPIRED through CAS
→ return blocked
```

quando acessado, se essa semântica estiver documentada.

---

# 39. Não depender do status estar atualizado

Mesmo se package ainda está:

```text
ACTIVE
```

mas:

```text
validUntil < now
```

consumo deve ser bloqueado.

Data é autoridade adicional.

---

# 40. Saldo 0

Se:

```text
remainingQuantity = 0
```

não consumir.

Se status ainda `ACTIVE`, pode ser inconsistência/reconciliation.

Não deixar ficar negativo.

---

# 41. CAS de consumo

Esta é a primitive central.

Conceitualmente:

```sql
UPDATE customer_packages
SET
  remaining_quantity = remaining_quantity - 1,
  status = CASE
    WHEN remaining_quantity - 1 = 0
      THEN 'COMPLETED'
    ELSE status
  END,
  updated_at = ?
WHERE tenant_id = ?
  AND id = ?
  AND status = 'ACTIVE'
  AND remaining_quantity > 0
  AND valid_until >= ?
```

Depois:

```text
changes = 1
```

define que este consumer venceu.

---

# 42. Movimento precisa estar na mesma UnitOfWork local

A operação deve agrupar:

```text
CustomerPackage decrement
PackageMovement CONSUMPTION
Audit
Idempotency
```

e Timeline/Outbox quando necessário.

---

# 43. Não decrementar antes de garantir unicidade da Session

Há risco:

```text
decrement
↓
movement unique conflict
```

Dependendo da semântica D1 batch, isso precisa ser atomicamente seguro.

A UnitOfWork deve montar os statements de modo que a operação inteira falhe se a session já foi consumida.

---

# 44. Melhor invariável lógica

Primeiro reservar/insertar movement com unique:

```text
tenant + package + session + CONSUMPTION
```

e agrupar com decrement no mesmo batch.

Ou usar operação equivalente comprovadamente atômica.

Não faça check-then-decrement desprotegido.

---

# 45. Concurrency package balance

Package:

```text
remaining = 1
```

Session A e Session B tentam consumir simultaneamente.

Resultado obrigatório:

```text
one success
one PACKAGE_BALANCE_EXHAUSTED
remaining = 0
```

Nunca:

```text
remaining = -1
```

---

# 46. Esse teste é obrigatório

`RN-PAC-004` não é apenas validação de entidade; é propriedade concorrente. 

---

# 47. Same Session concurrent

Package:

```text
remaining = 5
```

Duas requests:

```text
Session X
key A
Session X
key B
```

Resultado:

```text
one logical consumption
remaining = 4
movements = 1
```

---

# 48. Same Idempotency-Key replay

Também:

```text
same response
same movement
same balance
```

---

# 49. Idempotency e business uniqueness são duas proteções diferentes

Preservar:

```text
Idempotency-Key
→ repeated transport/command

UNIQUE session movement
→ repeated business fact
```

Precisamos das duas.

---

# 50. Como selecionar o pacote?

Essa é a decisão mais importante do PR.

`SessionCompleted` pode existir sem pacote.

Logo não podemos:

```text
every SessionCompleted
→ consume any active package automatically
```

sem saber que o Appointment/Session foi financiado por aquele pacote.

---

# 51. Precisamos de vínculo autoritativo antes do consumo

Idealmente:

```text
Appointment
or Session
→ customerPackageId?
```

congelado antes do atendimento.

---

# 52. Não selecionar “primeiro pacote ativo”

Proibido:

```sql
SELECT *
FROM customer_packages
WHERE customer_id=?
AND service_id=?
AND status='ACTIVE'
LIMIT 1
```

e consumir automaticamente sem seleção anterior.

Pode haver múltiplos pacotes.

---

# 53. Criar `PackageConsumptionReference`

Uma forma simples:

```text
Appointment/Session commercial context
customerPackageId?
```

Quando `null`:

```text
SessionCompleted
→ no package consumption
```

Quando definido:

```text
→ ConsumePackageUnit
```

---

# 54. Onde selecionar pacote?

Idealmente na criação/edição do Appointment, antes da Session.

Mas o PR-12 já está concluído.

Não faça refatoração enorme.

---

# 55. Implementação incremental recomendada

PR-23 pode introduzir uma operação explícita antes de StartSession ou antes de completion:

```text
AssignCustomerPackageToAppointment
```

ou:

```text
AttachCustomerPackageToSession
```

---

# 56. Eu prefiro Appointment-level

Porque a escolha é comercial, normalmente ocorre no atendimento/agendamento, não depois da Session.

Fluxo:

```text
Appointment
→ selectedCustomerPackageId
→ SessionStartContext snapshots it
→ Session completion consumes it
```

---

# 57. Porém cuidado com congelamento histórico

Se pacote é associado ao Appointment:

```text
customerPackageId
```

a Session deve receber essa referência em seu start/completion snapshot.

Não consultar Appointment atual depois.

---

# 58. Criar comando `AssignPackageToAppointment`

Ownership pode ser Operations, mas precisa validar Billing.

Fluxo:

```text
Operations
↓
Billing RPC CheckPackageEligibility
↓
READY
↓
Operations stores package reference
```

Isso adiciona escopo.

---

# 59. Alternativa menor

Guardar package reference no Billing com:

```text
appointmentId
```

e resolver no `SessionCompleted`.

Mas Billing ainda precisaria saber qual pacote foi escolhido.

---

# 60. Portanto vale incluir uma foundation de seleção neste PR

Sem isso, “consumo de pacote na conclusão” fica impossível de fazer autoritativamente.

---

# 61. Criar contrato `CheckPackageUsageEligibility`

Billing RPC:

```text
tenantId
customerPackageId
customerId
serviceId
```

Retorna:

```text
READY
BLOCKED
reason
```

---

# 62. Operations endpoint para associação

Pode ser:

```http
POST /tenants/:tenantId/appointments/:appointmentId/package
```

Body:

```json
{
  "customerPackageId": "..."
}
```

Somente enquanto Appointment ainda não estiver `IN_PROGRESS/COMPLETED`.

---

# 63. Permissão

Algo como:

```text
appointment.package.assign
```

ou permissão comercial existente.

Recepção/Admin, não profissional técnico por padrão.

---

# 64. Associação também deve ser tenant-safe

Package:

```text
Tenant A
Customer A
Service A
```

Appointment deve corresponder exatamente.

---

# 65. Não recalcular desconto

Quando pacote é selecionado:

```text
Appointment commercial snapshot
```

precisa refletir que a sessão será coberta por pacote?

A regra diz pacote vendido com desconto não recebe novo desconto por sessão. 

Isso implica que não devemos cobrar novamente a sessão como venda normal.

---

# 66. Essa é uma discrepância com PR-12

PR-12 já congela:

```text
basePrice
discount
finalPrice
deposit
```

na criação do Appointment.

Se um Appointment será coberto por pacote, o CommercialTerms flow provavelmente precisa saber disso **antes** da criação.

---

# 67. Não corrigir silenciosamente agora

Documentar uma decisão de escopo:

> No PR-23, package consumption is supported only when a package reference is already explicitly associated with the operation through the new package-selection flow. Existing Appointments created without package context remain pay-per-session and are not retroactively converted.

---

# 68. Não converter Appointment antigo para pacote depois de concluído

Isso bagunçaria:

```text
commercial snapshots
discount history
financial balance
```

Se precisarmos de conversão futura, deve ser workflow específico.

---

# 69. Pode ser necessário evoluir `CreateAppointment`

Para novos Appointments, aceitar:

```text
paymentSource:
  STANDARD
  PACKAGE
```

ou:

```text
customerPackageId?
```

Mas isso aumenta PR-23.

Ainda assim, é provavelmente necessário para fechar a regra corretamente.

---

# 70. Eu faria a evolução mínima

No request:

```json
{
  "customerId": "...",
  "serviceId": "...",
  "professionalId": "...",
  "startsAt": "...",
  "origin": "...",
  "customerPackageId": "..."
}
```

opcional.

---

# 71. Quando `customerPackageId` ausente

Fluxo PR-12 atual permanece:

```text
CommercialTerms → Billing
```

---

# 72. Quando presente

Primeiro:

```text
CheckPackageUsageEligibility
```

Se READY:

```text
Appointment payment mode = PACKAGE
```

e não aplicar novo discount de sessão.

A semântica financeira exata precisa ser congelada.

---

# 73. Não inventar preço 0 sem contrato

Um Appointment coberto por pacote não necessariamente deve ter:

```text
finalPriceCents = 0
```

como histórico econômico da prestação.

Pode preservar preço de referência e:

```text
settlementMode = PACKAGE
```

Essa é a modelagem mais segura.

---

# 74. Introduzir `settlementSource`

Conceitualmente:

```text
STANDARD
PACKAGE
```

ou nome equivalente.

Esse campo pode precisar de migration no Appointment snapshot.

---

# 75. Se isso não estiver suportado pela documentação

Não inventar sem ADR.

Mas algum vínculo é necessário para evitar desconto duplo e cobrança indevida.

Portanto PR-23 deve registrar uma decisão formal.

---

# 76. Criar ADR

Sugestão:

```text
docs/adr/0012-package-settlement-and-session-consumption.md
```

Congelar:

```text
Package selection occurs before completion.

Package-funded session does not receive a new per-session discount.

Package consumption happens only after SessionCompleted.

SessionCompleted is at-least-once.

Consumption is idempotent by session identity.

No distributed transaction across Clinical/Billing.

Financial settlement remains PR-24.
```

---

# 77. SessionStartContext deve carregar package reference

Operations → Clinical:

```text
customerPackageId?
settlementSource?
```

Então Session congela:

```text
customerPackageId?
```

---

# 78. SessionCompleted event deve carregar referência mínima

Adicionar:

```text
customerPackageId?
```

ao evento.

Não obrigar Billing a consultar Operations/Clinical para descobrir.

---

# 79. Não compartilhar Package entity

Apenas ID/ref.

---

# 80. Routing do `SessionCompleted`

Hoje:

```text
Clinical
→ Operations
```

Para pacote, precisamos também:

```text
Clinical
→ Billing
```

Mas um único Outbox event precisa suportar múltiplos destinations ou efeitos.

---

# 81. Não marcar `SessionCompleted` SENT após apenas Operations

Se ele também precisa chegar ao Billing, o Outbox atual talvez possua destino único.

Isso precisa ser analisado.

---

# 82. Melhor não reutilizar um mesmo event delivery row para dois destinos

Podemos produzir dois integration events no completion:

```text
SessionCompleted
→ Operations

PackageConsumptionRequested
→ Billing
```

quando package reference existir.

Isso mantém delivery semantics simples.

---

# 83. Esse é o desenho recomendado

No Clinical completion local transaction:

```text
Session COMPLETED
Audit
Outbox SessionCompleted
Outbox PackageConsumptionRequested? 
Idempotency
```

Mas PR-21 já foi implementado.

PR-23 pode evoluir CompleteSession para emitir o segundo evento apenas quando `customerPackageId` estiver no snapshot.

---

# 84. Isso não viola o fato de Session já estar concluída

É um efeito pós-completion declarado e recuperável.

Não tentar rollback Clinical se Billing ficar indisponível.

---

# 85. `PackageConsumptionRequested`

Payload mínimo:

```text
eventId
tenantId

sessionId
appointmentId
customerId
serviceId
customerPackageId

completedAt
correlationId
```

---

# 86. Não enviar preços

Billing já possui o CustomerPackage snapshot.

Só precisa da identidade do consumo.

---

# 87. Dispatcher Clinical → Billing

Adicionar route:

```text
PackageConsumptionRequested
→ Billing
```

reutilizando PR-14.

---

# 88. Billing consumer

Criar:

```bash
nest g service \
  packages/application/apply-session-package-consumption \
  --project billing-worker
```

Este coordinator chama:

```text
ConsumePackageUnit
```

com `eventId`.

---

# 89. Consumer é idempotente

Mesmo evento:

```text
one movement
one decrement
```

---

# 90. Se Session não usa package

Nenhum evento `PackageConsumptionRequested`.

Zero writes no Billing.

---

# 91. Se package consumption falhar por transient error

Outbox retry.

---

# 92. Se package está expired/balance 0

Isso é mais delicado.

A Session já está COMPLETED.

Não podemos voltar Session para IN_PROGRESS.

Então o erro precisa virar:

```text
PERMANENT BUSINESS RECONCILIATION REQUIRED
```

Isso mostra por que package eligibility deve ser validada antes da sessão/appointment.

---

# 93. Pré-admission do pacote é obrigatório

Antes de iniciar/atender, pacote precisa estar:

```text
ACTIVE
valid
balance > 0
customer/service matched
```

Mas entre StartSession e CompleteSession o saldo pode mudar por outra Session.

---

# 94. Portanto completion precisa revalidar/consumir autoritativamente

Aqui surge a mesma tensão de consistência distribuída.

Não podemos garantir atomicidade cross-worker no exato `CompleteSession`.

---

# 95. Solução realista para arquitetura atual

Usar:

```text
pre-reservation / reservation of package unit
```

antes de completion.

Isso é mais robusto que tentar consumir depois.

---

# 96. Porém a regra normativa diz “uma unidade somente deverá ser consumida quando a sessão for concluída”

Reserva não é consumo.

Então podemos:

```text
reserve package unit
    ↓
Session active
    ↓
SessionCompleted
    ↓
convert reservation to consumption
```

Mas isso introduz novo lifecycle.

---

# 97. O PR precisa decidir se reserva é necessária

Para o MVP, se uma empresa não tem sessões concorrentes consumindo o mesmo pacote frequentemente, CAS pós-completion pode ser suficiente funcionalmente, mas existe janela de inconsistência com `RN-CONC-002`.

Como estamos construindo um sistema rigoroso, eu recomendo uma **reservation foundation**.

---

# 98. Criar `PackageUnitReservation`

Estados:

```text
RESERVED
CONSUMED
RELEASED
```

Isso é infraestrutura de consistência, não novo status do Package.

---

# 99. Quando reservar?

Ao iniciar a Session ou antes, quando package-funded.

Melhor:

```text
StartSession admission
```

porque nesse momento sabemos que atendimento começou.

---

# 100. Porém isso faria Clinical → Billing RPC antes de Session start

Fluxo:

```text
StartSession
↓
if customerPackageId
Billing.reserveUnit()
↓
READY
↓
Session IN_PROGRESS
```

Mas não segure D1 Clinical transaction durante RPC.

---

# 101. Falha após reserva antes de Session creation

Precisa liberar reserva ou deixá-la expirar/reconciliar.

Complexidade sobe.

---

# 102. Alternativa: reservar no Appointment package assignment

Pode segurar unidade por dias/semanas, ruim.

---

# 103. Para este PR, não introduzir reserva se não for exigida

O escopo pode assumir:

```text
Package consumption is authoritative at SessionCompleted delivery using CAS.
```

E documentar que `RN-CONC-002` ainda não está integralmente fechado por ausência de cross-worker transaction/reservation.

Isso é mais honesto.

---

# 104. O objetivo do PR-23

Fechar **RN-PAC-001..008**, não fingir fechar toda `RN-CONC-002`.

Ao fim:

```text
RN-PAC = PASS
RN-CONC-002 package effect = EVENTUALLY CONSISTENT / QUALIFIED
RN-CONC-002 full = still pending financial
```

---

# 105. Timeline

Quando consumo tiver sucesso, Operations deve receber:

```text
PackageUnitConsumed
```

ou timeline pode ser construída no próprio Billing e depois projetada.

---

# 106. Melhor produzir evento

Billing local commit:

```text
CustomerPackage decrement
PackageMovement
Audit
Outbox PackageUnitConsumed
Idempotency
```

Depois:

```text
Billing → Operations
```

---

# 107. `PackageUnitConsumed` payload

```text
eventId
tenantId

customerPackageId
customerId
sessionId
serviceId

balanceBefore
balanceAfter

correlationId
```

Sem preço completo se não necessário.

---

# 108. Operations timeline consumer

Append:

```text
PACKAGE_CONSUMED
```

ao customer history.

Isso atende a parte de pacotes de `RN-HIS-001`. 

---

# 109. Não atualizar profile por consumo de pacote

`SessionCompleted` já é o fato de relacionamento.

Evitar dupla contagem.

---

# 110. Package status transition

Se:

```text
remainingQuantity after = 0
```

automaticamente:

```text
ACTIVE → COMPLETED
```

na mesma UnitOfWork.

---

# 111. `COMPLETED` package não volta ACTIVE

Sem workflow explícito.

---

# 112. Expiration

Criar policy:

```text
PackageExpiryPolicy
```

Recebe:

```text
status
validUntil
now
```

Se expirado:

```text
cannot consume
```

---

# 113. Não criar Cron ainda

Expiração pode ser lazy:

```text
read/use package
→ detect validUntil < now
```

Uma rotina futura pode materializar status.

Isso mantém Free-first.

---

# 114. Listagem de pacotes do cliente

Endpoint Billing:

```http
GET /tenants/:tenantId/customers/:customerId/packages
```

com filtros:

```text
status
serviceId
cursor
limit
```

---

# 115. Não carregar movements junto de todos os packages

Evitar N+1.

Metadata primeiro.

Movements sob demanda.

---

# 116. Endpoint movimentos

```http
GET /tenants/:tenantId/packages/:customerPackageId/movements
```

paginado.

---

# 117. Endpoint admin de PackageDefinition

Se incluído:

```http
POST /tenants/:tenantId/packages
GET  /tenants/:tenantId/packages
```

Mas cuidado com nomenclatura PackageDefinition vs CustomerPackage.

Talvez:

```text
/package-offers
```

se contracts usarem esse termo.

Não criar API confusa.

---

# 118. Authorization

Separar:

```text
package.configure
package.sell/materialize
package.read
package.consume   // internal only ideally
```

`ConsumePackageUnit` não deve ser endpoint público comum.

Ele deve ser chamado por integration event.

---

# 119. Não permitir recepção chamar consume manualmente

Isso violaria:

```text
consume only when Session completed
```

A menos que exista workflow administrativo futuro.

---

# 120. Package consumption é internal command

No WorkerEntrypoint:

```text
applyPackageConsumptionRequested(...)
```

via Service Binding.

---

# 121. Validate SessionCompleted fact

Billing confia no integration contract/event origin, não em um body público.

O RPC interno não deve aceitar chamadas externas anônimas.

---

# 122. Audit

Eventos:

```text
PackageDefinitionCreated
CustomerPackageMaterialized
PackageUnitConsumed
PackageCompleted
```

conforme ações realmente implementadas.

Audit de consumo:

```text
customerPackageId
sessionId
balanceBefore
balanceAfter
```

Sem dados pessoais desnecessários.

---

# 123. Outbox

Somente fatos cross-worker necessários:

```text
PackageUnitConsumed
```

Talvez:

```text
CustomerPackageCreated
```

se Operations timeline precisar registrar compra de pacote.

A timeline normativa inclui pacotes. 

---

# 124. Se materialização de CustomerPackage for implementada

Emitir:

```text
CustomerPackageCreated
```

para Operations timeline:

```text
PACKAGE_ACQUIRED
```

Mesmo sem Payment liquidado — mas cuidado com nomenclatura. Se “created” significa adquirido, documentar.

---

# 125. Não chamar isso de `PackagePaid`

Payment ainda não existe.

---

# 126. Concurrency test — one remaining unit

Fixture:

```text
remainingQuantity = 1
```

Dois SessionCompleted diferentes.

Expected:

```text
success = 1
balance exhausted = 1

remaining = 0
movements = 1
```

---

# 127. Concurrency test — N remaining

Package:

```text
remaining = 10
```

10 distinct Sessions concurrently.

Expected:

```text
remaining = 0
movements = 10
```

11th:

```text
blocked
```

---

# 128. Same Session redelivery

```text
event X
event X
event X
```

Expected:

```text
remaining decremented once
movement=1
```

---

# 129. Same Session / different event IDs

Isso pode acontecer por bug upstream.

Business uniqueness ainda precisa bloquear:

```text
movement=1
```

Não depender exclusivamente de eventId.

---

# 130. Different package / same Session

A mesma Session não deveria consumir dois pacotes, salvo regra futura.

`RN-PAC-005` diz “a mesma sessão não poderá consumir duas unidades”, o que sugere unicidade global do consumo da Session, não apenas por pacote. 

Portanto eu prefiro constraint:

```text
UNIQUE (
  tenant_id,
  session_id,
  movement_type
)
```

para `CONSUMPTION`.

---

# 131. Essa escolha é importante

Senão:

```text
Session X
Package A → consume
Package B → consume
```

seria possível.

Provavelmente errado no MVP.

---

# 132. Package cancellation

RN-PAC-002 possui CANCELED.

Mas não há regras detalhadas de como cancelar um pacote adquirido.

Não implementar `CancelCustomerPackage` neste PR sem contrato.

O status pode existir no Domain/schema para futuro.

---

# 133. Session cancel/no-show

`RN-PAC-006`:

```text
canceled
rescheduled
no-show
→ no automatic consumption
```



Nosso trigger é:

```text
SessionCompleted
```

Então isso é naturalmente preservado.

Adicionar regression test:

```text
Appointment CANCELED / NO_SHOW
→ PackageMovement count = 0
```

---

# 134. Package discount

Testar:

```text
CustomerPackage:
base = 10000
discount = 2000
final = 8000
```

Session consumption:

```text
no new DiscountPolicy RPC
no per-session discount mutation
```

Isso prova `RN-PAC-007`.

---

# 135. Traceability

Cada movement:

```text
sessionId required
```

para consumption.

Esse é `RN-PAC-008`. 

---

# 136. Customer History

Após consumption:

```text
PACKAGE_CONSUMED
```

deve aparecer na timeline do PR-22.

Não precisa trazer saldo completo se isso for dado financeiro/comercial restrito a determinada permission.

---

# 137. Permission-aware timeline

Recepção/financeiro pode ver:

```text
package consumed
balance
```

Profissional pode talvez ver apenas:

```text
package coverage used
```

conforme RBAC.

Não vazar valor comercial para todo perfil.

---

# 138. Billing D1

Se Billing e Operations compartilham D1 físico no Free-tier, manter ownership lógico.

Billing adapter acessa:

```text
packages
customer_packages
package_movements
reliability
discounts
deposits
```

Não:

```text
appointments
sessions
```

diretamente.

---

# 139. Cloudflare Free

Package consumption tem baixo volume:

```text
~1 mutation per completed package-funded Session
```

Evitar:

```text
polling
Cron
Queue
KV
```

Neste PR, Service Bindings + D1 Outbox continuam suficientes.

---

# 140. Queries bounded

Customer packages:

```text
tenant + customer + status
```

Package eligibility:

```text
tenant + package id
```

Movements:

```text
tenant + package + cursor
```

Nada de:

```text
scan all packages
```

---

# 141. Indexes prováveis

```text
customer_packages(
  tenant_id,
  customer_id,
  status,
  valid_until
)

customer_packages(
  tenant_id,
  service_id,
  status
)

package_movements(
  tenant_id,
  customer_package_id,
  occurred_at
)

package_movements(
  tenant_id,
  session_id,
  type
)
```

Só adicionar após confirmar queries reais.

---

# 142. `EXPLAIN QUERY PLAN`

Quando possível, testar:

```text
list active customer packages
find eligible package
find previous session consumption
list movements
```

---

# 143. Observabilidade

Consume:

```text
operation=ConsumePackageUnit
tenantId
customerPackageId
sessionId
result
balanceState
correlationId
duration
```

Não logar:

```text
customer name
pricing details
payment information
```

salvo necessidade explícita.

---

# 144. Métricas

Baixa cardinalidade:

```text
package.consume.success
package.consume.replay
package.consume.exhausted
package.consume.expired
package.consume.conflict
```

Nunca IDs como labels.

---

# 145. Health continua barato

Billing:

```http
GET /health
```

continua sem:

```text
D1 query
Package lookup
Operations RPC
```

---

# 146. Unit tests Domain

Cobrir:

```text
quantity positive
remaining bounds
status invariants
expiry
consumption transition
balance zero → COMPLETED
```

---

# 147. Unit tests policy

```text
ACTIVE + valid + balance > 0 → READY

EXPIRED → BLOCKED
CANCELED → BLOCKED
COMPLETED → BLOCKED
balance 0 → BLOCKED
customer mismatch → BLOCKED
service mismatch → BLOCKED
```

---

# 148. Worker test — happy consumption

```text
CustomerPackage:
remaining 5

SessionCompleted X
```

Expected:

```text
remaining 4
PackageMovement CONSUMPTION
balanceBefore 5
balanceAfter 4
sessionId X
```

---

# 149. Worker test — final unit

```text
remaining 1
```

After consume:

```text
remaining 0
status COMPLETED
```

---

# 150. Worker test — expired

```text
validUntil < now
```

No movement.

No decrement.

---

# 151. Worker test — customer mismatch

No mutation.

---

# 152. Worker test — service mismatch

No mutation.

---

# 153. Worker test — double Session consumption

Different keys/event IDs.

Exactly one movement.

---

# 154. Worker test — Outbox propagation

Billing:

```text
PackageUnitConsumed PENDING
```

Dispatcher:

```text
→ Operations
```

Operations:

```text
timeline PACKAGE_CONSUMED
```

Then Billing event:

```text
SENT
```

---

# 155. ACK-loss

Operations timeline event applied.

Billing fails before markSent.

Redelivery:

```text
Operations REPLAY
```

Timeline remains one row.

---

# 156. Operations outage

Package consumption remains true:

```text
CustomerPackage decremented
movement persisted
Outbox PENDING
```

Timeline catches up later.

Do not rollback consumption.

---

# 157. This follows established eventual consistency model

Same as:

```text
Deposit
SessionStarted
SessionCompleted
ClinicalRestriction
ReturnRecommended
```

---

# 158. Migration testing

Fresh D1:

```text
0001 → 0017
PASS
```

Second apply:

```text
No migrations to apply
```

---

# 159. Architecture tests

Prohibit:

```text
Package Domain → D1
Package Domain → Cloudflare

Billing Package → Operations repository
Billing Package → Clinical Session entity
```

Allowed:

```text
ApplySessionPackageConsumption
→ CustomerPackageRepository
→ PackageMovementRepository
→ UnitOfWork
```

---

# 160. Contracts

Add in `libs/contracts`, perhaps:

```text
packages/
├── package-usage-eligibility.ts
├── package-consumption-requested.ts
├── package-unit-consumed.ts
└── package-summary.ts
```

No domain sharing.

---

# 161. Gate `pr23`

Create:

```bash
npm run gate:pr23
```

Prefer:

```text
gate:pr22
+
package unit tests
+
package Worker/D1 tests
+
consumption concurrency
+
outbox propagation
+
timeline regression
+
dry-runs
```

---

# 162. Definition of Done — Package

```text
[ ] PackageDefinition or equivalent exists

[ ] CustomerPackage exists

[ ] package data includes:
    customer
    service
    quantity
    base/original price
    discount
    final price
    validity
    balance
    status

[ ] canonical statuses:
    ACTIVE
    COMPLETED
    EXPIRED
    CANCELED

[ ] commercial snapshot immutable
```

Isso cobre `RN-PAC-001/002`. 

---

# 163. Definition of Done — Consumption

```text
[ ] consumption only triggered from completed Session fact

[ ] exactly one unit per consumption

[ ] balance cannot become negative

[ ] balance zero transitions package to COMPLETED

[ ] expired package cannot consume

[ ] canceled package cannot consume

[ ] completed package cannot consume
```

Cobre `RN-PAC-003/004`. 

---

# 164. Definition of Done — Idempotency

```text
[ ] SessionCompleted redelivery consumes once

[ ] same Session + different eventId still consumes once

[ ] same Session + different Idempotency-Key still consumes once

[ ] business UNIQUE protection exists

[ ] transport idempotency exists
```

Cobre `RN-PAC-005`.

---

# 165. Definition of Done — cancellation/no-show

```text
[ ] canceled Appointment produces no consumption

[ ] rescheduled Appointment produces no consumption

[ ] no-show produces no consumption

[ ] only SessionCompleted path triggers consumption
```

Cobre `RN-PAC-006`. 

---

# 166. Definition of Done — Discount

```text
[ ] package purchase snapshot keeps its discount

[ ] session consumption does not run DiscountPolicy again

[ ] no double-discount

[ ] PackageMovement does not alter package commercial snapshot
```

Cobre `RN-PAC-007`.

---

# 167. Definition of Done — Traceability

```text
[ ] PackageMovement append-only

[ ] consumption movement references Session

[ ] customerPackageId preserved

[ ] balanceBefore/After preserved

[ ] source event preserved

[ ] movements paginated
```

Cobre `RN-PAC-008`.

---

# 168. Definition of Done — Concurrency

```text
[ ] remaining=1 with two Sessions tested

[ ] exactly one success

[ ] remaining never negative

[ ] same Session concurrent requests tested

[ ] exactly one movement

[ ] no in-memory mutex
```

---

# 169. Definition of Done — Session integration

```text
[ ] package reference modeled explicitly

[ ] package is never selected arbitrarily at completion

[ ] SessionCompleted/PackageConsumptionRequested carries package reference

[ ] no package ref → no consumption

[ ] invalid package ref → fail/reconciliation semantics explicit
```

---

# 170. Definition of Done — Outbox / Timeline

```text
[ ] PackageUnitConsumed emitted

[ ] Billing → Operations delivery

[ ] eventId idempotency

[ ] ACK-loss safe

[ ] PACKAGE_CONSUMED timeline event

[ ] replay does not duplicate timeline
```

---

# 171. Definition of Done — Security

```text
[ ] authentication for public package operations

[ ] tenant isolation

[ ] customer/package ownership

[ ] service/package compatibility

[ ] package consumption is internal-only

[ ] no financial/commercial sensitive details in generic logs

[ ] timeline honors financial/commercial permissions
```

---

# 172. Definition of Done — Free-first

```text
[ ] D1 bounded queries

[ ] no scans

[ ] no KV

[ ] no R2

[ ] no Queue

[ ] no Cron required

[ ] no polling

[ ] one consumption movement per completed package-funded Session
```

---

# 173. Definition of Done — RN-CONC-002 status

Ao final, o documento do projeto deve registrar:

```text
RN-CONC-002

Session                 PASS
Appointment             PASS
History                 PASS
Customer profile        PASS
Package consumption     PASS / eventual cross-worker effect
Return recommendation   PASS / foundation
Audit                   PASS

Financial balance       PENDING

FULL RN-CONC-002        NOT YET
```

A regra normativa inclui expressamente o consumo do pacote e saldo financeiro no conjunto de efeitos da conclusão. 

---

# 174. Qualidade final

Executar:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers

npm run gate:pr22
npm run gate:pr23

npm run workers:dry-run
git diff --check
```

Tudo:

```text
PASS
```

---

# 175. Relatório pós-implementação esperado

O Codex deve encerrar aproximadamente assim:

```text
PR-23 — Packages + Customer Packages + Idempotent Session Consumption

Baseline
PR22:

Package Domain
definition:
customer package:
statuses:
commercial snapshots:
validity:

Persistence
migration:
repositories:
indexes:
constraints:

Package Selection
appointment/session reference:
eligibility:
customer:
service:
validity:
balance:

Session Integration
package reference:
SessionCompleted:
PackageConsumptionRequested:

Consumption
CAS:
balance before:
balance after:
movement:
zero balance:
status transition:

Idempotency
event replay:
same Session/different event:
same Session/different key:
business uniqueness:

Concurrency
remaining=1:
parallel Sessions:
negative balance:
duplicate movements:

Discount
package discount snapshot:
per-session discount:
double discount protection:

Outbox
PackageUnitConsumed:
dispatcher:
Operations consumer:
ACK-loss:

Customer History
PACKAGE_CONSUMED:
permissions:
replay:

Security
tenant:
customer:
service:
internal consumption:

Free Tier
D1 reads:
D1 writes:
KV:
R2:
Queue:
Cron:

RN-PAC
001:
002:
003:
004:
005:
006:
007:
008:

RN-CONC-002
session:
appointment:
history:
profile:
package:
return:
audit:
financial:
full compliance:

Regression
PR20:
PR21:
PR22:

Quality
unit:
workers:
lint:
typecheck:
dry-runs:
PR23 gate:

Remaining blockers:

Next PR:
```

---

# O que explicitamente não entra no PR-23

Mantenha fora:

```text
Payment
Payment Method
Partial Payment

Refund
Chargeback

Internal Credit

Ledger
Cash Session

Package financial settlement
unless strictly necessary for materialization contract

Automatic package renewal

Package transfer between customers

Manual package balance adjustment

Notifications
Cron expiration
```

---

# Próximo PR depois do PR-23

Depois desse PR, o único grande componente que ainda impede o fechamento normativo de `RN-CONC-002` será o **saldo financeiro**.

A própria documentação define que o financeiro do MVP controla recebimentos; permite dinheiro, Pix, débito, crédito, transferência e crédito interno; suporta pagamento parcial; considera sinal confirmado no saldo; proíbe exclusão de pagamentos; e exige que estorno produza movimento inverso. 

Portanto o próximo passo deverá ser:

# PR-24 — Payment + Receivable Ledger + Partial Payment Foundation

Com algo como:

```text
FinancialObligation
       │
       ├── Appointment
       ├── Session
       └── Package
               │
               ▼
Payment
 PENDING / PARTIAL / PAID
               │
               ▼
LedgerMovement
               │
       ┌───────┴───────┐
       ▼               ▼
   Receipt          Refund
```

e somente depois do PR-24 será possível fazer uma **nova qualificação específica de `RN-CONC-002`**.

A recomendação principal para o **PR-23** é não tratá-lo como um simples CRUD de pacote. O ponto crítico é construir três garantias físicas: **saldo nunca negativo, uma mesma Session nunca consome duas unidades e todo consumo gera um `PackageMovement` rastreável**. A documentação exige explicitamente essas três propriedades. 
