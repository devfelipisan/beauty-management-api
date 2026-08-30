Considerando o **PR-10 efetivamente implementado**, o próximo PR deve ser o **PR-11 — Appointment Admission Dependencies**, mas eu refinaria o escopo para não criar mais uma camada apenas de ports `Unavailable*`.

O PR-09 já criou os gates fail-closed e o PR-10 resolveu a fronteira comercial, porém `CreateAppointment` continua bloqueado por quatro autoridades ainda inexistentes:

```text
License
Plan Limits
Customer Restrictions
Assessment
```

A documentação canônica já fornece regras suficientes para avançar significativamente: toda empresa precisa de licença; os estados de licença são definidos; licença suspensa não pode criar novos agendamentos; plano pode impor limites; Customer pode ser bloqueado para novos atendimentos; Service pode exigir avaliação; e avaliações possuem resultados `apto`, `apto com restrições` e `não apto`.  

# PR-11 — Appointment Admission Dependencies

## Objetivo

Transformar:

```text
AppointmentEligibility
        │
        ├── LicenseEligibilityPort
        │      ↓
        │   Unavailable
        │
        ├── PlanLimitPort
        │      ↓
        │   Unavailable
        │
        ├── CustomerRestrictionPort
        │      ↓
        │   Unavailable
        │
        └── AssessmentEligibilityPort
               ↓
            Unavailable
```

em:

```text
AppointmentEligibility
        │
        ├── LicenseEligibilityPort
        │      ↓
        │   REAL
        │
        ├── PlanLimitPort
        │      ↓
        │   REAL
        │
        ├── CustomerRestrictionPort
        │      ↓
        │   REAL
        │
        └── AssessmentEligibilityPort
               ↓
         Clinical Worker
               ↓
             REAL
```

mantendo:

```text
capacidade desconhecida
        ↓
BLOCKED
```

e ainda **sem expor `POST /appointments` neste PR**.

---

## 1. Gate zero — resolver definitivamente o ambiente

Os PRs 08, 09 e 10 continuam carregando um passivo:

```text
Vitest     BLOCKED
Wrangler   BLOCKED
D1 local   NOT EXECUTED
Concurrency proof NOT EXECUTED
```

Neste ponto isso já não deve ser aceito como resultado final de outro PR.

Começar com:

```bash
pwd
git status
git branch --show-current
git log --oneline -20

node --version
npm --version
cat package.json
```

Identificar o package manager:

```bash
find . -maxdepth 2 \
  \( -name "package-lock.json" \
     -o -name "pnpm-lock.yaml" \
     -o -name "yarn.lock" \
     -o -name "bun.lock" \
     -o -name "bun.lockb" \) \
  -print
```

Restaurar dependências pelo lockfile real.

Depois:

```bash
npm run lint
npm run test
npx tsc --build
npx wrangler --version
```

O objetivo é sair de:

```text
"teste escrito"
```

para:

```text
"teste executado"
```

---

# 2. Não trocar o framework de testes

Não resolver Rolldown fazendo:

```text
Vitest
  ↓
Jest
```

sem decisão arquitetural.

Primeiro diagnosticar:

```bash
npm ls vitest
npm ls vite
npm ls rolldown
```

e reconstruir a instalação de forma determinística.

---

# 3. Executar as migrations existentes

Listar:

```bash
find database/d1/migrations \
  -maxdepth 1 \
  -type f \
  -print | sort
```

Esperado até aqui:

```text
0001_operations_foundation.sql
0002_reliability_foundation.sql
0003_scheduling_foundation.sql
```

Aplicar usando a configuração real:

```bash
npx wrangler d1 migrations apply \
  <database-name-from-wrangler-config> \
  --local
```

Não inventar nome de banco.

---

# 4. Executar a prova concorrente pendente

Antes de continuar a cadeia de admissão:

```text
Professional P
09:00 → 10:00
```

Executar duas reservas concorrentes.

Resultado obrigatório:

```text
inserted appointments = 1
time conflicts        = 1
```

Se:

```text
inserted = 2
```

parar PR-11.

Não é aceitável construir mais regras em cima de uma garantia central de Scheduling ainda não comprovada.

---

# 5. Manter `POST /appointments` bloqueado

Durante todo PR-11:

```text
POST /appointments
      X
```

A meta é transformar os dependencies em autoridades reais.

A criação final fica para o PR seguinte.

---

# 6. Dividir PR-11 em quatro capabilities

Internamente:

```text
PR-11.A — Licensing
PR-11.B — Plan Admission Limits
PR-11.C — Customer Restrictions
PR-11.D — Clinical Assessment Eligibility
```

Mas manter como um único PR se o diff continuar administrável.

---

# 7. Onde deve ficar License?

Eu **não criaria um novo `platform-worker` neste momento**.

Para o MVP Free-first:

```text
Licensing bounded context
       ↓
co-deployed no
operations-worker
```

porque `LicenseEligibility` será consultado em praticamente toda admissão de Appointment.

Isso evita:

```text
Operations
    ↓
Platform Worker
    ↓
D1
```

para cada tentativa de agendamento.

Bounded context continua separado logicamente, sem exigir deployment separado.

---

# 8. Documentar essa decisão

Atualizar:

```text
docs/architecture/workers.md
```

com:

```text
Operations Worker

Logical ownership:
- operational tenant
- professionals
- services
- customers
- scheduling
- appointment admission
- SaaS license admission/read-side
```

Mas esclarecer:

```text
Platform administration of licenses
may be split in future.
```

---

# 9. Criar `licensing` via Nest CLI

```bash
nest g module licensing \
  --project operations-worker
```

Não criar controller administrativo neste PR.

Primeiro domínio e eligibility.

---

# 10. Criar `License`

```bash
nest g class \
  licensing/domain/license \
  --project operations-worker \
  --no-spec
```

A documentação estabelece que a licença está vinculada a:

* empresa;
* plano;
* assinatura;
* início;
* vencimento;
* status;
* limites;
* recursos habilitados. 

Não omitir essa relação conceitual.

---

# 11. Status canônicos da License

Formalizar exatamente:

```text
CONFIGURING
TRIAL
ACTIVE
PAYMENT_PENDING
GRACE
SUSPENDED
CANCELED
```

mapeados para:

```text
Em configuração
Em teste
Ativa
Pagamento pendente
Em tolerância
Suspensa
Cancelada
```

Não adicionar:

```text
EXPIRED
BLOCKED
PAST_DUE
```

sem nova regra normativa.

---

# 12. Criar `LicenseOperationalPolicy`

```bash
nest g class \
  licensing/domain/license-operational-policy \
  --project operations-worker \
  --no-spec
```

Ela deve responder:

```text
esta License admite CreateAppointment?
```

e permanecer pura.

---

# 13. Semântica de status

Baseada diretamente nas regras:

```text
CONFIGURING
→ BLOCKED

TRIAL
→ operacional dentro dos recursos liberados

ACTIVE
→ operacional

PAYMENT_PENDING
→ opera conforme política de tolerância

GRACE
→ ainda dentro da política de regularização

SUSPENDED
→ BLOCKED para novos appointments

CANCELED
→ BLOCKED
```

A regra canônica é explícita ao dizer que licença suspensa não pode criar novos agendamentos e que cancelada não pode operar.

---

# 14. `PAYMENT_PENDING` e `GRACE` exigem cuidado

Não inventar:

```text
grace = 7 days
```

ou:

```text
grace = 15 days
```

Se houver data de tolerância configurada, usá-la.

Se a política necessária não puder ser determinada:

```text
PAYMENT_PENDING / GRACE
        +
missing tolerance policy
        ↓
BLOCKED
```

fail-closed.

---

# 15. Criar `LicenseRepository`

```bash
nest g interface \
  licensing/ports/license-repository \
  --project operations-worker
```

Métodos orientados à necessidade:

```text
findCurrentByTenant(
  tenantId
)
```

Não criar CRUD genérico.

---

# 16. Criar adapter D1

```bash
nest g provider \
  licensing/adapters/d1-license-repository \
  --project operations-worker
```

Somente adapter conhece:

```text
D1Database
prepare
bind
SQL
```

---

# 17. Implementar o `LicenseEligibilityPort` real

O PR-09 já criou o port.

Substituir:

```text
UnavailableLicenseEligibilityAdapter
```

por:

```text
D1LicenseEligibilityAdapter
```

ou aplicação equivalente:

```text
LicenseEligibilityPort
       ↓
LicenseRepository
       ↓
LicenseOperationalPolicy
```

---

# 18. Não remover o adapter `Unavailable` imediatamente

Ele continua útil para:

```text
testing
misconfigured deployment
capability absent
```

Mas a composição de produção/local corretamente configurada deve usar o adapter real.

---

# 19. Plan Limits: primeiro congelar a semântica

Aqui existe uma ambiguidade relevante.

A documentação diz que o plano pode limitar:

* usuários;
* profissionais;
* unidades;
* armazenamento;
* quantidade mensal de atendimentos;
* recursos comerciais;
* landing page;
* relatórios;
* integrações;
* fotos;
* equipamentos.

Mas ela **não diz explicitamente** que “quantidade mensal de atendimentos” deve ser consumida no instante da criação do Appointment.

Portanto não faça:

```text
appointment criado
→ monthlyAttendances + 1
```

por inferência.

---

# 20. Criar decisão normativa sobre consumo

Adicionar a:

```text
docs/business/licensing-contracts.md
```

uma matriz:

```text
Limit                          Admission impact
------------------------------------------------
professionals                  cadastro Professional
users                          cadastro User
storage                        upload
photos                         upload
equipment                      cadastro Equipment
monthly attendances            atendimento/session
commercial resources           depende capability
```

E registrar que **quota de atendimento não será consumida no CreateAppointment até que a regra canônica determine isso**.

---

# 21. Então o que `PlanLimitPort` valida no Appointment?

Para este PR, ele deve responder:

```text
o plano possui a capability necessária
para criar novos agendamentos?
```

Isso pode ser modelado como feature/resource habilitado na License, pois RN-LIC-001 já determina que a licença carrega `recursos habilitados`. 

---

# 22. Não inventar nomes comerciais de plano

Não criar:

```text
FREE
BASIC
PREMIUM
ENTERPRISE
```

sem contrato.

Modelar:

```text
Plan
```

por identidade/configuração, não enum comercial arbitrário.

---

# 23. Criar `Plan`

Somente se necessário à persistência da License:

```bash
nest g class \
  licensing/domain/plan \
  --project operations-worker \
  --no-spec
```

Mas mantenha mínimo.

Não implemente billing de assinatura SaaS.

---

# 24. Criar `PlanLimit`

Pode ser Value Object:

```bash
nest g class \
  licensing/domain/plan-limit \
  --project operations-worker \
  --no-spec
```

Sem dezenas de tipos inventados.

---

# 25. Criar `PlanLimitRepository` apenas se necessário

```bash
nest g interface \
  licensing/ports/plan-limit-repository \
  --project operations-worker
```

Ou incorporar os limits no snapshot da License se o modelo documentado determinar isso.

Evite repositories desnecessários.

---

# 26. Implementar `PlanLimitPort`

Substituir:

```text
UnavailablePlanLimitAdapter
```

por implementação real.

Semântica:

```text
required capability enabled?
      │
      ├── yes → READY
      ├── no  → BLOCKED
      └── cannot determine → BLOCKED
```

---

# 27. Não confundir plano SaaS com Cloudflare Free

Isso precisa estar explicitamente protegido:

```text
Tenant Plan
    ≠
Cloudflare Free Tier
```

Cloudflare Free determina custo/capacidade da nossa infraestrutura.

`Plan` determina o que uma clínica contratou.

---

# 28. Customer Restrictions

A documentação permite explicitamente que um Customer seja:

```text
bloqueado para novos atendimentos
```

sem que isso signifique `INACTIVE`. 

Portanto o modelo do PR-05/06 estava correto ao separar lifecycle de restrictions.

---

# 29. Não adicionar `BLOCKED` ao CustomerStatus

Continuar:

```text
CustomerStatus
├── ACTIVE
└── INACTIVE
```

e modelar:

```text
blockedForNewAppointments
```

se a implementação mais simples atender.

---

# 30. Opção MVP recomendada para restriction

Eu usaria uma propriedade operacional explícita:

```ts
blockedForNewAppointments: boolean
```

em vez de criar imediatamente:

```text
CustomerRestriction aggregate
RestrictionType hierarchy
RestrictionRuleEngine
```

porque a regra canônica necessária para Appointment é simplesmente saber se novos atendimentos estão bloqueados.

---

# 31. Atualizar Customer domain

Não precisa criar novo módulo.

Alterar o domínio existente para carregar essa condição operacional.

Sem misturar:

```text
allergy
medications
clinical contraindications
```

na entity Customer.

Esses elementos pertencem a Assessment/Clinical.

---

# 32. Criar application operation específica

Se houver necessidade administrativa de alterar o bloqueio:

```bash
nest g service \
  customers/application/set-appointment-block \
  --project operations-worker
```

Mas só se existir permissão/regra suficiente.

Caso contrário, implemente apenas leitura do estado na fundação e deixe mutação para PR posterior.

---

# 33. Adapter do `CustomerRestrictionPort`

Substituir:

```text
UnavailableCustomerRestrictionAdapter
```

por:

```text
CustomerRestrictionAdapter
     ↓
CustomerRepository
```

Resultado:

```text
blockedForNewAppointments = true
      ↓
CUSTOMER_RESTRICTED
```

---

# 34. Não tratar todos os alertas como bloqueio

A documentação também lista:

```text
alergias
contraindicações
intercorrências
pagamentos pendentes
faltas recorrentes
necessidade de nova avaliação
```

como alertas. 

Não significa:

```text
alert exists
→ appointment blocked
```

Alguns podem apenas alertar.

Bloqueio deve ser explícito.

---

# 35. Assessment é autoridade do Clinical

Agora chega a segunda mudança física importante do PR.

Criar:

```text
clinical-worker
```

porque a documentação atribui ao profissional:

```text
realizar avaliações
```

e as avaliações fazem parte do domínio técnico, não do Operations.

---

# 36. Criar Clinical Worker via CLI

```bash
nest g app clinical-worker
```

Depois:

```bash
find apps/clinical-worker -maxdepth 5 -type f | sort
```

---

# 37. Sanitizar scaffold

Inspecionar e remover somente se for scaffold:

```bash
rm apps/clinical-worker/src/app.controller.ts
rm apps/clinical-worker/src/app.controller.spec.ts
rm apps/clinical-worker/src/app.service.ts
```

Não manter `Hello World`.

---

# 38. Criar Health

```bash
nest g module health \
  --project clinical-worker

nest g controller health \
  --project clinical-worker
```

Resultado:

```json
{
  "status": "ok",
  "service": "beauty-clinical-worker",
  "version": "local"
}
```

Sem D1 query.

---

# 39. Reutilizar fundações

Clinical deve reutilizar:

```text
Config
Observability
ExecutionContext
Authentication
Tenancy
Database
Reliability
```

Não duplicar módulos.

---

# 40. Criar AssessmentModule

```bash
nest g module assessments \
  --project clinical-worker
```

Primeiro domínio, depois controller.

---

# 41. Criar `Assessment`

```bash
nest g class \
  assessments/domain/assessment \
  --project clinical-worker \
  --no-spec
```

A documentação estabelece resultados:

```text
APTO
APTO_COM_RESTRICOES
NAO_APTO
```



Mapear tecnicamente, por exemplo:

```text
FIT
FIT_WITH_RESTRICTIONS
UNFIT
```

se essa convenção for documentada.

Não criar resultados adicionais.

---

# 42. Campos mínimos do Assessment

O agregado precisa no mínimo representar:

```text
id
tenantId
customerId
serviceId
professionalId

result

performedAt
validUntil?
```

A documentação exige profissional, data, hora, empresa e validade quando aplicável. 

---

# 43. Não colocar dados clínicos completos agora

Apesar de RN-AVL permitir:

```text
histórico
alergias
medicamentos
contraindicações
sensibilidade
condição da pele
observações
```



o objetivo do PR-11 é **eligibility de Appointment**.

Não transformar o PR em prontuário clínico.

Esses campos entram posteriormente no módulo clínico completo.

---

# 44. `validUntil` opcional

Não inventar:

```text
validity = 30 days
```

ou:

```text
validity = 90 days
```

A regra diz apenas:

```text
validade, quando aplicável
```



Portanto:

```text
validUntil = null
```

pode representar avaliação sem vencimento configurado, conforme contrato que precisa ser documentado.

---

# 45. Criar `AssessmentEligibilityPolicy`

```bash
nest g class \
  assessments/domain/assessment-eligibility-policy \
  --project clinical-worker \
  --no-spec
```

Ela recebe:

```text
Service requires assessment?
Assessment?
Current date?
```

e decide.

---

# 46. Regra do Service

A documentação já estabelece explicitamente:

```text
Service
→ exige avaliação
```

como configuração técnica. 

Portanto o Service do Operations pode legitimamente receber:

```text
requiresAssessment
```

agora.

Isso não é invenção.

---

# 47. Migration do Service

Adicionar coluna:

```text
requires_assessment
```

com estratégia de migration que preserve registros existentes.

Mas não use default arbitrário sem documentar a compatibilidade.

Para dados existentes, `false` pode ser aceitável somente se o projeto assumir retrocompatibilidade de serviços existentes; caso contrário, migration deve exigir configuração explícita.

---

# 48. Semântica da avaliação

Se:

```text
requiresAssessment = false
```

então:

```text
READY
```

sem consulta clínica necessária.

Isso economiza Service Binding e D1 read.

---

# 49. Se exige avaliação

Então:

```text
requiresAssessment = true
        ↓
buscar avaliação válida
```

---

# 50. Resultado `UNFIT`

Regra canônica:

```text
NAO_APTO
        ↓
BLOCKED
```

Cliente não apto não pode iniciar o serviço sem nova liberação. 

Para `Appointment`, como RN-AGE exige avaliação válida quando obrigatória, tratar esse resultado como blocker de admission.

---

# 51. `FIT_WITH_RESTRICTIONS`

Não transforme automaticamente em:

```text
BLOCKED
```

A própria classificação diferencia:

```text
apto com restrições
```

de:

```text
não apto
```

Logo, o resultado pode ser elegível **desde que não exista uma restrição explícita que proíba agendamento/serviço**.

Isso deve ser formalizado no contract.

---

# 52. Validade temporal

Se:

```text
validUntil != null
```

e:

```text
validUntil < now
```

então:

```text
ASSESSMENT_INVALID
```

Se `validUntil` for null:

```text
sem vencimento explícito
```

não inventar expiração.

---

# 53. Criar AssessmentRepository

```bash
nest g interface \
  assessments/ports/assessment-repository \
  --project clinical-worker
```

Método orientado ao caso:

```text
findLatestForEligibility(
  tenantId,
  customerId,
  serviceId
)
```

Evitar:

```text
findAllAssessments()
```

para o check.

---

# 54. Adapter D1

```bash
nest g provider \
  assessments/adapters/d1-assessment-repository \
  --project clinical-worker
```

Query deve ser:

```text
tenant
+
customer
+
service
+
ordered by performedAt desc
+
limit 1
```

e indexada.

---

# 55. Criar Application Service

```bash
nest g service \
  assessments/application/check-assessment-eligibility \
  --project clinical-worker
```

Esse é o caso de uso interno que Operations precisa.

---

# 56. Não expor prontuário por HTTP ainda

Pode continuar sem:

```http
POST /assessments
GET /assessments/:id
```

se os fluxos administrativos ainda não estão no escopo.

O objetivo é construir a autoridade e o contrato interno.

Fixtures/integration tests podem criar Assessment diretamente via repository test setup.

---

# 57. Contrato compartilhado Clinical

Em:

```text
libs/contracts/src/assessment-eligibility/
```

criar somente contratos de transporte.

Por exemplo:

```text
CheckAssessmentEligibilityRequest
CheckAssessmentEligibilityResponse
```

Nunca compartilhar `Assessment` entity.

---

# 58. Service Binding Operations → Clinical

O fluxo passa a ser:

```text
Operations Worker
       │
AssessmentEligibilityPort
       │
       ▼
Service Binding
       │
       ▼
Clinical Worker
       │
CheckAssessmentEligibility
       │
       ▼
D1
```

---

# 59. Implementar adapter no Operations

Substituir:

```text
UnavailableAssessmentEligibilityAdapter
```

por adapter de infraestrutura que usa o binding Clinical.

Mas mantenha o `Unavailable*` para ambientes sem binding configurado.

---

# 60. Falha no Clinical continua fail-closed

Se o binding:

```text
timeout
missing
error
```

então:

```text
ASSESSMENT_CAPABILITY_UNAVAILABLE
        ↓
BLOCKED
```

Não:

```text
clinical unavailable
→ assume valid
```

---

# 61. Configurar Service Binding

Depois de o Wrangler estar reparado, configurar localmente:

```text
operations-worker
    ↓
CLINICAL_SERVICE
    ↓
clinical-worker
```

Usar a convenção real do projeto.

Não criar endpoint HTTP público entre ambos.

---

# 62. Billing Service Binding pendente também deve ser resolvido

PR-10 criou:

```text
CommercialTermsPort
+
fail-closed adapter
```

mas o binding real não foi validado.

Aproveitar que Wrangler agora virou gate e configurar:

```text
operations-worker
    ↓
BILLING_SERVICE
    ↓
billing-worker
```

Isso não significa implementar novas regras de Billing.

É apenas materializar a integração já criada no PR-10.

---

# 63. Não fazer fan-out no BFF

Essas chamadas pertencem à Business API:

```text
Operations
  → Clinical
  → Billing
```

O BFF não deve decidir:

```text
License
Assessment
CommercialTerms
```

---

# 64. Migrations do PR-11

Eu esperaria algo como:

```text
0004_admission_dependencies.sql
```

contendo somente estados realmente persistentes:

```text
licenses
license_limits / enabled capabilities
customer appointment-block field
service requires_assessment
```

e:

```text
0005_assessment_eligibility.sql
```

contendo:

```text
assessments
```

Separar em duas migrations facilita ownership e rollback.

---

# 65. License table

Conceitualmente:

```text
licenses
├── id
├── tenant_id
├── plan_id
├── subscription_reference
├── starts_at
├── expires_at
├── status
├── created_at
└── updated_at
```

Não guardar credenciais de pagamento.

---

# 66. License capabilities/limits

Preferir estrutura explícita e extensível:

```text
license_capabilities
```

e/ou:

```text
license_limits
```

sem inventar dezenas de colunas.

Mas evitar JSON gigante se queries de admissão precisarem interpretar todo documento a cada request.

---

# 67. Índice principal da License

Precisamos resolver rapidamente:

```text
tenant → current license
```

Portanto índice/constraint tenant-aware.

Idealmente uma única licença operacional corrente por tenant, mas não crie constraint de histórico sem analisar requisitos de contratação/licença.

RN-GER-005 impede duplicar licença para a mesma contratação. 

---

# 68. Assessment indexes

No mínimo:

```text
tenant_id
customer_id
service_id
performed_at
```

para `findLatestForEligibility`.

Não carregar histórico completo para descobrir a última avaliação.

---

# 69. Customer restriction não precisa de query extra

Se armazenarmos:

```text
blocked_for_new_appointments
```

na própria row Customer:

```text
CustomerRepository.findById()
```

já traz a informação.

Isso reduz D1 reads.

É particularmente coerente com o Free Tier.

---

# 70. Service assessment também não precisa de query extra

O `Service` já é carregado no `CheckAppointmentEligibility`.

Carregar:

```text
requiresAssessment
```

na mesma entidade evita outra consulta.

Resultado:

```text
Service requiresAssessment = false
→ nem chama Clinical Worker
```

Excelente para custo.

---

# 71. Reestruturar `CheckAppointmentEligibility`

Depois do PR-11:

```text
1 Tenant
2 Customer
3 Service
4 Professional
5 Professional-Service
6 License
7 Plan capability
8 Customer block
9 Assessment only if required
10 Availability
11 Conflict
```

Fail-fast.

---

# 72. A ordem pode ser otimizada

Eu colocaria checks baratos/local-D1 antes de Service Bindings.

Por exemplo:

```text
Tenant invalid
→ não chamar Clinical

Customer blocked
→ não chamar Billing/Clinical

Service inactive
→ não chamar Clinical
```

Isso reduz Workers requests.

---

# 73. CommercialTerms ainda não pertence ao Eligibility puro

Eu manteria:

```text
AppointmentEligibility
```

para admissão.

Depois:

```text
CommercialTerms
```

é chamado no futuro `CreateAppointment`.

Não misturar preço com eligibility se não houver necessidade.

---

# 74. Plan capability também é admission

Esse sim pertence ao Eligibility porque RN-AGE-001 exige limites do plano antes da criação. 

---

# 75. Testes da License Policy

Obrigatórios:

```text
CONFIGURING
→ BLOCKED

TRIAL
→ allowed quando recurso habilitado

ACTIVE
→ allowed

SUSPENDED
→ BLOCKED

CANCELED
→ BLOCKED
```

E comportamento documentado para:

```text
PAYMENT_PENDING
GRACE
```

---

# 76. Testes de plan capability

```text
scheduling capability enabled
→ continue
```

```text
capability disabled
→ PLAN_LIMIT_REACHED / PLAN_FEATURE_DISABLED
```

Use motivo semântico correto.

Não chamar tudo de `PLAN_LIMIT_REACHED` se o problema for feature desabilitada.

Pode adicionar um código canônico como:

```text
PLAN_FEATURE_NOT_AVAILABLE
```

se documentado.

---

# 77. Customer restriction tests

```text
ACTIVE
blocked=false
→ continue
```

```text
ACTIVE
blocked=true
→ CUSTOMER_RESTRICTED
```

```text
INACTIVE
blocked=false
→ CUSTOMER_INACTIVE
```

São preocupações independentes.

---

# 78. Assessment tests

Cobrir:

```text
requiresAssessment=false
→ READY sem chamada externa
```

```text
requiresAssessment=true
+ no assessment
→ BLOCKED
```

```text
requiresAssessment=true
+ FIT
→ READY
```

```text
requiresAssessment=true
+ FIT_WITH_RESTRICTIONS
→ decision conforme restriction contract
```

```text
requiresAssessment=true
+ UNFIT
→ BLOCKED
```

```text
expired
→ BLOCKED
```

---

# 79. Teste importante de não chamada

Com:

```text
requiresAssessment=false
```

provar que:

```text
AssessmentEligibilityPort.check()
```

não foi chamado.

Isso economiza Worker request.

---

# 80. Teste de fail-fast

Exemplo:

```text
License SUSPENDED
```

deve impedir:

```text
Clinical call
Availability query
Conflict query
```

se esses checks forem posteriores.

---

# 81. Integration test Operations → Clinical

Com runtime Cloudflare local:

```text
Operations
    ↓ Service Binding
Clinical
    ↓
Assessment eligibility
```

deve responder corretamente.

Não considerar unit mock como prova de integração.

---

# 82. Integration test Operations → Billing

Como PR-10 não teve binding real:

```text
Operations
    ↓ Service Binding
Billing
    ↓
CommercialTerms
```

deve ser provado agora.

Mesmo que `CreateAppointment` ainda não use os Terms.

---

# 83. Cross-tenant Assessment

Obrigatório:

```text
Tenant A
Customer A
```

não pode utilizar:

```text
Assessment Tenant B
```

nem mesmo se IDs de Customer/Service coincidirem.

---

# 84. Cross-tenant License

```text
Tenant A
```

nunca pode usar:

```text
License Tenant B
```

para passar eligibility.

---

# 85. Audit de License

Neste PR estamos primariamente lendo License.

Não gerar Audit para:

```text
check license
```

Toda verificação de Appointment criaria write amplification.

Quando License for ativada/suspensa/reativada, aí sim Audit é obrigatório; RN-LIC-005 explicitamente exige auditoria na reativação. 

Esses comandos administrativos podem ficar para PR de Platform Administration.

---

# 86. Audit de Customer restriction

Consulta também não gera audit.

Alteração de bloqueio poderá gerar futuramente, se existir comando.

---

# 87. Assessment persistence

Assessment é registro crítico e avaliações vinculadas devem ser preservadas historicamente.

Logo o Repository não deve fornecer:

```text
physical delete
```

para assessments utilizados.

---

# 88. Observabilidade da eligibility

Agora teremos um check bastante importante.

Registrar:

```text
operation
tenantId
actorId
serviceId
professionalId
result
reasonCode
duration
```

Não:

```text
customer name
assessment content
allergies
medications
contraindications
```

---

# 89. Observabilidade Clinical

No Clinical Worker:

```text
CheckAssessmentEligibility
```

pode registrar:

```text
tenantId
serviceId
assessmentResult category
eligibility
```

mas não conteúdo clínico.

---

# 90. Cloudflare Free — orçamento de requests

Esse PR começa a materializar comunicação interna real.

Um futuro CreateAppointment pode envolver:

```text
Browser
  ↓
BFF
  ↓
Operations
  ↓
Clinical (somente se required)
  ↓
Billing
```

Precisamos evitar chamadas desnecessárias.

Por isso:

```text
requiresAssessment=false
→ Clinical requests = 0
```

é requisito de eficiência.

---

# 91. Billing também deve ser chamado uma única vez

Futuramente:

```text
calculateCommercialTerms()
```

uma chamada.

Não:

```text
calculateDiscount()
calculateDeposit()
getBasePrice()
```

separadamente.

---

# 92. D1 reads

Eligibility deverá permanecer bounded.

Uma tentativa normal deve envolver aproximadamente:

```text
Tenant
Customer
Service
Professional
ProfessionalService
License
Plan/capability
Availability/conflict
Assessment only when required
```

Documentar reads reais depois da implementação.

---

# 93. Não usar KV para License agora

License é uma decisão de segurança operacional.

Com eventual mudança de status:

```text
ACTIVE → SUSPENDED
```

precisamos de consistência adequada.

Não introduzir KV cache antes de definir invalidation segura.

---

# 94. Health continua isolado

Nos três Workers:

```text
operations-worker
billing-worker
clinical-worker
```

`GET /health` deve continuar:

```text
D1 reads = 0
D1 writes = 0
Service Bindings = 0
Audit = 0
Outbox = 0
```

---

# 95. Architecture tests

Adicionar regras:

```text
Operations Domain
  → Clinical Domain
FAIL

Operations Domain
  → Billing Domain
FAIL

Operations Application
  → Clinical D1 adapter
FAIL

Operations Application
  → Billing implementation
FAIL
```

Permitido:

```text
Operations Application
  → AssessmentEligibilityPort
  → adapter
```

e:

```text
Operations Application
  → CommercialTermsPort
```

---

# 96. Clinical architecture test

Proibir:

```text
Assessment Domain
→ NestJS
→ Cloudflare
→ D1
→ Operations Domain
```

---

# 97. Migrations não rodam no bootstrap

Continuar:

```text
Worker startup
    X
migration apply
```

Migrations somente via tooling/deploy.

---

# 98. Estrutura esperada

```text
apps/
├── operations-worker/
│   └── src/
│       ├── licensing/
│       ├── customers/
│       ├── services/
│       ├── appointments/
│       └── appointment-eligibility/
│
├── billing-worker/
│   └── ...
│
└── clinical-worker/
    └── src/
        ├── health/
        └── assessments/
            ├── domain/
            ├── application/
            ├── ports/
            └── adapters/
```

---

# 99. Resultado esperado no `AppointmentEligibility`

Ao final do PR-11:

```text
Tenant active                   REAL
Customer active                 REAL
Service active                  REAL
Professional active             REAL
Professional enabled            REAL
Availability                    REAL
Conflict                        REAL

License                         REAL
Plan admission                  REAL
Customer restrictions           REAL
Assessment when required        REAL
```

Isso significa:

```text
RN-AGE-001
→ tecnicamente coberta
```

desde que todos os testes e integrações passem. As pré-condições completas são justamente empresa ativa, licença operacional, cliente/serviço/profissional válidos, habilitação, disponibilidade, ausência de conflito, avaliação quando obrigatória, restrições e limites do plano.

---

# 100. Commercial Terms continua separado

Depois do PR-10:

```text
Discount / Deposit / CommercialTerms
→ Billing authority
```

Após PR-11:

```text
Admission
→ Operations + Clinical + Licensing
```

Logo teremos finalmente:

```text
Admission        READY
CommercialTerms  READY
Scheduling       READY
Reliability      READY
```

que são as quatro fundações necessárias para `CreateAppointment`.

---

# 101. Definition of Done — ambiente

```text
[ ] Vitest executável
[ ] lint executável
[ ] Wrangler executável

[ ] migrations 0001–0003 PASS
[ ] migration PR-11 PASS

[ ] concurrency proof PR-08 PASS

[ ] operations build PASS
[ ] billing build PASS
[ ] clinical build PASS
```

Eu não aceitaria novamente “Wrangler indisponível” como estado final sem que exista um blocker externo realmente documentado.

---

# 102. Definition of Done — License

```text
[ ] License domain implementado

[ ] somente status canônicos

[ ] LicenseOperationalPolicy pura

[ ] SUSPENDED bloqueia Appointment

[ ] CANCELED bloqueia

[ ] CONFIGURING bloqueia operação pública

[ ] TRIAL respeita capabilities

[ ] ACTIVE permite capacidades contratadas

[ ] PAYMENT_PENDING/GRACE tratados conforme política documentada

[ ] nenhuma tolerância temporal inventada

[ ] LicenseRepository tenant-aware

[ ] LicenseEligibilityPort agora possui adapter real
```

---

# 103. Definition of Done — Plan

```text
[ ] limits/capabilities normatizados

[ ] Cloudflare Free != Tenant Plan

[ ] nenhum nome de plano comercial inventado

[ ] nenhuma quota numérica inventada

[ ] monthly attendances não é consumido em CreateAppointment sem regra

[ ] capability necessária a Scheduling verificável

[ ] PlanLimitPort possui implementação real
```

---

# 104. Definition of Done — Customer Restriction

```text
[ ] CustomerStatus continua ACTIVE/INACTIVE

[ ] BLOCKED não virou CustomerStatus

[ ] restriction operacional separada

[ ] blocked customer impede Appointment

[ ] alertas não viraram bloqueio automaticamente

[ ] CustomerRestrictionPort possui implementação real
```

---

# 105. Definition of Done — Assessment

```text
[ ] clinical-worker criado via Nest CLI

[ ] scaffold removido

[ ] GET /health funcionando

[ ] Assessment domain criado

[ ] FIT / FIT_WITH_RESTRICTIONS / UNFIT

[ ] professional registrado

[ ] tenant registrado

[ ] customer registrado

[ ] service registrado

[ ] performedAt registrado

[ ] validUntil opcional

[ ] nenhuma duração padrão inventada

[ ] UNFIT bloqueia

[ ] AssessmentRepository tenant-aware

[ ] D1 adapter implementado

[ ] requiresAssessment implementado conforme RN-SRV-004

[ ] Service Binding Operations → Clinical funcionando

[ ] AssessmentEligibilityPort possui adapter real
```

---

# 106. Definition of Done — Service Bindings

```text
[ ] Operations → Clinical validado

[ ] Operations → Billing validado

[ ] contratos compartilhados sem Domain entities

[ ] nenhum HTTP público Worker→Worker quando binding atende

[ ] binding ausente continua fail-closed

[ ] erros downstream não viram allow
```

---

# 107. Definition of Done — testes

```text
[ ] License unit tests PASS

[ ] Plan admission tests PASS

[ ] Customer restriction tests PASS

[ ] Assessment tests PASS

[ ] Assessment expiration tests PASS

[ ] Assessment cross-tenant tests PASS

[ ] License cross-tenant tests PASS

[ ] AppointmentEligibility tests PASS

[ ] fail-fast tests PASS

[ ] no-call-Clinical-when-not-required PASS

[ ] Service Binding integration PASS

[ ] PR-08 concurrency test PASS

[ ] Reliability regression PASS

[ ] architecture tests PASS

[ ] lint PASS

[ ] tsc --build PASS

[ ] Vitest PASS

[ ] Wrangler types PASS

[ ] Wrangler local PASS

[ ] wrangler dry-run PASS

[ ] health smoke PASS

[ ] git diff --check PASS
```

---

# 108. O que NÃO deve entrar no PR-11

```text
POST /appointments

Payment
Refund
Credit
Package

Session

Technical Record

Equipment

Photos

R2

KV

Queue
Cron
Outbox consumer

License administration complete
SaaS subscription charging

Customer clinical record complete
Assessment full form builder
```

---

# 109. Relatório pós-PR obrigatório

O Codex deverá finalizar informando:

```text
PR-11 — Appointment Admission Dependencies

1. Estado anterior
2. Environment recovery
3. Wrangler/D1 qualification
4. PR-08 concurrency proof
5. Licensing
6. License status policy
7. Plan capability/limits
8. Customer restrictions
9. Clinical worker foundation
10. Assessment domain
11. Assessment eligibility
12. Service requiresAssessment
13. Operations → Clinical binding
14. Operations → Billing binding
15. Fail-closed behavior
16. Tenant isolation
17. Migrations
18. D1 reads
19. Workers request impact
20. Observability
21. Architecture tests
22. Unit tests
23. Integration tests
24. Health
25. RN-AGE-001 coverage matrix
26. Remaining blockers
27. Next PR
```

---

# 110. Próximo PR após PR-11

Se o PR-11 encerrar com todos esses gates verdes, aí finalmente deve vir:

> **PR-12 — CreateAppointment Authoritative Flow**

Esse será o primeiro PR autorizado a expor:

```http
POST /tenants/:tenantId/appointments
```

e o fluxo deverá ser:

```text
HTTP
 │
 ▼
Authentication
 │
 ▼
Trusted Tenant
 │
 ▼
CreateAppointment
 │
 ├── AppointmentEligibility
 │      ├── Tenant
 │      ├── Customer
 │      ├── Service
 │      ├── Professional
 │      ├── License
 │      ├── Plan
 │      ├── Restrictions
 │      ├── Assessment
 │      ├── Availability
 │      └── Conflict
 │
 ├── CommercialTermsPort
 │      ↓
 │   Billing Worker
 │
 ▼
Idempotency
 │
 ▼
UnitOfWork
 │
 ├── ScheduleReservation
 ├── Appointment snapshot
 ├── Audit
 ├── Outbox
 └── Idempotency completion
 │
 ▼
COMMIT
 │
 ▼
201 Created
```

Isso também permitirá preencher todos os campos obrigatórios de `RN-AGE-002`, incluindo preço-base, desconto, preço final, sinal, origem e status, sem colocar lógica financeira no Operations. 

**Portanto, com o PR-10 concluído, o PR-11 deve eliminar os quatro adapters de admissão ainda indisponíveis e materializar o `clinical-worker`. O `POST /appointments` só passa a ser legítimo no PR-12, quando `Scheduling + Reliability + Eligibility + CommercialTerms` estiverem todos baseados em autoridades reais e testadas.**
