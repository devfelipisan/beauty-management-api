# PR-05 — Operations Worker Foundation + Architectural Convergence

## Objetivo

Materializar o primeiro Business Worker da nova topologia e tornar o repositório capaz de responder, sem ambiguidades:

```text
Qual worker é responsável por Operations?
Qual a sua fronteira?
Qual persistência está aprovada?
Qual binding deverá utilizar?
Quais contratos de status são normativos?
Quais componentes dos PR-00..PR-04 ele reutiliza?
Quais endpoints existem nesta etapa?
```

Ao final:

```text
Cloudflare
   │
   ▼
operations-worker
   │
   ├── Config
   ├── Observability
   ├── Execution Context
   ├── Authentication/Tenancy foundation, se já implementada
   └── Health

Nenhum domínio funcional ainda.
```

---

# 1. Pré-condição: não presumir os PRs anteriores

O Codex deve começar verificando o repositório real.

```bash
pwd

git status

git branch --show-current

git log --oneline -20
```

Depois:

```bash
find . -maxdepth 3 -type f | sort
```

E especificamente:

```bash
find apps -maxdepth 5 -type f | sort 2>/dev/null || true
find libs -maxdepth 5 -type f | sort 2>/dev/null || true
find docs -maxdepth 5 -type f | sort 2>/dev/null || true
```

O objetivo é confirmar o que realmente existe de:

```text
PR-00
PR-01
PR-02
PR-03
PR-04
```

Não assumir implementação por causa do histórico do chat.

---

# 2. Ler a fonte de verdade antes do código

A ordem de leitura deve ser:

```text
1. AGENTS.md
2. tarefa PR-05
3. docs/business-rules.md
4. docs/adr/*
5. docs/architecture.md
6. docs/foundation.md
7. README.md
8. código
9. testes
10. TODO.md
```

A própria documentação consolidada do projeto estabelece essa ideia de hierarquia e que divergências precisam ser explicitadas, não resolvidas por inferência. 

---

# 3. Registrar o baseline

Criar no relatório do PR uma tabela semelhante a:

| Fundamento           | Esperado                      | Estado real  |
| -------------------- | ----------------------------- | ------------ |
| Health foundation    | existente                     | PASS/MISSING |
| Observe              | existente                     | PASS/MISSING |
| ExecutionContext     | existente                     | PASS/MISSING |
| Authentication       | existente                     | PASS/MISSING |
| Tenancy              | existente                     | PASS/MISSING |
| Database abstraction | existente                     | PASS/MISSING |
| operations-worker    | inexistente                   | MISSING      |
| D1 binding           | esperado pelo roadmap recente | UNDECIDED    |
| PostgreSQL migration | existente                     | PRESENT      |

Se qualquer fundação obrigatória anterior estiver ausente:

```text
não reconstruir silenciosamente
```

Registrar e limitar o PR.

---

# 4. Resolver a divergência PostgreSQL × D1

Esse é um gate obrigatório.

A proposta técnica original define:

```text
Banco = PostgreSQL / Supabase
```

com justificativas relacionadas a:

```text
RLS
FK composta
transactions
SELECT FOR UPDATE
serializable isolation
exclusion constraints
idempotency
outbox
audit
```

Ao mesmo tempo, o roadmap mais recente pretende priorizar Cloudflare Free e D1.

Essas duas decisões não podem coexistir implicitamente.

---

# 5. Criar ADR da persistência do MVP

Usar a próxima numeração disponível:

```bash
mkdir -p docs/adr

touch docs/adr/XXXX-persistence-strategy-for-cloudflare-workers.md
```

Conteúdo mínimo:

```text
Status
Context
Decision
Consequences
Alternatives
Superseded decisions
Migration path
Operational constraints
```

A decisão deve dizer uma das duas coisas.

### Opção A — PostgreSQL permanece normativo

```text
Workers
   ↓
PostgreSQL/Supabase
```

Nesse caso:

```text
não criar env.DB D1
não criar migration D1
não criar D1 adapter
```

### Opção B — D1 passa a ser persistência oficial do MVP

Nesse caso o ADR precisa declarar explicitamente quais garantias PostgreSQL terão alternativa ou ficarão adiadas.

Por exemplo:

```text
RLS
→ autorização obrigatória na Application + tenant predicates

exclusion constraints
→ estratégia específica futura para Appointment

SELECT FOR UPDATE
→ não disponível como no PostgreSQL;
  operações concorrentes críticas exigem outra prova

FK composta
→ modelagem compatível D1/SQLite ou validação adicional
```

Não tratar D1 como driver drop-in.

---

# 6. Não alterar a decisão por conveniência

O Codex não pode escolher D1 simplesmente porque:

```text
Cloudflare = D1
```

A documentação atual do projeto tem PostgreSQL como escolha técnica explícita. 

Logo:

```text
persistência
=
decisão arquitetural
```

não:

```text
persistência
=
detalhe do worker
```

---

# 7. Atualizar `TODO.md`

Pesquisar:

```bash
grep -R "env.DB" -n . 2>/dev/null || true
grep -R "D1" -n TODO.md docs . 2>/dev/null || true
```

Depois do ADR, `TODO.md` não deve continuar dizendo vagamente:

```text
definir env.DB
```

Deve apontar para a decisão.

Exemplo:

```text
[resolved] Persistence binding strategy defined by ADR-XXXX.
```

ou manter pendência específica se a decisão ainda for PostgreSQL.

---

# 8. Formalizar a topologia de Workers

Criar ou atualizar:

```text
docs/architecture/workers.md
```

A topologia-alvo:

```text
Frontend
   │
   ▼
BFF Worker
   │
   ├──────────────┐
   ▼              ▼
Operations     Clinical
Worker         Worker
   │              │
   └─────┬────────┘
         ▼
     Billing Worker

Async Worker
   ├── scheduled jobs
   ├── notifications
   ├── outbox
   └── maintenance
```

Mas separar claramente:

```text
Target topology
```

de:

```text
Currently materialized
```

---

# 9. Definir ownership do Operations Worker

O documento deve congelar o ownership futuro:

```text
Operations Worker
```

será responsável por:

```text
Tenant operational configuration
Professional
Service
Customer
Appointment
Availability
Confirmation
Check-in
Rebooking/Cancel operational flow
```

Mas neste PR apenas a fundação do runtime é criada.

Não significa implementar tudo agora.

---

# 10. O que Operations NÃO deve possuir

Registrar explicitamente:

```text
Technical Session execution
Clinical parameters
Equipment session usage
Photos
Payment ledger
Refunds
Deposit financial accounting
File binaries
BFF composition
```

Esses itens pertencem a outros contexts/workers.

Isso ajuda a evitar um `operations-worker` monolítico demais.

---

# 11. Criar `operations-worker` via Nest CLI

Somente depois dos gates documentais.

```bash
nest g app operations-worker
```

Em seguida:

```bash
find apps/operations-worker -maxdepth 5 -type f | sort
```

---

# 12. Remover o scaffold padrão

O Nest provavelmente criará:

```text
app.controller.ts
app.service.ts
app.controller.spec.ts
```

Inspecionar:

```bash
cat apps/operations-worker/src/app.controller.ts
cat apps/operations-worker/src/app.service.ts
```

Se forem scaffold `Hello World`:

```bash
rm apps/operations-worker/src/app.controller.ts
rm apps/operations-worker/src/app.controller.spec.ts
rm apps/operations-worker/src/app.service.ts
```

Depois ajustar:

```text
app.module.ts
```

Nenhum endpoint `/` deve sobreviver.

---

# 13. Criar Health via CLI

```bash
nest g module health \
  --project operations-worker

nest g controller health \
  --project operations-worker
```

Não criar service se não houver lógica que justifique.

Estrutura:

```text
apps/operations-worker/src/
├── app.module.ts
├── main.ts
└── health/
    ├── health.module.ts
    └── health.controller.ts
```

---

# 14. Contrato do Health

A única rota do PR deve ser:

```http
GET /health
```

Resposta mínima:

```json
{
  "status": "ok",
  "service": "beauty-operations-worker"
}
```

Opcionalmente:

```text
version
environment
timestamp
```

se esses campos já fizerem parte do contrato dos Workers anteriores.

Não inventar formato novo se já houver Health padrão.

---

# 15. Health não consulta persistência

Obrigatório:

```text
GET /health
    ↓
0 database reads
0 database writes
0 R2 operations
0 KV operations
```

A meta é saúde do processo/runtime.

Readiness de dependências, se necessário futuramente, deve ser outro conceito.

---

# 16. Reutilizar observabilidade existente

Se PR-02 já criou uma library compartilhada, o Worker deve importá-la.

Não criar:

```text
OperationsObserveModule
```

se já existe:

```text
ObservabilityModule
```

ou equivalente.

O projeto deve continuar seguindo:

```text
createObserveModule(...)
+
ObserveModule.forRoot(...)
```

conforme a estratégia já adotada.

---

# 17. Identidade de observabilidade

Configurar:

```text
service.name = beauty-operations-worker
```

e preservar:

```text
requestId
correlationId
traceId
```

Se ExecutionContext já possui:

```text
tenantId
actorId
source
service
```

o Operations Worker deve usar o mesmo contrato.

---

# 18. Middleware/interceptor já existente

Se o projeto já possui middleware/interceptor para:

```text
requestId
correlationId
trace context
logging
```

registrá-lo no Operations Worker.

Não reimplementar.

Fluxo desejado:

```text
Request
  ↓
Correlation middleware
  ↓
Observe
  ↓
Guards futuros
  ↓
Controller
```

---

# 19. Não criar auth nova neste PR

Se PR-03 já existe:

```text
AuthenticationModule
TenancyModule
```

o Worker pode compor esses módulos.

Mas `/health` continua público.

Se PR-03 ainda não estiver fisicamente presente:

```text
não implementar auth dentro do PR-05
```

Registrar gap.

---

# 20. Não criar banco apenas porque o worker existe

Mesmo se o ADR escolher D1:

```text
operations-worker
```

não precisa receber binding `DB` neste PR se não executa query.

Isso é importante para evitar configuração inútil.

O princípio deve ser:

```text
binding only when required
```

---

# 21. Se D1 for aprovado, preparar apenas configuração

Caso a decisão normativa seja D1, criar estrutura preparada, por exemplo:

```text
wrangler/
└── operations/
    └── wrangler.jsonc
```

ou a convenção já presente no projeto.

Mas sem:

```text
database_id inventado
```

e sem provisionamento remoto.

---

# 22. Se PostgreSQL permanecer oficial

Então a configuração do Operations Worker deve manter apenas as envs/ports necessárias ao adapter PostgreSQL já planejado.

Não introduzir:

```text
env.DB
```

porque isso contradiz o ADR.

---

# 23. Não executar criação remota

Proibido neste PR:

```bash
wrangler d1 create ...
wrangler deploy
```

Permitido:

```bash
npx wrangler deploy --dry-run
```

---

# 24. Definir contratos normativos de status

Este PR deve resolver especificamente o alerta do Codex sobre statuses.

Criar:

```text
docs/business/operations-contracts.md
```

ou atualizar o documento canônico equivalente.

---

# 25. TenantStatus

A documentação já define os estados operacionais da empresa:

```text
ativa
inativa
suspensa
cancelada
```

e determina que inativa, suspensa ou cancelada não pode criar novos agendamentos.

Logo, o contrato pode congelar:

```text
ACTIVE
INACTIVE
SUSPENDED
CANCELED
```

Mapeando explicitamente:

```text
ativa       → ACTIVE
inativa     → INACTIVE
suspensa    → SUSPENDED
cancelada   → CANCELED
```

---

# 26. Professional lifecycle

A regra funcional confirma:

```text
Professional ativo
Professional inativo
```

e estabelece comportamento para ambos.

Portanto:

```text
ACTIVE
INACTIVE
```

pode ser formalizado.

Não criar:

```text
SUSPENDED
BLOCKED
ARCHIVED
```

---

# 27. Service lifecycle

A mesma lógica:

```text
ACTIVE
INACTIVE
```

Serviço inativo não recebe novo agendamento, mas continua disponível historicamente.

Não precisa de FSM nesse momento.

---

# 28. Customer status

A especificação confirma que:

```text
cliente é criado ativo
cliente pode ser inativado
```

Então o ciclo mínimo pode ser:

```text
ACTIVE
INACTIVE
```

Mas documentar:

```text
ANONYMIZED
BLOCKED
```

como conceitos separados até haver contrato explícito de status.

---

# 29. CustomerStatus ≠ RelationshipProfile

Esse ponto deve ser formalizado.

```text
CustomerStatus
  ACTIVE
  INACTIVE
```

Enquanto:

```text
RelationshipProfile
  NEW
  OLD
  REGULAR/LOYAL
  INACTIVE
  RECURRING_ABSENCES
```

são classificações comerciais.

A documentação do MVP apresenta esses perfis separadamente.

Não misturar ambos num único enum.

---

# 30. Não criar TypeScript domain models ainda

Mesmo com os contratos documentados, o PR-05 deve parar antes de:

```text
Tenant entity
Professional entity
Service entity
Customer entity
```

A formalização serve de entrada para o próximo PR.

Assim:

```text
docs contract
    ↓
review
    ↓
PR-06 domain code
```

---

# 31. Não criar módulos de negócio

Não executar ainda:

```bash
nest g module tenants --project operations-worker
nest g module professionals --project operations-worker
nest g module services --project operations-worker
nest g module customers --project operations-worker
```

Nem controllers.

---

# 32. Não criar migration funcional

Não criar neste PR:

```sql
CREATE TABLE tenants
CREATE TABLE professionals
CREATE TABLE services
CREATE TABLE customers
```

O PR é de convergência + runtime.

---

# 33. Separar migrations por tecnologia

Caso o repositório tenha migration PostgreSQL e a nova decisão permita D1, organizar explicitamente:

```text
database/
├── postgres/
│   └── migrations/
└── d1/
    └── migrations/
```

Não misturar SQL incompatível.

Se PostgreSQL permanecer oficial:

```text
não criar database/d1
```

---

# 34. Preservar migration PostgreSQL já existente

Não apagar a migration PostgreSQL só porque outra estratégia está sendo considerada.

Ela pode permanecer:

```text
normativa
```

ou:

```text
adapter futuro
```

dependendo do ADR.

Mas a documentação precisa dizer qual dos dois.

---

# 35. Architecture boundaries

Adicionar testes que impeçam deriva.

Exemplos conceituais:

```text
operations-worker health → allowed
operations-worker domain modules → absent in PR-05
```

```text
bff-worker → D1Database
FAIL
```

```text
domain → Cloudflare SDK
FAIL
```

```text
domain → NestJS
FAIL
```

```text
application → D1Database/Postgres client
FAIL
```

A arquitetura consolidada já determina que domínio e aplicação não importem frameworks ou infraestrutura diretamente.

---

# 36. Teste do Health

Criar unit test:

```text
GET /health
→ 200
```

e:

```text
body.status
→ ok
```

---

# 37. Teste de ausência do scaffold

Provar que:

```text
GET /
```

não retorna:

```text
Hello World!
```

Dependendo do comportamento do Nest, pode resultar em:

```text
404
```

que é o esperado.

---

# 38. Teste de observabilidade

Validar que uma chamada para `/health` produz contexto com:

```text
requestId
correlationId
traceId
service
```

sem:

```text
JWT
PII
database credentials
```

---

# 39. Teste de independência de banco

Provar:

```text
start operations-worker
sem DB configurado
↓
health funciona
```

Esse teste é muito importante nesta fase.

---

# 40. Free Tier

O Operations Worker deve nascer com footprint mínimo.

Neste PR:

```text
Workers requests
→ somente health/testes

D1
reads  = 0
writes = 0

R2
A = 0
B = 0

KV
reads  = 0
writes = 0
```

A proposta técnica também recomenda Workers como camada leve, orientada a I/O, evitando CPU desnecessária.

---

# 41. Build

Executar:

```bash
nest build operations-worker
```

Se houver os demais apps já materializados:

```bash
nest build bff-worker
nest build clinical-worker
nest build billing-worker
nest build async-worker
```

Mas não criar esses apps só para satisfazer o comando.

---

# 42. Lint e typecheck

Executar os scripts reais do repositório:

```bash
npm run lint
npm run typecheck
```

Se não existirem:

```bash
cat package.json
```

e usar os scripts disponíveis.

Não inventar scripts.

---

# 43. Tests

```bash
npm run test
```

ou os comandos reais encontrados no `package.json`.

Também executar testes arquiteturais específicos se houver.

---

# 44. Wrangler types

Se o Worker já possuir configuração compatível:

```bash
npx wrangler types
```

Se cada worker usa config específica:

```bash
npx wrangler types \
  --config wrangler/operations/wrangler.jsonc
```

conforme a estrutura real.

---

# 45. Dry run

Obrigatório:

```bash
npx wrangler deploy --dry-run
```

com config correspondente.

Não fazer deploy.

---

# 46. Atualizar README

Adicionar seção:

```text
Operations Worker
```

com:

```text
responsabilidade
status atual
como executar
como testar
health route
configuração
persistência decidida pelo ADR
```

---

# 47. Atualizar documentação de roadmap

Registrar explicitamente:

```text
PR-05
Operations Worker Foundation
DONE/PENDING

PR-06
Operations Domain Foundation
Tenant + Professional + Service + Customer
```

O roadmap antigo que chamava PR-05 diretamente de domínio deve ser marcado como superseded.

---

# 48. Resultado arquitetural esperado

Ao final:

```text
                    Frontend
                       │
                       ▼
                   BFF Worker
                       │
                       ▼
                Operations Worker
                       │
          ┌────────────┼────────────┐
          │            │            │
       Config       Observe       Health
          │            │            │
          └────────────┴────────────┘

               Domain modules
                  NOT YET
```

---

# 49. O PR não deve implementar

Lista explícita para o Codex:

```text
Tenant entity
Professional entity
Service entity
Customer entity

TenantRepository
ProfessionalRepository
ServiceRepository
CustomerRepository

D1 repository
Postgres repository

CRUD controllers

CreateTenant
CreateProfessional
CreateService
CreateCustomer

Appointment

Audit business events
Outbox business events
Idempotency business operations

R2
KV
Queues
```

---

# 50. Definition of Done

```text
[ ] estado real do repositório inventariado

[ ] AGENTS/docs/ADR lidos antes da alteração

[ ] divergência PostgreSQL × D1 explicitada

[ ] ADR de persistência criado ou atualizado

[ ] TODO env.DB resolvido de forma normativa

[ ] target topology documentada

[ ] current topology documentada

[ ] ownership do operations-worker definido

[ ] responsabilidades excluídas do operations-worker definidas

[ ] TenantStatus normativo documentado

[ ] Professional lifecycle normativo documentado

[ ] Service lifecycle normativo documentado

[ ] CustomerStatus separado de RelationshipProfile

[ ] nenhum status adicional inventado

[ ] operations-worker criado por Nest CLI

[ ] scaffold Hello World removido

[ ] HealthModule criado por CLI

[ ] HealthController criado por CLI

[ ] somente GET /health exposto

[ ] /health sem DB

[ ] observability existente reutilizada

[ ] execution context existente reutilizado

[ ] auth/tenancy existente reutilizada apenas quando presente

[ ] nenhum domínio funcional implementado

[ ] nenhuma migration de domínio criada

[ ] migration PostgreSQL existente preservada

[ ] migrations por adapter não misturadas

[ ] nenhum database_id inventado

[ ] nenhum recurso Cloudflare criado remotamente

[ ] architecture tests PASS

[ ] health tests PASS

[ ] lint PASS

[ ] typecheck PASS

[ ] tests PASS

[ ] operations-worker build PASS

[ ] wrangler types PASS

[ ] wrangler deploy --dry-run PASS

[ ] documentação atualizada

[ ] diff final revisado
```