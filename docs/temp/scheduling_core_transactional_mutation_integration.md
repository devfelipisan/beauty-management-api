Considerando o que foi **efetivamente entregue no PR-07**, eu ajustaria o próximo passo em relação ao roadmap anterior.

O próximo PR ainda pertence ao domínio de Scheduling, mas **não deveria ser um `CreateAppointment` completo imediatamente**. O relatório do PR-07 deixou uma limitação estrutural importante: o `UnitOfWork` agrupa os registros de reliability com `D1Database.batch()`, porém **a mutation do domínio ainda não participa desse mesmo contexto transacional**. Além disso, `RN-AGE-001` exige pré-condições de licença, avaliação, restrições do cliente e limites do plano, que ainda não foram implementadas.

Por isso eu definiria o próximo PR como:

# PR-08 — Scheduling Core + Transactional Mutation Integration

A finalidade é construir o núcleo seguro de agenda:

```text
Availability
+
Appointment
+
intervalo
+
habilitação Professional/Service
+
detecção de conflito
+
Repository transacional
+
UnitOfWork realmente incluindo a mutation
```

e **somente expor `CreateAppointment` se todas as pré-condições canônicas puderem ser verificadas sem mocks permissivos ou comportamento inventado**.

---

## 1. Gate de entrada: corrigir a pendência do PR-07

Antes de qualquer classe de `Appointment`, o Codex deve provar que a infraestrutura de testes e D1 está operacional.

O relatório ainda informa:

```text
Vitest → NÃO executado
Lint → NÃO executado
Wrangler → NÃO disponível
Migration D1 local → NÃO executada
```

Esses não podem continuar indefinidamente como “limitação de ambiente”.

Primeiro:

```bash
pwd
git status
git branch --show-current
git log --oneline -20

node --version
npm --version
cat package.json
```

Identificar package manager/lockfile:

```bash
find . -maxdepth 2 \
  \( -name "package-lock.json" \
     -o -name "pnpm-lock.yaml" \
     -o -name "yarn.lock" \
     -o -name "bun.lock" \
     -o -name "bun.lockb" \) \
  -print
```

Depois restaurar instalação usando **o gerenciador real do repositório**.

Não trocar Vitest por Jest.

Não atualizar dependências indiscriminadamente.

Não alterar versão de Node apenas para contornar erro sem diagnóstico.

---

# 2. Gates obrigatórios antes do domínio

Antes de prosseguir:

```bash
npm run lint
npm run test
npx tsc --build
npx wrangler --version
```

E aplicar migrations locais:

```bash
npx wrangler d1 migrations apply \
  <database-name-real-da-config> \
  --local
```

O nome precisa vir do `wrangler.jsonc`, não ser inventado.

O PR não deve ser declarado concluído se esses gates continuarem tecnicamente não executáveis.

---

# 3. Confirmar migration 0001 + 0002

Verificar:

```bash
find database/d1/migrations \
  -maxdepth 1 \
  -type f \
  -print | sort
```

Esperado:

```text
0001_operations_foundation.sql
0002_reliability_foundation.sql
```

Aplicar em banco vazio.

Depois reaplicar o processo em ambiente local reconstruído.

O objetivo é provar:

```text
empty D1
   ↓
0001
   ↓
0002
   ↓
schema funcional
```

---

# 4. Gate arquitetural mais importante do PR-08

O PR-07 registrou:

> a mutation de domínio ainda não pertence ao mesmo batch da idempotência, auditoria e outbox.

Portanto, antes de `Appointment`, precisamos sair de:

```text
UnitOfWork
├── Idempotency
├── Audit
└── Outbox

AppointmentRepository
        │
        └────────────── D1 separado
```

para:

```text
                    UnitOfWork
                        │
                TransactionContext
                        │
       ┌────────────────┼─────────────────┐
       │                │                 │
       ▼                ▼                 ▼
Appointment mutation  Audit             Outbox
       │
       └──────── Idempotency
                        │
                        ▼
                   atomic boundary
```

Esse é o primeiro objetivo técnico do PR.

---

# 5. Não implementar “fake transaction”

É proibido resolver isso assim:

```ts
async execute(callback) {
  return callback();
}
```

e denominar `UnitOfWork`.

Também não fazer:

```text
INSERT appointment
       ↓
batch reliability
```

porque uma falha entre ambos ainda produziria estado parcial.

A arquitetura originalmente exige que mutação, audit, outbox e idempotência sejam tratadas como uma única unidade lógica. 

---

# 6. Revisar o contrato `TransactionContext`

Inspecionar:

```bash
find libs/reliability -type f | sort

grep -R "TransactionContext" \
  libs apps/operations-worker \
  -n
```

O `TransactionContext` precisa fornecer uma forma para repositories participarem da operação.

Não deve virar:

```ts
interface TransactionContext {
  db: D1Database;
}
```

consumido pela Application.

Isso vazaria D1.

---

# 7. Introduzir um Port transacional, não D1

Uma alternativa arquitetural seria algo como:

```ts
export interface TransactionalWriteContext {
  add(statement: PersistenceCommand): void;
}
```

ou outro contrato compatível com a implementação já adotada.

Mas o Codex deve analisar a implementação real antes de escolher a assinatura.

O princípio é:

```text
Application
    ↓
Transaction abstraction

Infrastructure
    ↓
D1 implementation
```

e não:

```text
Application
    ↓
D1PreparedStatement
```

---

# 8. Repositories precisam participar da transação

Os futuros repositories mutáveis devem suportar algo equivalente a:

```text
AppointmentRepository.save(
  appointment,
  transactionContext
)
```

ou:

```text
transaction.appointments.save(...)
```

dependendo da decisão arquitetural atual.

Não exigir que toda query de leitura receba uma transaction se ela não precisar.

---

# 9. Fazer primeiro uma prova com repository existente

Antes de Appointment, escolher uma mutation simples existente, por exemplo:

```text
Customer deactivate
```

ou outra pequena operação já implementada.

Provar:

```text
UnitOfWork
   ├── domain write
   ├── Audit
   ├── Outbox
   └── Idempotency
```

no mesmo mecanismo.

Não alterar sua semântica funcional.

---

# 10. Prova de rollback real

Teste:

```text
customer write
        ✓
audit write
        ✓
outbox write
        X
```

Resultado obrigatório:

```text
customer write     NÃO persistido
audit              NÃO persistido
outbox             NÃO persistido
idempotency        coerente
```

Se essa prova não for possível com o desenho D1 atual:

> **parar o PR e registrar incompatibilidade arquitetural antes de Appointment.**

Não esconder a limitação.

---

# 11. Só depois iniciar Scheduling

Após a prova transacional:

```text
Reliability + domain mutation
             PASS
                  ↓
            Scheduling Core
```

---

# 12. Criar módulo `appointments`

Via Nest CLI:

```bash
nest g module appointments \
  --project operations-worker
```

Não criar controller ainda.

Primeiro domínio.

---

# 13. Criar a entidade Appointment

```bash
nest g class appointments/domain/appointment \
  --project operations-worker \
  --no-spec
```

O agregado deve refletir os dados normativos:

* tenant;
* customer;
* service;
* professional;
* início;
* fim;
* duração;
* preço-base;
* desconto;
* preço final;
* sinal;
* origem;
* status.

Mas existe uma nuance importante.

`Discount` e `Deposit` ainda não foram implementados como domínios.

Portanto o PR-08 **não deve inventar cálculo financeiro**.

---

# 14. Separar snapshot de cálculo de cálculo em si

Appointment pode ser preparado para armazenar:

```text
basePriceCents
discountCents
finalPriceCents
depositCents
```

porque a regra exige congelamento histórico.

Mas este PR não deve implementar:

```text
DiscountPolicy
DepositPolicy
```

se esses bounded contexts ainda não existem.

A documentação exige que preço-base seja preservado separadamente de desconto, sinal, preço final, saldo e pagamento.

---

# 15. Estados normativos de Appointment

Aqui já temos contrato explícito.

Os estados documentados são:

```text
AWAITING_DEPOSIT
AWAITING_CONFIRMATION
CONFIRMED
CHECKED_IN
IN_PROGRESS
COMPLETED
RESCHEDULED
CANCELED
NO_SHOW
EXPIRED
```

correspondendo aos estados funcionais descritos em RN-AGE-005.

Não criar estados adicionais.

---

# 16. Não confundir Appointment com Deposit

A documentação determina explicitamente:

```text
Appointment status
        ≠
Deposit status
        ≠
Presence/confirmation status
```

São independentes.

Portanto não criar:

```text
PAID_APPOINTMENT
UNPAID_APPOINTMENT
```

para representar sinal.

---

# 17. Criar `AppointmentStateMachine`

```bash
nest g class \
  appointments/domain/appointment-state-machine \
  --project operations-worker \
  --no-spec
```

Ela deve permanecer:

```text
pure
deterministic
no I/O
no NestJS
no Repository
no D1
```

---

# 18. Transições do PR

Somente aquelas comprovadas pela documentação:

```text
AWAITING_DEPOSIT
    ↓ deposit_confirmed
AWAITING_CONFIRMATION
```

```text
AWAITING_DEPOSIT
    ↓ deposit_expired
EXPIRED
```

```text
AWAITING_CONFIRMATION
    ↓ confirm_presence
CONFIRMED
```

```text
CONFIRMED
    ↓ check_in
CHECKED_IN
```

```text
CONFIRMED/CHECKED_IN
    ↓ start_session
IN_PROGRESS
```

```text
IN_PROGRESS
    ↓ complete
COMPLETED
```

e fluxos aprovados de:

```text
reschedule
cancel
no_show
```

Mas não é necessário implementar todos os respectivos UseCases neste PR.

A documentação fornece o fluxo e proíbe cancelar/reagendar agendamento concluído.

---

# 19. Criar Value Object de intervalo

Uma agenda depende muito mais de intervalo do que apenas de data.

Eu criaria algo equivalente a:

```bash
nest g class appointments/domain/time-interval \
  --project operations-worker \
  --no-spec
```

Contrato conceitual:

```text
startsAt
endsAt
```

Invariantes:

```text
startsAt < endsAt
```

e:

```text
duration = endsAt - startsAt
```

---

# 20. Não confiar na duração enviada pelo cliente

`Service` já possui:

```text
durationMinutes
```

Portanto `CreateAppointment` futuramente deve derivar:

```text
endsAt =
startsAt + service.durationMinutes
```

e não aceitar:

```text
body.endsAt arbitrário
```

como verdade de negócio.

RN-PRO-004 e RN-AGE-003 exigem que o intervalo integral seja considerado.

---

# 21. Criar Availability como domínio próprio dentro de Scheduling

Não como Worker separado.

Estrutura:

```text
appointments/
availability/
```

ou:

```text
scheduling/
├── appointments/
└── availability/
```

dependendo da estrutura existente.

---

# 22. Criar `AvailabilityPolicy`

```bash
nest g class \
  appointments/domain/policies/availability-policy \
  --project operations-worker \
  --no-spec
```

Mas a Policy não consulta banco.

Ela recebe contexto:

```text
working periods
breaks
blocks
vacations
leaves
existing appointments
candidate interval
```

e decide.

RN-PRO-003 exige que esses fatores sejam considerados.

---

# 23. Não implementar todos os tipos de disponibilidade sem contratos

Temos regra sobre:

```text
dias de trabalho
horário inicial/final
intervalos
bloqueios
férias
afastamentos
agendamentos existentes
```

Mas o relatório do PR-06 não informa que schemas para esses elementos já existam.

Portanto não inventar uma mega-estrutura.

Eu dividiria PR-08 em dois níveis:

```text
Scheduling Core
    ✓ appointment interval
    ✓ explicit blocks
    ✓ existing appointment overlap

Advanced Availability
    later
    working calendar
    vacation
    leave
```

se os contratos ainda não estiverem normatizados.

---

# 24. Criar `AvailabilityRepository`/Port

Se for necessário armazenar bloqueios:

```bash
nest g interface \
  appointments/ports/availability-repository \
  --project operations-worker
```

Mas primeiro definir exatamente quais dados persistem.

Não criar repository apenas como abstração cerimonial.

---

# 25. Criar `AppointmentRepository`

```bash
nest g interface \
  appointments/ports/appointment-repository \
  --project operations-worker
```

Métodos orientados ao domínio:

```text
findById(tenantId, appointmentId)

findConflicts(
  tenantId,
  professionalId,
  interval
)

save(...)

listForProfessional(...)
```

Evitar:

```text
findAll()
```

genérico.

---

# 26. Query canônica para sobreposição

A regra matemática é:

Dois intervalos se sobrepõem quando:

```text
existing.startsAt < candidate.endsAt
AND
existing.endsAt > candidate.startsAt
```

Isso permite:

```text
09:00–09:30
09:30–10:00
```

sem conflito.

Mas rejeita:

```text
09:00–09:30
09:15–09:45
```

Esse comportamento deve ser formalizado em teste.

---

# 27. Estados terminais não ocupam necessariamente agenda

Precisamos definir quais estados efetivamente bloqueiam horário.

Não inferir isso arbitrariamente.

É razoável que:

```text
CANCELED
RESCHEDULED
EXPIRED
```

não bloqueiem.

Mas a documentação canônica precisa ser usada como base.

Se não houver lista explícita de estados ocupantes:

> documentar uma `AppointmentOccupancyPolicy` neste PR antes do repository query.

Não esconder essa decisão dentro do SQL.

---

# 28. Criar `AppointmentOccupancyPolicy`

Caso necessário:

```bash
nest g class \
  appointments/domain/policies/appointment-occupancy-policy \
  --project operations-worker \
  --no-spec
```

Ela responde:

```text
status X ocupa a agenda?
```

Assim a query de conflito usa uma definição normativa, não uma lista mágica duplicada.

---

# 29. Conflict prevention tem dois níveis

Este é um ponto crítico.

Precisamos de:

### Nível 1 — aplicação

```text
find conflict
→ reject early
```

para UX e erros claros.

### Nível 2 — persistência/concorrência

```text
duas requisições concorrentes
→ no máximo uma vence
```

A proposta PostgreSQL original destacava exatamente que apenas executar `SELECT` antes do `INSERT` não resolve corrida concorrente. 

No D1, precisamos estabelecer um mecanismo equivalente apropriado ao adapter escolhido.

---

# 30. Não considerar `SELECT + INSERT` suficiente

Este fluxo é insuficiente:

```text
Request A → SELECT free
Request B → SELECT free

A → INSERT
B → INSERT

resultado:
double booking
```

Portanto PR-08 deve conter **uma prova concorrente**, não apenas unit test de overlap.

---

# 31. Criar estratégia `AppointmentConflictGuard` no persistence adapter

Não necessariamente um Nest Guard.

Na verdade, eu evitaria esse nome para não confundir com Nest Guards.

Algo como:

```text
AppointmentConflictRepository
```

ou:

```text
ScheduleReservationPort
```

pode representar a operação de persistência atômica.

---

# 32. Melhor contrato: reserve slot

Em vez de:

```text
hasConflict()
then save()
```

preferir uma operação conceitual:

```text
reserveAppointment(...)
```

que permita ao adapter garantir:

```text
check + mutation
```

sob a mesma fronteira.

Isso facilita trocar D1 por outra persistência posteriormente.

---

# 33. Não vazar mecanismo D1

Application conhece:

```text
ScheduleReservationPort
```

não:

```text
D1BatchReservation
```

---

# 34. Migration 0003

Somente após modelagem:

```text
database/d1/migrations/
└── 0003_scheduling_foundation.sql
```

Criar:

```text
appointments
```

e apenas tabelas de disponibilidade que realmente tenham contrato definido.

---

# 35. Schema de `appointments`

No mínimo:

```text
id
tenant_id

customer_id
service_id
professional_id

starts_at
ends_at
duration_minutes

base_price_cents
discount_cents
final_price_cents
deposit_cents

origin
status

created_at
updated_at
```

Se desconto/sinal ainda não estiverem calculados, o schema precisa permitir representar corretamente a ausência sem inventar valor semântico.

Não usar `0` para significar “ainda não calculado” se `0` também é valor válido.

---

# 36. Tenant-safe references

Appointment deve provar:

```text
Customer tenant A
Professional tenant A
Service tenant A
Appointment tenant A
```

e impedir:

```text
Appointment tenant A
→ Customer tenant B
```

Assim como o PR-06 já fez para Professional–Service.

---

# 37. Índice da agenda

Criar índice compatível com query principal:

```text
tenant_id
professional_id
starts_at
ends_at
```

A ordem exata deve ser definida a partir da query D1 real e verificada.

O objetivo é evitar scan.

---

# 38. Índices de listagem

Provavelmente serão necessários:

```text
tenant_id + starts_at
tenant_id + customer_id + starts_at
tenant_id + professional_id + starts_at
```

Mas criar somente índices correspondentes às queries implementadas no PR.

---

# 39. Origem do Appointment

RN-AGE-004 define explicitamente:

```text
RECEPTION
LANDING_PAGE
WHATSAPP
RETURN
CAMPAIGN
REFERRAL
MANUAL
```

ou nomenclatura técnica equivalente. 

Não inventar:

```text
MOBILE
BOT
API
```

agora.

---

# 40. `CreateAppointment` ainda precisa de um gate

Antes de criar o UseCase, listar RN-AGE-001:

```text
empresa ativa               ✓ PR-06
licença operacional         ?
cliente ativo               ✓ PR-06
serviço ativo               ✓ PR-06
profissional ativo          ✓ PR-06
profissional habilitado     ✓ PR-06
disponibilidade             PR-08
ausência de conflito        PR-08
avaliação válida            ?
restrições do cliente       ?
limites do plano            ?
```

A documentação é explícita sobre essas pré-condições.

---

# 41. Não ignorar os `?`

Não implementar:

```text
CreateAppointment
```

como se:

```text
licença
avaliação
restrições
plano
```

não existissem.

Existem três opções legítimas.

---

# 42. Opção recomendada: eligibility ports fail-closed

Criar contracts explícitos:

```text
LicenseEligibilityPort

AssessmentEligibilityPort

CustomerRestrictionPort

PlanLimitPort
```

Mas sem inventar regra.

Cada um retorna algo como:

```text
READY
NOT_REQUIRED
BLOCKED
UNAVAILABLE
```

somente se essa semântica for formalmente documentada.

Se ainda não houver infraestrutura:

```text
UNAVAILABLE
```

deve bloquear `CreateAppointment`.

---

# 43. Não criar adapter `AlwaysAllow`

Proibido:

```ts
class AlwaysAllowLicensePolicy {}
```

apenas para desbloquear desenvolvimento.

Isso tornaria o sistema funcionalmente incorreto.

---

# 44. Alternativa mais conservadora

Implementar neste PR apenas:

```text
Appointment aggregate
Availability
Conflict prevention
Repository
Migration
StateMachine
```

e **não expor `POST /appointments` ainda**.

Eu considero esta a melhor opção com o estado atual.

O endpoint de criação entra quando os demais gates existirem.

---

# 45. Nome do PR reflete isso

Por isso recomendo:

> **PR-08 — Scheduling Core + Transactional Mutation Integration**

e não:

> `PR-08 — Create Appointment`.

---

# 46. UseCases seguros deste PR

Podemos implementar queries sem violar RN-AGE-001:

```text
CheckProfessionalAvailability
FindAppointmentConflicts
ListProfessionalSchedule
```

e talvez:

```text
GetAppointment
```

quando houver fixture/persistência.

O comando de criação fica condicionado ao gate completo.

---

# 47. Criar Availability use case

```bash
nest g service \
  appointments/application/check-professional-availability \
  --project operations-worker
```

Ele recebe:

```text
tenantId
professionalId
serviceId
startsAt
```

e deriva:

```text
duration
endsAt
```

a partir de Service.

---

# 48. `CheckAvailability` não cria reserva

Importante:

```text
availability check
```

é apenas informativo.

Não fornece garantia futura.

Resposta pode ser:

```text
available agora
```

mas até `CreateAppointment` executar outra requisição pode ocupar o horário.

Logo o comando futuro precisa validar/reservar novamente.

---

# 49. Criar Repository Adapter D1

Via CLI:

```bash
nest g provider \
  appointments/adapters/d1-appointment-repository \
  --project operations-worker
```

E, se separado:

```bash
nest g provider \
  appointments/adapters/d1-schedule-reservation \
  --project operations-worker
```

Somente Infrastructure conhece SQL/D1.

---

# 50. Integrar reliability

A criação futura precisa seguir:

```text
Idempotency-Key
      ↓
IdempotencyService
      ↓
UnitOfWork
      │
      ├── reserve appointment
      ├── append audit
      ├── append outbox
      └── complete idempotency
      ↓
atomic persistence
```

O PR-08 precisa provar que isso agora é tecnicamente possível.

---

# 51. Evento de auditoria

Quando CreateAppointment for finalmente habilitado:

```text
appointment.created
```

com:

```text
appointmentId
tenantId
actorId
requestId
correlationId
```

Não incluir PII do cliente.

---

# 52. Evento Outbox

Pode ser:

```text
AppointmentCreated
```

mas somente se já houver um consumidor futuro claramente previsto.

Outbox não deve guardar objeto Appointment inteiro.

Payload mínimo:

```text
appointmentId
tenantId
```

---

# 53. Idempotência obrigatória no CreateAppointment

Quando endpoint for exposto:

```http
Idempotency-Key: ...
```

deve ser obrigatório.

A documentação técnica anterior lista `CreateAppointment` explicitamente entre as operações inicialmente protegidas por idempotência. 

---

# 54. Request hash

Deve refletir o comando canônico.

Não simplesmente:

```text
hash(JSON.stringify(req.body))
```

se ordem de propriedades puder variar.

Canonicalizar antes.

E não incluir:

```text
requestId
correlationId
```

no hash.

---

# 55. Teste: duplicate request

```text
same tenant
same key
same command
```

duas vezes.

Resultado:

```text
1 appointment
1 audit creation
1 outbox event
same logical response
```

Não:

```text
2 appointments
```

---

# 56. Teste: idempotency conflict

```text
same key
different startsAt
```

Resultado:

```text
IDEMPOTENCY_KEY_CONFLICT
```

sem novo Appointment.

---

# 57. Teste: cross-tenant idempotency

```text
Tenant A / key 123
Tenant B / key 123
```

são operações independentes.

---

# 58. Teste: overlap puro

Testar Value Object/Policy:

```text
09:00–10:00
09:30–10:30
→ conflict
```

```text
09:00–10:00
10:00–11:00
→ no conflict
```

```text
09:00–10:00
08:00–09:00
→ no conflict
```

---

# 59. Teste: duração integral

Service:

```text
60 minutes
```

Candidate:

```text
09:00
```

Reservation:

```text
09:00–10:00
```

e não apenas o instante `09:00`.

Isso é exigência explícita de RN-PRO-004 e RN-AGE-003.

---

# 60. Teste: inativos

Cada um deve bloquear eligibility:

```text
Tenant INACTIVE
→ deny

Customer INACTIVE
→ deny

Service INACTIVE
→ deny

Professional INACTIVE
→ deny
```

---

# 61. Teste: Professional não habilitado

```text
Professional A
Service X
sem professional_services
```

Resultado:

```text
PROFESSIONAL_NOT_ENABLED_FOR_SERVICE
```

Esse comportamento deriva diretamente de RN-PRO-002. 

---

# 62. Teste cross-tenant

Obrigatórios:

```text
Appointment tenant A
Customer B
→ reject
```

```text
Appointment tenant A
Professional B
→ reject
```

```text
Appointment tenant A
Service B
→ reject
```

---

# 63. Teste concorrente mais importante

Simular duas tentativas:

```text
A:
Professional P
09:00–10:00

B:
Professional P
09:00–10:00
```

executadas concorrente ou quase simultaneamente.

Resultado obrigatório:

```text
created = 1
conflict = 1
```

Nunca:

```text
created = 2
```

Esse é o gate mais importante de Scheduling.

---

# 64. Sem esse teste, PR-08 não fecha

Unit test de:

```text
findConflicts()
```

não é suficiente.

Precisamos provar a persistência.

A proposta técnica original já alertava explicitamente que um `SELECT` anterior ao `INSERT` não elimina corrida concorrente. 

---

# 65. FSM tests

Validar:

```text
COMPLETED
→ cancel
→ rejected
```

```text
COMPLETED
→ reschedule
→ rejected
```

conforme RN-AGE-007.

---

# 66. Não implementar Deposit FSM novamente

Quando signal for desenvolvido:

```text
DepositStateMachine
```

será outro domínio.

Appointment apenas recebe transição decorrente da confirmação do sinal através do UseCase coordenador.

---

# 67. Não implementar Session neste PR

Mesmo existindo:

```text
IN_PROGRESS
COMPLETED
```

na FSM de Appointment, `Session` permanece bounded context separado.

No futuro:

```text
StartSessionUseCase
├── SessionStateMachine
└── AppointmentStateMachine
```

---

# 68. Não implementar descontos

Embora Appointment tenha snapshots financeiros, `RN-DES-*` possui complexidade própria: perfil, período, limites, aprovação e segregação de função.

Não colocar isso dentro de `CreateAppointmentUseCase`.

---

# 69. Não implementar sinal

O mesmo para:

```text
Deposit
```

O status de sinal é independente do Appointment.

---

# 70. Controllers

Somente depois de Domain/Application/Ports/Adapters.

Se este PR expuser apenas consulta:

```bash
nest g controller appointments \
  --project operations-worker
```

Rotas iniciais possíveis:

```text
GET /tenants/:tenantId/appointments/:id

GET /tenants/:tenantId/professionals/:professionalId/availability
```

O `POST` fica condicionado aos gates de eligibility completos.

---

# 71. Se CreateAppointment for autorizado no próprio PR

Só poderá existir se o relatório demonstrar explicitamente:

```text
[PASS] tenant active
[PASS] customer active
[PASS] service active
[PASS] professional active
[PASS] professional enabled
[PASS] availability
[PASS] conflict protection
[PASS] license
[PASS] assessment requirement
[PASS] customer restrictions
[PASS] plan limit
[PASS] pricing snapshot
[PASS] deposit decision
```

Caso contrário:

```text
POST /appointments
NOT IMPLEMENTED
```

Isso não é incompletude; é fail-closed.

---

# 72. Error codes

Preparar códigos estáveis:

```text
APPOINTMENT_NOT_FOUND
APPOINTMENT_TIME_CONFLICT
APPOINTMENT_INVALID_INTERVAL

TENANT_NOT_OPERATIONAL

CUSTOMER_INACTIVE

SERVICE_INACTIVE

PROFESSIONAL_INACTIVE
PROFESSIONAL_NOT_ENABLED_FOR_SERVICE

PROFESSIONAL_UNAVAILABLE

APPOINTMENT_TRANSITION_NOT_ALLOWED
```

e apenas códigos de regras realmente implementadas.

---

# 73. Observabilidade

Adicionar atributos seguros:

```text
operation
tenantId
actorId
appointmentId
professionalId
serviceId
status
durationMs
```

Não:

```text
customer name
phone
email
document
```

---

# 74. Métrica útil

Começar a observar:

```text
appointment.conflict
```

ou métrica equivalente.

Isso ajudará futuramente a acompanhar:

```text
conflitos por agenda
```

que a proposta técnica recomenda como métrica operacional. 

---

# 75. Cloudflare Free: custo de availability

Evitar implementação:

```text
GET availability
→ carregar todos appointments do mês
→ filtrar em TypeScript
```

Preferir query temporal limitada e indexada.

---

# 76. Janela limitada

Availability deve exigir:

```text
from
to
```

com limite máximo definido/documentado.

Não permitir:

```text
from 2020
to 2050
```

e scan massivo.

---

# 77. Paginação/listagem

Listagem de appointments:

```text
tenant
+
period
+
optional professional
```

e não:

```text
GET /appointments
→ entire history
```

---

# 78. Migration não roda no bootstrap

Continuar a regra:

```text
worker boot
   X
apply migrations
```

Migration é tooling/deployment.

---

# 79. Health continua puro

Após Scheduling:

```text
GET /health
```

continua:

```text
D1 reads           0
D1 writes          0
Audit              0
Outbox             0
Idempotency        0
Scheduling queries 0
```

---

# 80. Estrutura esperada

Ao final:

```text
apps/operations-worker/src/
├── tenants/
├── professionals/
├── services/
├── customers/
│
├── appointments/
│   ├── domain/
│   │   ├── appointment.ts
│   │   ├── appointment-state-machine.ts
│   │   ├── time-interval.ts
│   │   └── policies/
│   │       ├── availability-policy.ts
│   │       └── appointment-occupancy-policy.ts
│   │
│   ├── application/
│   │   ├── check-professional-availability/
│   │   └── ...
│   │
│   ├── ports/
│   │   ├── appointment-repository.ts
│   │   └── schedule-reservation.port.ts
│   │
│   └── adapters/
│       ├── http/
│       └── d1/
│
└── health/
```

---

# 81. Migration resultante

```text
database/d1/migrations/
├── 0001_operations_foundation.sql
├── 0002_reliability_foundation.sql
└── 0003_scheduling_foundation.sql
```

---

# 82. Novo fluxo transacional esperado

O resultado arquitetural mais importante do PR deve ser:

```text
                    HTTP
                     │
                     ▼
              ExecutionContext
                     │
                     ▼
                Application
                     │
                     ▼
            Reliability UnitOfWork
                     │
        ┌────────────┼─────────────┐
        ▼            ▼             ▼
 Appointment      Audit          Outbox
 mutation
        │
        └───── Idempotency
                     │
                     ▼
                    D1
```

e não dois caminhos separados.

---

# 83. Definition of Done — infraestrutura

```text
[ ] PR-05 preservado
[ ] PR-06 preservado
[ ] PR-07 preservado

[ ] npm environment reparado
[ ] lint executável
[ ] Vitest executável
[ ] Wrangler executável

[ ] migration 0001 local PASS
[ ] migration 0002 local PASS

[ ] domain mutation integrada ao UnitOfWork
[ ] repository consegue participar do TransactionContext
[ ] Application continua sem D1
[ ] Domain continua sem D1

[ ] atomic success proof PASS
[ ] atomic rollback proof PASS
```

---

# 84. Definition of Done — Scheduling

```text
[ ] Appointment agregado criado

[ ] Appointment statuses somente canônicos

[ ] AppointmentStateMachine pura

[ ] TimeInterval criado

[ ] startsAt < endsAt

[ ] duração derivada do Service

[ ] Availability modelada

[ ] RN-PRO-003 considerada no escopo definido

[ ] conflito considera intervalo integral

[ ] ScheduleReservation Port criado

[ ] D1 adapter tenant-aware

[ ] cross-tenant Customer rejeitado
[ ] cross-tenant Professional rejeitado
[ ] cross-tenant Service rejeitado

[ ] Professional habilitado validado

[ ] Tenant ativo validado
[ ] Customer ativo validado
[ ] Service ativo validado
[ ] Professional ativo validado

[ ] concurrency conflict proof PASS

[ ] no máximo 1 appointment criado para slot concorrente

[ ] migration 0003 criada

[ ] índices tenant-aware

[ ] availability query bounded

[ ] list query bounded
```

---

# 85. Definition of Done — Reliability

Caso `CreateAppointment` seja exposto:

```text
[ ] Idempotency-Key obrigatório

[ ] retry igual retorna mesmo resultado

[ ] mesma key + payload diferente = conflict

[ ] appointment + audit + outbox + idempotency
    pertencem à mesma unidade lógica

[ ] duplicate request cria apenas 1 appointment

[ ] audit append-only

[ ] outbox PENDING

[ ] nenhuma PII nos eventos
```

---

# 86. Definition of Done — regras ainda ausentes

Antes de expor `POST /appointments`:

```text
[ ] license eligibility resolvida

[ ] assessment requirement resolvida

[ ] customer restrictions resolvidas

[ ] plan limits resolvidos

[ ] discount snapshot resolvido

[ ] deposit snapshot/decision resolvido
```

Se algum desses estiver:

```text
MISSING
```

então:

```text
CreateAppointment endpoint = NOT EXPOSED
```

O PR pode concluir o Scheduling Core mesmo assim.

---

# 87. Definition of Done — qualidade

Obrigatório agora:

```text
[ ] lint PASS

[ ] tsc --build PASS

[ ] Vitest PASS

[ ] architecture tests PASS

[ ] domain tests PASS

[ ] application tests PASS

[ ] repository contract tests PASS

[ ] D1 integration tests PASS

[ ] concurrency tests PASS

[ ] wrangler types PASS

[ ] wrangler dry-run PASS

[ ] operations-worker build PASS

[ ] health smoke PASS

[ ] git diff --check PASS
```

Não aceitar novamente:

```text
lint não executado
test não executado
wrangler não instalado
```

como estado final normal deste PR.

---

# 88. O que explicitamente não entra

```text
Deposit implementation

Discount engine

Assessment implementation

Session

Payment

Package

R2

KV

Queue consumer

Outbox consumer

Cron

Notification

BFF appointment UI
```

---

# 89. Relatório obrigatório pós-PR

O Codex deve responder:

```text
PR-08 — Scheduling Core + Transactional Mutation Integration

1. Estado anterior
2. Correções do ambiente
3. TransactionContext
4. Domain mutation atomicity
5. Appointment domain
6. Appointment FSM
7. Availability
8. Conflict prevention
9. Concurrency proof
10. D1 migration
11. Indices
12. Tenant isolation
13. Reliability integration
14. Idempotency
15. Audit
16. Outbox
17. Observability
18. Free Tier impact
19. Tests
20. Wrangler
21. Endpoints efetivamente expostos
22. Pré-condições RN-AGE-001 ainda ausentes
23. Pendências
24. Próximo PR recomendado
```

---

## Roadmap revisado após esse PR

Eu não fecharia desde já que o próximo será Billing.

A decisão depende do resultado de PR-08.

O fluxo deveria ser:

```text
PR-07
Reliability Foundation
      ↓
PR-08
Scheduling Core
+ transactional domain mutation
+ availability
+ conflict safety
      ↓
      ├── se RN-AGE-001 ainda incompleta
      │
      ▼
PR-09
Appointment Eligibility Foundation
License
Assessment gate
Customer restrictions
Plan limits
Pricing/Deposit contracts
      │
      ▼
PR-10
CreateAppointment authoritative flow
```

Se essas dependencies já existirem de forma canônica no repositório quando o PR-08 for executado, PR-09 pode ser desnecessário e `CreateAppointment` pode ser finalizado no próprio PR-08.

Essa cautela é importante porque `RN-AGE-001` não diz apenas “cliente, profissional e serviço devem existir”. Ele exige **empresa ativa, licença operacional, cliente ativo, serviço ativo, profissional ativo e habilitado, disponibilidade, ausência de conflito, avaliação válida quando obrigatória, restrições do cliente e limites do plano**.  E a documentação determina que o agendamento ocupe o intervalo integral e impeça sobreposição do profissional.

Portanto, com o PR-07 efetivamente concluído, **PR-08 deve ser o primeiro PR de Scheduling, mas também precisa fechar a lacuna transacional deixada conscientemente pelo PR-07. Eu não recomendaria expor um `POST /appointments` parcialmente correto apenas para manter a numeração do roadmap.**
