Com o **PR-08 encerrado de forma fail-closed**, o próximo PR não deve tentar expor `POST /appointments` ainda. O relatório deixou seis pré-condições normativas ausentes:

```text
licença operacional
avaliação
restrições do cliente
limites do plano
desconto
sinal
```

Misturar todas elas dentro de `CreateAppointment` agora criaria um PR grande demais e, pior, levaria regras financeiras para `operations-worker`.

Eu estruturaria o próximo como:

# PR-09 — Appointment Eligibility Foundation

Objetivo: implementar as **pré-condições não financeiras** necessárias para decidir se um agendamento sequer pode ser admitido.

```text
CreateAppointment futuro
        │
        ▼
AppointmentEligibility
        │
        ├── Tenant operational?
        ├── License valid?
        ├── Customer eligible?
        ├── Assessment satisfied?
        └── Plan capacity available?
                  │
             READY / BLOCKED
```

`Discount` e `Deposit` ficam deliberadamente para um PR de Billing/Commercial depois. Isso mantém a fronteira:

```text
Operations
    └── eligibility / scheduling

Billing
    └── pricing / discount / deposit
```

---

## 1. Gate zero: finalmente tornar o ambiente executável

O PR-08 ainda terminou com:

```text
Vitest      BLOCKED
Wrangler    BLOCKED
D1 local    NOT EXECUTED
Concurrency NOT PROVEN
```

Esse passivo já não deve atravessar outro PR.

Começar por:

```bash
pwd
git status
git branch --show-current
git log --oneline -20

node --version
npm --version
cat package.json
```

Identificar o lockfile:

```bash
find . -maxdepth 2 \
  \( -name "package-lock.json" \
     -o -name "pnpm-lock.yaml" \
     -o -name "yarn.lock" \
     -o -name "bun.lock" \
     -o -name "bun.lockb" \) \
  -print
```

Reinstalar usando **o package manager real do repositório**.

Não trocar Vitest por Jest e não atualizar dependências indiscriminadamente apenas para contornar Rolldown.

Depois exigir:

```bash
npm run lint
npm run test
npx tsc --build
npx wrangler --version
```

---

# 2. Executar migrations D1 localmente

Agora existem:

```text
0001_operations_foundation.sql
0002_reliability_foundation.sql
0003_scheduling_foundation.sql
```

Listar:

```bash
find database/d1/migrations \
  -maxdepth 1 \
  -type f \
  -print | sort
```

Aplicar no banco local usando o nome real definido no `wrangler.jsonc`:

```bash
npx wrangler d1 migrations apply <database-name> --local
```

Não inventar nome nem `database_id`.

---

# 3. Antes do PR-09 funcional, fechar a prova concorrente do PR-08

Isso é obrigatório.

O adapter atual usa:

```sql
INSERT ... WHERE NOT EXISTS (...)
```

Isso parece adequado conceitualmente, mas **a prova física ainda não foi executada**.

Criar teste/integration proof concorrente:

```text
Request A:
Professional P
09:00–10:00

Request B:
Professional P
09:00–10:00
```

executadas simultaneamente ou com sincronização controlada.

Resultado obrigatório:

```text
appointments inserted = 1
conflict               = 1
```

Nunca:

```text
appointments inserted = 2
```

Se isso falhar, **parar PR-09**. Eligibility não deve avançar sobre uma agenda cuja atomicidade ainda não está comprovada.

---

# 4. Não alterar `POST /appointments`

Continuar sem:

```http
POST /appointments
```

O endpoint permanece bloqueado.

O PR-09 prepara:

```text
eligibility
```

não:

```text
authoritative appointment creation
```

---

# 5. Criar um módulo de eligibility dentro de Operations

Não criar novo Worker.

Gerar:

```bash
nest g module appointment-eligibility \
  --project operations-worker
```

Eu manteria conceitualmente em:

```text
apps/operations-worker/src/
└── appointment-eligibility/
    ├── domain/
    ├── application/
    ├── ports/
    └── adapters/
```

Ou dentro de `appointments/eligibility/` se essa for a convenção consolidada do PR-08.

---

# 6. Não criar uma entidade `Eligibility`

Eligibility é uma decisão/policy, não necessariamente agregado persistido.

Preferir:

```text
AppointmentEligibilityPolicy
AppointmentEligibilityResult
```

em vez de:

```text
EligibilityEntity
EligibilityRepository
EligibilityStateMachine
```

sem necessidade.

---

# 7. Criar contrato de resultado fail-closed

Gerar:

```bash
nest g class \
  appointment-eligibility/domain/appointment-eligibility-result \
  --project operations-worker \
  --no-spec
```

Conceitualmente:

```ts
type AppointmentEligibilityStatus =
  | 'READY'
  | 'BLOCKED';
```

E razões estáveis, por exemplo:

```text
TENANT_NOT_OPERATIONAL
LICENSE_NOT_OPERATIONAL
CUSTOMER_INACTIVE
CUSTOMER_RESTRICTED
ASSESSMENT_REQUIRED
ASSESSMENT_INVALID
PLAN_LIMIT_REACHED
PROFESSIONAL_INACTIVE
SERVICE_INACTIVE
PROFESSIONAL_NOT_ENABLED
PROFESSIONAL_UNAVAILABLE
TIME_CONFLICT
```

Mas só adicionar códigos sustentados pela documentação existente.

Não criar `UNKNOWN → allow`.

Regra:

```text
não consigo provar elegibilidade
        ↓
BLOCKED
```

---

# 8. Separar o que o PR-08 já sabe

Não duplicar:

```text
Tenant active
Customer active
Service active
Professional active
Professional-Service relationship
Availability
Conflict
```

O PR-09 deve reutilizar essas capacidades.

Portanto:

```text
AppointmentEligibility
     │
     ├── existing Operations domain
     ├── LicenseEligibilityPort
     ├── AssessmentEligibilityPort
     ├── CustomerRestrictionPort
     └── PlanLimitPort
```

---

# 9. Criar `LicenseEligibilityPort`

Via CLI:

```bash
nest g interface \
  appointment-eligibility/ports/license-eligibility-port \
  --project operations-worker
```

Contrato orientado à pergunta de negócio:

```ts
interface LicenseEligibilityPort {
  check(input: {
    tenantId: string;
  }): Promise<LicenseEligibility>;
}
```

Não:

```ts
findLicenseByTenantId()
```

se Application só precisa saber se a operação pode prosseguir.

---

# 10. Não inventar `License` completo

Se ainda não existe domínio normativo suficiente para:

```text
License
Plan
Subscription
Billing SaaS
```

não implemente esses agregados neste PR.

O port pode ser preparado, mas o adapter só deve existir se houver fonte de dados normativa.

Não criar:

```ts
AlwaysValidLicenseAdapter
```

para liberar agenda.

---

# 11. Se licença ainda não possuir persistence

Use comportamento fail-closed explícito:

```text
License capability unavailable
        ↓
NOT_OPERATIONAL / BLOCKED
```

Mas isso significa que `POST /appointments` continua indisponível.

Não mascarar ausência com `true`.

---

# 12. Criar `CustomerRestrictionPort`

Gerar:

```bash
nest g interface \
  appointment-eligibility/ports/customer-restriction-port \
  --project operations-worker
```

Responsabilidade:

```text
Customer possui restrição que bloqueia novo atendimento?
```

Não transformar isso imediatamente em:

```text
CustomerStatus = BLOCKED
```

O histórico já separou corretamente:

```text
Customer lifecycle
ACTIVE / INACTIVE
```

de restrições operacionais.

Preserve isso.

---

# 13. Modelar restrições separadamente

Se a documentação permitir persistência de bloqueio/restrição, criar algo como:

```text
customer_restrictions
```

em vez de adicionar estados artificiais à entidade Customer.

Campos conceituais:

```text
id
tenant_id
customer_id
restriction_type
active
reason_code
created_at
created_by
```

Mas só criar schema se os tipos normativos estiverem definidos.

---

# 14. Não persistir texto sensível indiscriminadamente

Não criar:

```text
restriction_notes TEXT
```

e começar a gravar informações clínicas livres sem uma regra clara.

Preferir:

```text
reasonCode
```

e metadados mínimos.

---

# 15. Criar `AssessmentEligibilityPort`

Via CLI:

```bash
nest g interface \
  appointment-eligibility/ports/assessment-eligibility-port \
  --project operations-worker
```

Pergunta:

```text
Para este Customer + Service, avaliação é exigida?

Se sim:
há uma avaliação válida?
```

Contrato conceitual:

```ts
check({
  tenantId,
  customerId,
  serviceId,
})
```

---

# 16. Não implementar Assessment clínico dentro de Operations

Isso é fundamental.

`Assessment` pertence ao futuro:

```text
clinical-worker
```

Operations não deve possuir:

```text
Assessment entity
Technical form
Clinical answers
Anamnesis
Photos
```

O Operations conhece apenas um **port de elegibilidade**.

Fluxo futuro:

```text
Operations
   │
   │ Service Binding
   ▼
Clinical Worker
   │
   └── Assessment eligibility
```

---

# 17. Enquanto Clinical Worker não existir

Não crie adapter:

```text
AlwaysAssessmentValid
```

A capability pode permanecer:

```text
UNAVAILABLE
```

ou equivalente fail-closed.

Assim o domínio continua correto.

---

# 18. Criar `PlanLimitPort`

Via CLI:

```bash
nest g interface \
  appointment-eligibility/ports/plan-limit-port \
  --project operations-worker
```

Responsabilidade:

```text
o tenant ainda possui capacidade/licença para admitir novo Appointment?
```

Não colocar regras de plano em `AppointmentStateMachine`.

---

# 19. Não inventar números de plano

Proibido criar sem fonte normativa:

```text
FREE = 100 appointments
BASIC = 500
PRO = unlimited
```

O Cloudflare Free Tier é infraestrutura da plataforma e **não é automaticamente o plano comercial do SaaS**.

São conceitos diferentes:

```text
Cloudflare capacity budget
        ≠
Tenant SaaS plan limits
```

---

# 20. Criar policy agregadora

Gerar:

```bash
nest g class \
  appointment-eligibility/domain/appointment-eligibility-policy \
  --project operations-worker \
  --no-spec
```

Ela coordena resultados já obtidos, mas não realiza I/O.

Exemplo conceitual:

```text
Tenant operational?
        ↓
Customer eligible?
        ↓
Professional valid?
        ↓
Service valid?
        ↓
License valid?
        ↓
Assessment valid/not required?
        ↓
Plan capacity?
        ↓
Availability?
        ↓
No conflict?
        ↓
READY
```

---

# 21. Application Service para avaliar eligibility

Gerar:

```bash
nest g service \
  appointment-eligibility/application/check-appointment-eligibility \
  --project operations-worker
```

Esse use case pode realizar I/O via ports.

Fluxo:

```text
CheckAppointmentEligibility
     │
     ├── TenantRepository
     ├── CustomerRepository
     ├── ServiceRepository
     ├── ProfessionalRepository
     ├── LicenseEligibilityPort
     ├── AssessmentEligibilityPort
     ├── CustomerRestrictionPort
     ├── PlanLimitPort
     └── Scheduling availability/conflict
```

Depois passa fatos à policy pura.

---

# 22. Evitar fan-out desnecessário

Não fazer consultas sequenciais se não forem necessárias.

Por exemplo:

```text
Tenant inexistente
→ parar
```

Não continuar consultando:

```text
Customer
Service
Professional
Assessment
Plan
```

Isso reduz D1 reads e chamadas entre Workers.

---

# 23. Ordem recomendada de checks

Eu faria fail-fast:

```text
1 tenant
2 customer
3 service
4 professional
5 professional-service
6 license
7 customer restrictions
8 assessment
9 plan limit
10 availability
11 conflict
```

Mas use a ordem que melhor minimize custo sem alterar semântica.

---

# 24. Não misturar pricing nesta policy

Explicitamente fora:

```text
discount calculation
deposit calculation
final price
balance due
```

Eligibility responde:

```text
PODE prosseguir para cálculo comercial?
```

não:

```text
QUAL o preço?
```

---

# 25. Criar contrato para próxima etapa

Pode ser criado um port de alto nível:

```bash
nest g interface \
  appointments/ports/commercial-terms-port \
  --project operations-worker
```

mas **sem adapter ainda**, apenas se necessário para formalizar a próxima integração.

Conceitualmente:

```text
CommercialTermsPort
       ↓
Billing Worker futuro
```

Ele retornará futuramente:

```text
basePrice snapshot
discount
finalPrice
deposit
```

Operations não calcula isso.

---

# 26. Não materializar Billing no mesmo PR

Não criar:

```text
billing-worker
discount engine
deposit domain
```

agora.

Isso deve ser o próximo track.

PR-09 já possui escopo suficiente.

---

# 27. Endpoint de eligibility: avaliar necessidade

Eu **não exporia automaticamente**:

```http
POST /appointments/eligibility
```

porque pode virar uma “pré-autorização” que o frontend interpreta como garantia.

Eligibility é volátil.

Melhor mantê-la Application-internal até `CreateAppointment`.

Se a UI realmente precisar verificar disponibilidade:

```text
GET availability
```

já existe.

---

# 28. Se houver endpoint diagnóstico

Somente se existir necessidade funcional explícita.

E a resposta deve deixar claro:

```text
eligibleNow
```

não:

```text
reservationGuaranteed
```

Mas eu deixaria fora deste PR.

---

# 29. Migration do PR-09

Só criar:

```text
0004_appointment_eligibility.sql
```

se houver **algum estado persistente novo realmente normativo**, por exemplo restrições de Customer ou configuração de serviço exigindo avaliação.

Não crie migration vazia apenas para manter numeração.

---

# 30. Service precisa indicar avaliação obrigatória?

A regra de negócio fala em avaliação válida “quando obrigatória”.

Precisamos definir onde essa configuração mora.

A opção mais coerente é provavelmente `Service` possuir uma configuração equivalente a:

```text
requiresAssessment
```

se isso já estiver suportado pela documentação.

Se ainda não estiver normativamente definido:

> registre a lacuna; não adicione boolean por inferência.

---

# 31. Assessment validade também precisa de contrato

Não inventar:

```text
assessment valid for 30 days
```

ou:

```text
90 days
```

sem regra.

O port deve permitir que o Clinical Worker seja a autoridade dessa decisão posteriormente.

---

# 32. License não é Authentication

Não implementar:

```text
LicenseGuard
```

global.

Licença é pré-condição operacional de um comando, não identidade.

Logo:

```text
AppointmentEligibilityUseCase
       ↓
LicenseEligibilityPort
```

é preferível.

---

# 33. Customer restrictions não são PermissionGuard

Mesma regra.

Não criar:

```text
CustomerRestrictionGuard
```

Nest.

É regra de aplicação/domínio.

---

# 34. Plan limits também não são Guard genérico

Não:

```text
PlanLimitGuard
```

em controllers.

A capacidade pode depender da operação.

Use Policy/Port.

---

# 35. Fail-closed normativo

Formalizar:

```text
License check unavailable
       ↓
BLOCKED

Assessment decision unavailable
       ↓
BLOCKED quando evaluation é requerida

Plan decision unavailable
       ↓
BLOCKED

Customer restriction cannot be determined
       ↓
BLOCKED
```

Não usar fallback permissivo.

---

# 36. Tipos de resultado

Evite booleans pobres:

```ts
true
false
```

Prefira algo como:

```ts
interface EligibilityDecision {
  eligible: boolean;
  reason?: AppointmentEligibilityReason;
}
```

ou contrato equivalente.

Isso melhora erro, observabilidade e testes.

---

# 37. Não vazar detalhes internos na API

Mesmo que internamente exista:

```text
LICENSE_PROVIDER_UNAVAILABLE
```

a futura API pode mapear para código público seguro.

Não retornar detalhes de infraestrutura.

---

# 38. Observabilidade

Adicionar:

```text
operation = CheckAppointmentEligibility
tenantId
actorId
professionalId
serviceId
result
reasonCode
duration
```

Não incluir:

```text
customerName
phone
email
document
assessment answers
```

---

# 39. Métricas úteis

Sem criar sistema gigantesco, permitir contagem de:

```text
appointment.eligibility.ready
appointment.eligibility.blocked
```

com razão de baixa cardinalidade:

```text
TENANT_NOT_OPERATIONAL
LICENSE_NOT_OPERATIONAL
ASSESSMENT_REQUIRED
PLAN_LIMIT_REACHED
...
```

---

# 40. Testes do agregador

Casos:

```text
all requirements satisfied
→ READY
```

```text
tenant inactive
→ BLOCKED/TENANT_NOT_OPERATIONAL
```

```text
customer inactive
→ BLOCKED
```

```text
professional inactive
→ BLOCKED
```

```text
service inactive
→ BLOCKED
```

```text
professional not enabled
→ BLOCKED
```

---

# 41. Teste License

```text
license valid
→ continue
```

```text
license invalid
→ BLOCKED
```

```text
license unknown/unavailable
→ fail closed
```

---

# 42. Teste Assessment

```text
assessment not required
→ continue
```

```text
required + valid
→ continue
```

```text
required + missing
→ BLOCKED
```

```text
required + expired/invalid
→ BLOCKED
```

Somente use “expired” se a noção de validade temporal estiver definida.

---

# 43. Teste Customer Restriction

```text
no restriction
→ continue
```

```text
active blocking restriction
→ BLOCKED
```

---

# 44. Teste Plan Limit

```text
capacity available
→ continue
```

```text
capacity exhausted
→ BLOCKED
```

Sem números inventados.

---

# 45. Reutilizar availability PR-08

Teste:

```text
otherwise eligible
+
professional unavailable
→ BLOCKED
```

Não duplicar algoritmos.

---

# 46. Reutilizar conflict prevention PR-08

Teste:

```text
otherwise eligible
+
existing overlapping appointment
→ BLOCKED / TIME_CONFLICT
```

---

# 47. Teste fail-fast e query budget

Com fake repositories, provar que:

```text
tenant inactive
```

impede chamadas subsequentes a:

```text
assessment
plan
availability
```

Isso reduz custo e torna o comportamento previsível.

---

# 48. Teste cross-tenant continua obrigatório

```text
tenant A
customer B
→ BLOCKED
```

e o eligibility use case nunca deve conseguir transformar esse recurso em elegível.

---

# 49. Testes arquiteturais

Adicionar:

```text
AppointmentEligibilityPolicy
→ D1
FAIL
```

```text
AppointmentEligibilityPolicy
→ NestJS
FAIL
```

```text
Application
→ D1 adapter
FAIL
```

```text
Operations
→ Clinical implementation
FAIL
```

```text
Operations
→ Billing implementation
FAIL
```

Operations conhece ports/contracts.

---

# 50. Confirmar TransactionContext do PR-08

Embora PR-09 não crie Appointment, ele deve preservar a alteração:

```text
TransactionContext.persistence
```

e rodar novamente os testes de atomicidade criados no início.

Não quebrar reliability.

---

# 51. Nenhum write de eligibility por padrão

Idealmente:

```text
CheckAppointmentEligibility
```

é predominantemente leitura.

Isso é bom para Cloudflare Free.

Não criar:

```text
eligibility_checks table
```

persistindo cada tentativa.

Telemetria é suficiente.

---

# 52. Não usar Audit para simples check

```text
CheckAppointmentEligibility
```

não precisa gerar um AuditEvent persistente a cada consulta.

Auditoria é para mudanças/fatos críticos.

Caso contrário criaremos write amplification enorme.

---

# 53. Free Tier budget

Esse PR deve estimar D1 reads do check.

Objetivo:

```text
bounded reads
indexed lookups
early exit
```

Evitar:

```text
scan customers
scan appointments
scan assessments
```

---

# 54. Service Bindings ainda não necessários fisicamente?

Se `clinical-worker` e `billing-worker` ainda não existem, não inventar Service Binding apontando para Worker inexistente.

Ports podem existir sem adapters.

Essa ausência mantém:

```text
eligibility incomplete
→ CreateAppointment blocked
```

corretamente.

---

# 55. Estado final do PR-09

Ao final teremos:

```text
Operations Worker
      │
      ├── Tenant
      ├── Professional
      ├── Service
      ├── Customer
      ├── Scheduling Core
      │      ├── Appointment
      │      ├── Availability
      │      └── Conflict Prevention
      │
      └── Appointment Eligibility
             ├── operational state
             ├── license port
             ├── restriction port
             ├── assessment port
             └── plan limit port
```

Mas:

```text
POST /appointments
        X
```

continua bloqueado.

---

# 56. O próximo gap ficará reduzido

Depois do PR-09, `RN-AGE-001` estará aproximadamente:

```text
empresa ativa             ✓
licença operacional       contract/gate
cliente ativo             ✓
serviço ativo             ✓
profissional ativo        ✓
profissional habilitado   ✓
disponibilidade           ✓
conflito                  ✓
avaliação                 contract/gate
restrições cliente        contract/gate
limites plano             contract/gate
```

E sobrará comercial:

```text
desconto
sinal
```

---

# 57. Definition of Done — infraestrutura

```text
[ ] instalação local reproduzível

[ ] lint executável
[ ] Vitest executável
[ ] Wrangler executável

[ ] migrations 0001–0003 aplicadas localmente

[ ] concurrency proof do PR-08 PASS

[ ] max 1 Appointment para slot concorrente

[ ] TransactionContext.persistence continua funcional

[ ] atomic mutation proof continua PASS
```

---

# 58. Definition of Done — Eligibility

```text
[ ] AppointmentEligibility module criado

[ ] EligibilityPolicy pura

[ ] EligibilityResult explícito

[ ] fail-closed implementado

[ ] Tenant operacional reutilizado

[ ] Customer ativo reutilizado

[ ] Service ativo reutilizado

[ ] Professional ativo reutilizado

[ ] Professional-Service reutilizado

[ ] Availability reutilizada

[ ] Conflict detection reutilizada

[ ] LicenseEligibilityPort definido

[ ] AssessmentEligibilityPort definido

[ ] CustomerRestrictionPort definido

[ ] PlanLimitPort definido

[ ] nenhum adapter permissivo criado

[ ] unknown/unavailable não vira allow
```

---

# 59. Definition of Done — boundaries

```text
[ ] License não virou Nest Guard

[ ] Assessment não foi implementado em Operations

[ ] Customer restriction não virou CustomerStatus artificial

[ ] PlanLimit não virou Guard

[ ] Discount não entrou em Operations

[ ] Deposit não entrou em Operations

[ ] Billing não foi implementado neste PR

[ ] Clinical não foi implementado neste PR
```

---

# 60. Definition of Done — qualidade

```text
[ ] unit tests PASS
[ ] eligibility tests PASS
[ ] availability tests PASS
[ ] conflict tests PASS
[ ] concurrency tests PASS
[ ] reliability regression tests PASS
[ ] architecture tests PASS

[ ] lint PASS
[ ] tsc --build PASS
[ ] Vitest PASS

[ ] Wrangler types PASS
[ ] migrations local PASS
[ ] wrangler dry-run PASS

[ ] operations-worker build PASS
[ ] health smoke PASS
[ ] git diff --check PASS
```

---

# 61. Endpoints ao final

Continuar com:

```text
GET /health

GET /tenants/:tenantId/professionals/:professionalId/availability
```

e os endpoints cadastrais do PR-06.

Não criar ainda:

```text
POST /appointments
```

salvo se durante a execução for comprovado que **todas** as dependências normativas passaram a existir, algo improvável neste escopo.

---

# 62. Relatório pós-PR obrigatório

O Codex deve responder:

```text
PR-09 — Appointment Eligibility Foundation

Estado anterior

Environment recovery
Vitest
Lint
Wrangler
D1 migrations

PR-08 concurrency proof

Eligibility model

License eligibility
Assessment eligibility
Customer restrictions
Plan limits

Existing scheduling checks reused

Fail-closed behavior

Ports without adapters

Tenant isolation

Observability

Cloudflare Free impact

Tests

Endpoints

RN-AGE-001 coverage matrix

Remaining blockers

Next PR
```

---

# Próximo PR após o PR-09

Se esse PR terminar corretamente, eu abriria:

> **PR-10 — Billing Worker Foundation + Commercial Terms: Discount + Deposit**

e não `CreateAppointment` ainda.

A evolução ficaria:

```text
PR-08
Scheduling Core
        ↓
PR-09
Appointment Eligibility
        ↓
PR-10
Billing Worker Foundation
+ Discount
+ Deposit
+ CommercialTerms
        ↓
PR-11
CreateAppointment Authoritative Flow
```

No PR-10, o `billing-worker` se tornará a autoridade para:

```text
base price snapshot
discount applicability
exception approval contracts
final price
deposit requirement
deposit amount
```

e o `operations-worker` consumirá um `CommercialTermsPort`, em vez de incorporar essas regras financeiras.

Só então o PR-11 poderá executar:

```text
eligibility
    ↓
commercial terms
    ↓
idempotency
    ↓
UnitOfWork
    ↓
reserve slot
    ↓
Appointment
    ↓
Audit
    ↓
Outbox
    ↓
COMMIT
```

Esse fatiamento preserva o desenho fail-closed que funcionou bem no PR-08 e evita o erro mais perigoso neste momento: **expor `POST /appointments` antes de todas as pré-condições canônicas terem autoridades reais e verificáveis.**
