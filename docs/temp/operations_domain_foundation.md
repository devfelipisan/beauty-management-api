Com base no relatório pós-implementação, o **PR-05 cumpriu corretamente o papel de materializar o primeiro Business Worker sem avançar prematuramente para domínio**. Isso confirma exatamente o estado que o próximo PR precisa assumir: `operations-worker` existe, tem health, reutiliza config/observability/auth/tenancy, a decisão D1 foi formalizada no ADR-0009, e ainda não há domínio funcional, migration funcional ou binding D1. Esse baseline está consistente com o plano anterior. 

A principal conclusão é:

> **O PR-06 continua necessário, mas deve ser tratado como “Operations Domain Foundation” e não como CRUD completo.**

Ele deve materializar o domínio `Tenant + Professional + Service + Customer`, seus ports, use cases e persistência mínima, sem entrar ainda em `Appointment`.

# PR-06 — Operations Domain Foundation

## Objetivo

Transformar:

```text
operations-worker
├── Config
├── Observability
├── Authentication
├── Tenancy
└── Health
```

em:

```text
operations-worker
├── Config
├── Observability
├── Authentication
├── Tenancy
├── Health
│
├── Tenant
├── Professional
├── Service
└── Customer
```

com arquitetura:

```text
HTTP
 ↓
Controller
 ↓
Application UseCase
 ↓
Domain
 ↓
Repository Port
 ↓
D1 Adapter
 ↓
D1
```

---

# 1. O que o relatório confirma como pré-condição resolvida

O PR-06 não precisa mais resolver:

```text
criação do operations-worker
sanitização Hello World
health
service identity
monorepo wiring
D1 vs PostgreSQL
topologia Workers
contratos básicos de status
```

Esses itens já foram concluídos.

Especialmente importante:

```text
ADR-0009
D1 persistence for Cloudflare Workers
```

já congelou a decisão de persistência.

Portanto o PR-06 **não pode reabrir PostgreSQL × D1**.

---

# 2. O primeiro problema a resolver no PR-06

Antes de gerar módulos, validar o ADR-0009 e os contratos congelados:

```bash
cat docs/adr/0009-d1-persistence-for-cloudflare-workers.md

cat docs/business/operations-contracts.md

cat docs/architecture/workers.md
```

Depois verificar:

```bash
git status
git log --oneline -10
find apps/operations-worker -maxdepth 6 -type f | sort
find libs -maxdepth 6 -type f | sort
```

---

# 3. Novo gate: Wrangler ainda não existe

O relatório aponta explicitamente:

```text
Não existe configuração Wrangler.
```

Isso é uma pendência arquitetural relevante.

Como o PR-06 introduzirá D1 real, eu incluiria **somente a configuração mínima necessária para o `operations-worker` acessar D1 localmente**.

Não criaria um PR separado só para isso, porque sem binding D1 o adapter não pode ser validado.

Portanto entra no escopo do PR-06:

```text
operations-worker wrangler config
+
D1 binding local
```

Mas não:

```text
remote database creation
deploy
production binding
```

---

# 4. Não provisionar D1 remoto

Permitido:

```bash
npx wrangler d1 migrations apply <database> --local
```

Não permitido:

```bash
npx wrangler d1 create ...
npx wrangler deploy
```

A configuração pode usar um nome lógico local, sem inventar resource ID remoto.

---

# 5. Criar fundação D1 somente se não existir

Pesquisar:

```bash
grep -R "D1Database" apps libs 2>/dev/null || true
grep -R "DatabaseModule" apps libs 2>/dev/null || true
```

Como o relatório diz que nenhum binding D1 foi criado, provavelmente falta materialização da infraestrutura.

Se ausente:

```bash
nest g library database
nest g module database --project database
nest g provider d1/d1-database --project database
```

Mas somente se essa infraestrutura realmente ainda não existir.

---

# 6. O BFF continua sem D1

A configuração Wrangler do D1 deve ser restrita ao `operations-worker`.

Não adicionar:

```text
DB binding
```

ao BFF.

A fronteira permanece:

```text
BFF
 ↓
Operations Worker
 ↓
D1
```

e não:

```text
BFF
 ↓
D1
```

---

# 7. Primeiro módulo: Tenant

Gerar:

```bash
nest g module tenants --project operations-worker
nest g controller tenants --project operations-worker
```

Use cases mínimos:

```bash
nest g service tenants/application/create-tenant \
  --project operations-worker

nest g service tenants/application/get-tenant \
  --project operations-worker

nest g service tenants/application/update-tenant \
  --project operations-worker
```

Não criar `TenantService` genérico.

---

# 8. Tenant Domain

Gerar:

```bash
nest g class tenants/domain/tenant \
  --project operations-worker \
  --no-spec
```

Consumir exatamente os estados documentados em:

```text
operations-contracts.md
```

Não recriar enum paralelo com nomes diferentes.

Se o PR-05 congelou:

```text
ACTIVE
INACTIVE
SUSPENDED
CANCELED
```

esses devem ser os únicos estados inicialmente válidos.

---

# 9. Invariantes de Tenant

Neste PR, implementar apenas:

```text
documento obrigatório/normalizado
documento único
nome obrigatório
status válido
timezone válida conforme contrato
```

Não implementar:

```text
licenciamento avançado
plano SaaS
suspensão automática
billing da plataforma
```

---

# 10. Tenant Repository Port

```bash
nest g interface tenants/ports/tenant-repository \
  --project operations-worker
```

Exemplo:

```ts
export interface TenantRepository {
  findById(id: string): Promise<Tenant | null>;

  findByDocument(
    document: string,
  ): Promise<Tenant | null>;

  create(tenant: Tenant): Promise<void>;

  update(tenant: Tenant): Promise<void>;
}
```

---

# 11. D1 Tenant Adapter

```bash
nest g provider tenants/adapters/d1-tenant-repository \
  --project operations-worker
```

Ele conhece:

```text
D1Database
SQL
record mapping
```

Application/Domain não.

---

# 12. Migration Tenant

Agora sim entra a primeira migration funcional.

Estrutura recomendada:

```text
database/
└── d1/
    └── migrations/
        └── 0001_tenants.sql
```

Se o ADR-0009 já definiu outro path, use esse.

Schema conceitual:

```sql
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  document TEXT NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Unique:

```sql
CREATE UNIQUE INDEX ux_tenants_document
ON tenants(document);
```

---

# 13. Professional

Gerar:

```bash
nest g module professionals --project operations-worker
nest g controller professionals --project operations-worker
```

Use cases:

```bash
nest g service professionals/application/create-professional \
  --project operations-worker

nest g service professionals/application/get-professional \
  --project operations-worker

nest g service professionals/application/list-professionals \
  --project operations-worker

nest g service professionals/application/update-professional \
  --project operations-worker

nest g service professionals/application/deactivate-professional \
  --project operations-worker
```

---

# 14. Professional Domain

Gerar:

```bash
nest g class professionals/domain/professional \
  --project operations-worker \
  --no-spec
```

Status apenas:

```text
ACTIVE
INACTIVE
```

conforme contrato congelado.

---

# 15. Professional sempre tenant-aware

Port:

```bash
nest g interface professionals/ports/professional-repository \
  --project operations-worker
```

Obrigatório:

```ts
findById(
  tenantId: string,
  professionalId: string,
)
```

Não:

```ts
findById(professionalId)
```

---

# 16. Professional migration

Schema mínimo:

```text
professionals
├── id
├── tenant_id
├── name
├── status
├── public_visible
├── created_at
└── updated_at
```

Índice:

```sql
CREATE INDEX idx_professionals_tenant_status
ON professionals(tenant_id, status);
```

---

# 17. Service

```bash
nest g module services --project operations-worker
nest g controller services --project operations-worker
```

Use cases:

```bash
nest g service services/application/create-service \
  --project operations-worker

nest g service services/application/get-service \
  --project operations-worker

nest g service services/application/list-services \
  --project operations-worker

nest g service services/application/update-service \
  --project operations-worker

nest g service services/application/deactivate-service \
  --project operations-worker
```

---

# 18. Service Domain

Criar:

```bash
nest g class services/domain/service \
  --project operations-worker \
  --no-spec
```

Campos:

```text
id
tenantId
name
category
durationMinutes
basePriceCents
status
```

Somente os aprovados pela regra atual.

---

# 19. Dinheiro

Obrigatório:

```ts
basePriceCents: number;
```

Nunca ponto flutuante.

---

# 20. Duration

```text
durationMinutes > 0
```

A duração integral será usada depois pelo Scheduling.

Não implementar disponibilidade ainda.

---

# 21. Service Repository

```bash
nest g interface services/ports/service-repository \
  --project operations-worker
```

Com tenancy explícita.

---

# 22. Professional ↔ Service

Esse relacionamento precisa ser criado neste PR porque `Appointment` dependerá dele.

Migration:

```text
professional_services
```

Campos:

```text
tenant_id
professional_id
service_id
created_at
```

Unique:

```text
tenant_id
+
professional_id
+
service_id
```

---

# 23. Não permitir vínculo cross-tenant

O adapter/use case deve rejeitar:

```text
Professional Tenant A
+
Service Tenant B
```

Essa prova será uma das mais importantes do PR.

---

# 24. Customer

Gerar:

```bash
nest g module customers --project operations-worker
nest g controller customers --project operations-worker
```

Use cases:

```bash
nest g service customers/application/create-customer \
  --project operations-worker

nest g service customers/application/get-customer \
  --project operations-worker

nest g service customers/application/list-customers \
  --project operations-worker

nest g service customers/application/update-customer \
  --project operations-worker

nest g service customers/application/deactivate-customer \
  --project operations-worker
```

---

# 25. Customer Domain

Criar:

```bash
nest g class customers/domain/customer \
  --project operations-worker \
  --no-spec
```

Usar separação congelada no PR-05:

```text
CustomerStatus
    ACTIVE
    INACTIVE
```

diferente de:

```text
RelationshipProfile
```

Essa separação já foi explicitamente registrada no planejamento do PR-05. 

---

# 26. Perfil inicial

Na criação:

```text
RelationshipProfile = NEW
```

se esse nome estiver no contrato normativo.

Não implementar ainda reclassificação automática para:

```text
OLD
REGULAR
INACTIVE
RECURRING_ABSENCES
```

porque faltam sessões/faltas/histórico.

---

# 27. Customer Repository

```bash
nest g interface customers/ports/customer-repository \
  --project operations-worker
```

Contratos tenant-aware:

```text
findById
findByPhone
findByDocument
findByEmail
list
create
update
```

somente conforme necessidade.

---

# 28. Duplicidade de Customer

As regras de cliente exigem detecção de possíveis duplicidades por atributos como telefone/documento/e-mail e combinações de identificação. Não coloque isso no controller. 

Fluxo:

```text
CreateCustomerUseCase
        ↓
CustomerRepository
        ↓
duplicate candidates
        ↓
decision
```

A regra de possíveis duplicidades não necessariamente significa constraint única para todos esses campos.

Especialmente nome não deve virar unique.

---

# 29. Customer migration

Schema mínimo:

```text
customers
├── id
├── tenant_id
├── full_name
├── phone
├── email
├── document
├── status
├── relationship_profile
├── created_at
└── updated_at
```

Não colocar:

```text
technical records
sessions
photos
payment data
```

nessa tabela.

---

# 30. Customer indices

Criar índices para consultas reais:

```sql
CREATE INDEX idx_customers_tenant_phone
ON customers(tenant_id, phone);
```

```sql
CREATE INDEX idx_customers_tenant_document
ON customers(tenant_id, document);
```

Se email for pesquisável:

```sql
CREATE INDEX idx_customers_tenant_email
ON customers(tenant_id, email);
```

---

# 31. Paginação obrigatória

Todos os endpoints de listagem precisam de limite.

Por exemplo:

```text
GET /customers?limit=20&cursor=...
```

Não retornar toda a tabela.

O mesmo para:

```text
professionals
services
```

Isso é especialmente importante no D1 Free.

---

# 32. Limite máximo

Defina um máximo razoável e documentado, por exemplo:

```text
default = 20
max = 100
```

Somente se não houver valor normativo já definido.

Se isso ainda não foi decidido, coloque uma constante configurável/documentada, não números espalhados.

---

# 33. Controllers finos

Fluxo:

```text
Controller
 ↓
CurrentTenant
 ↓
Input DTO
 ↓
UseCase
```

Não:

```text
Controller
 ↓
D1
```

---

# 34. DTOs

Gerar via CLI:

```bash
nest g class customers/adapters/http/dto/create-customer.dto \
  --project operations-worker \
  --no-spec
```

E equivalentes.

Não usar Domain Entity como HTTP request.

---

# 35. Authentication e Tenancy

O relatório confirma que as foundations existentes foram reutilizadas no PR-05.

Logo o PR-06 deve **usar essas mesmas libraries**, e não criar novas.

Fluxo:

```text
Authentication
 ↓
Trusted Tenant
 ↓
Permission
 ↓
Controller
```

---

# 36. Permission Guard

Aplicar permissions compatíveis com os contratos atuais.

Exemplos:

```text
professional.create
professional.read

service.create
service.read

customer.create
customer.read
```

Evitar lógica direta por role.

---

# 37. Tenant endpoint especial

Operações sobre `Tenant` precisam de atenção, porque o tenant é a raiz do contexto.

Não force:

```text
@CurrentTenant()
```

em `CreateTenant` se a criação é operação de platform/admin.

A autorização deve seguir a regra já documentada para Platform Admin/Tenant Admin.

Não adaptar tenancy mecanicamente.

---

# 38. Health continua sem Auth

Mesmo depois da integração:

```text
GET /health
```

continua:

```text
200
sem token
sem tenant
sem D1 query
```

---

# 39. O ponto do relatório que precisa ser corrigido antes do merge

Há duas validações que não rodaram no PR-05:

```text
Vitest
Lint
```

por problemas locais de instalação.

Isso não deve bloquear conceitualmente o início do PR-06, mas **não devemos permitir que o PR-06 termine com os mesmos gates quebrados**.

Portanto inclua no começo:

```bash
rm -rf node_modules
npm ci
```

somente se não houver mudanças locais críticas e se o lockfile estiver válido.

Ou usar a estratégia de reinstalação compatível com o package manager real.

Não alterar versão de dependências apenas para “fazer passar”.

---

# 40. Reparar ambiente de testes

O erro de Rolldown provavelmente é problema de instalação/binário opcional, não de domínio.

O PR-06 deve primeiro tentar restaurar ambiente reproduzível:

```text
lockfile
↓
clean install
↓
lint
↓
test
```

Não migrar Vitest/Jest nesta PR sem necessidade.

---

# 41. Gates que agora devem ser obrigatórios

Ao final do PR-06 precisamos ter efetivamente:

```text
lint PASS
typecheck PASS
test PASS
build PASS
```

O `smoke test` isolado não será suficiente para um PR de domínio.

---

# 42. Repository contract tests

Criar testes reutilizáveis para:

```text
TenantRepository
ProfessionalRepository
ServiceRepository
CustomerRepository
```

Isso prepara eventual substituição futura de D1 sem alterar Application.

---

# 43. D1 integration tests

Testar localmente:

```text
migration
create
read
update
tenant filtering
index-relevant queries
```

Não depender de D1 remoto.

---

# 44. Cross-tenant tests obrigatórios

### Professional

```text
Tenant A
→ Professional B
→ no access
```

### Service

```text
Tenant A
→ Service B
→ no access
```

### Customer

```text
Tenant A
→ Customer B
→ no access
```

### Professional-Service

```text
Professional A + Service B
→ rejected
```

---

# 45. Constraint tests

Tenant document:

```text
same document twice
→ conflict
```

Professional/service association:

```text
same tuple twice
→ conflict/idempotent according to operation contract
```

---

# 46. Domain tests

No mínimo:

### Tenant

```text
valid status
normalized document
```

### Professional

```text
ACTIVE/INACTIVE only
```

### Service

```text
duration > 0
price cents >= 0
```

### Customer

```text
ACTIVE initial status
NEW initial relationship profile
```

conforme contratos aprovados.

---

# 47. Observabilidade

Cada aplicação deve registrar somente metadata segura:

```text
operation
tenantId
actorId
requestId
correlationId
status
duration
```

Não:

```text
customer phone
customer email
document
DTO inteiro
```

---

# 48. Sem persistência no bootstrap

Adicionar os módulos não deve provocar:

```text
SELECT
INSERT
migration apply
```

na inicialização da aplicação.

Migration é processo de deployment/dev tooling, não bootstrap request-time.

---

# 49. D1 Free: primeira análise real de custo

Agora o orçamento começa a importar de verdade.

Para cada operação, documentar aproximadamente:

| Operação           |                         Reads | Writes |
| ------------------ | ----------------------------: | -----: |
| CreateTenant       |                           1–2 |      1 |
| GetTenant          |                             1 |      0 |
| CreateProfessional |                            ~1 |      1 |
| ListProfessionals  |                       bounded |      0 |
| CreateService      |                            ~1 |      1 |
| CreateCustomer     | alguns lookups de duplicidade |      1 |

O número exato depende da implementação.

O importante é impedir:

```text
CreateCustomer
→ 8 scans de tabela
```

---

# 50. Otimizar duplicidade com índices

A detecção de duplicidade não deve fazer:

```text
SELECT * customers
```

e comparar em memória.

Use consultas indexadas:

```text
tenant + phone
tenant + document
tenant + email
```

---

# 51. Evitar N+1

Principalmente no vínculo:

```text
Professional ↔ Services
```

Não fazer:

```text
list 50 professionals
→ 50 queries services
```

Provar uma estratégia bounded.

---

# 52. Estrutura esperada ao final

```text
apps/operations-worker/src/
├── health/
│
├── tenants/
│   ├── domain/
│   ├── application/
│   ├── ports/
│   └── adapters/
│
├── professionals/
│   ├── domain/
│   ├── application/
│   ├── ports/
│   └── adapters/
│
├── services/
│   ├── domain/
│   ├── application/
│   ├── ports/
│   └── adapters/
│
├── customers/
│   ├── domain/
│   ├── application/
│   ├── ports/
│   └── adapters/
│
└── operations-worker.module.ts
```

---

# 53. O que não deve entrar

O relatório diz corretamente que o próximo passo é domínio de Operations. Isso significa manter fora:

```text
Appointment
Availability
Confirmation
Check-in
Deposit
Discount
Session
Assessment
Payment
Package
R2
KV
Queue
Cron
```

---

# 54. E a Reliability Foundation?

Aqui eu faria uma pequena mudança em relação ao roadmap anterior.

Como PR-06 agora introduzirá **mutações reais**, precisamos inspecionar se já existem:

```text
UnitOfWork
AuditWriter
Idempotency
Outbox
```

Se **não existirem**, não tentaria colocar tudo dentro do PR-06.

Para essas quatro entidades cadastrais, podemos entregar domínio/persistência e reservar a reliability foundation para o próximo PR.

Mas:

> `Appointment` não deve ser iniciado antes dessa foundation existir.

Portanto a sequência passa a ser:

```text
PR-06
Operations Domain
Tenant / Professional / Service / Customer
          ↓
PR-07
Reliability Foundation
UnitOfWork / Idempotency / Audit / Outbox
          ↓
PR-08
Scheduling / Appointment
```

---

# 55. Por que PR-07 antes de Appointment

Porque `CreateAppointment` é explicitamente sensível a:

```text
duplo clique
retry
concorrência
duplicação
audit
future notifications
```

e as regras do produto exigem idempotência para agendamento. 

Já um cadastro de `Service` ou `Professional` é menos perigoso para validar o primeiro vertical slice de D1.

---

# 56. Definition of Done revisada

```text
[ ] PR-05 baseline preservado

[ ] ADR-0009 lido e aplicado
[ ] D1 não rediscutido

[ ] Wrangler mínimo do operations-worker criado
[ ] D1 binding local configurado
[ ] nenhum D1 remoto provisionado

[ ] migration strategy D1 definida

[ ] Tenant module implementado
[ ] Professional module implementado
[ ] Service module implementado
[ ] Customer module implementado

[ ] todos gerados com Nest CLI quando aplicável

[ ] nenhum generic AppService

[ ] Domain sem NestJS
[ ] Domain sem Cloudflare
[ ] Application sem D1Database

[ ] Repository Ports definidos
[ ] D1 adapters definidos

[ ] TenantStatus conforme operations-contracts
[ ] Professional lifecycle conforme operations-contracts
[ ] Service lifecycle conforme operations-contracts
[ ] CustomerStatus != RelationshipProfile

[ ] tenant isolation aplicada

[ ] Professional-Service tenant-safe

[ ] migrations funcionais versionadas

[ ] índices tenant-aware

[ ] Customer duplicate lookup indexado

[ ] list endpoints paginados

[ ] sem N+1 evidente

[ ] PII não aparece nos logs/traces

[ ] repository contract tests PASS
[ ] cross-tenant tests PASS
[ ] D1 integration tests PASS
[ ] domain tests PASS
[ ] application tests PASS
[ ] architecture tests PASS

[ ] Vitest voltou a funcionar
[ ] lint voltou a funcionar

[ ] lint PASS
[ ] tsc --build PASS
[ ] tests PASS
[ ] operations worker build PASS

[ ] smoke test PASS

[ ] GET /health continua funcionando sem DATABASE_URL
[ ] GET /health não consulta D1

[ ] nenhuma regra de Appointment implementada
[ ] nenhuma regra financeira implementada
[ ] nenhuma regra clínica implementada

[ ] Free Tier analisado
[ ] diff revisado
```

## Conclusão

O relatório do PR-05 mostra que a implementação ficou **no ponto correto para abrir o PR-06**: runtime materializado, scaffold removido, Health funcional, fundações reaproveitadas e, principalmente, a decisão D1 já está registrada no ADR-0009.

Eu faria apenas dois ajustes importantes no PR-06 em relação ao planejamento anterior:

1. **incluir a configuração mínima do Wrangler + binding D1 local**, porque o relatório confirma que isso ainda não existe e agora será necessário para adapters/migrations;
2. **tornar a recuperação de lint/Vitest um gate do PR**, porque daqui em diante haverá domínio real e smoke test + build já não são provas suficientes.

Assim, o PR-06 deve implementar **Tenant, Professional, Service e Customer com D1 real e isolamento tenant**, mas ainda sem Scheduling. Depois dele, recomendo **PR-07 — Reliability Foundation**, e só então **PR-08 — Appointment/Scheduling**.
