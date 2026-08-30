O próximo passo é o **PR-03 — Tenancy + Authentication Foundation**.

Ele deve vir logo após o PR-02 porque agora já teremos `requestId`, `correlationId`, `traceId` e `ExecutionContext`. O PR-03 passa a preencher nesse contexto as duas informações que realmente determinam segurança operacional:

```text
actorId
tenantId
```

Mas com uma regra fundamental:

> **autenticação identifica quem é o usuário; autorização determina se ele pode agir naquele tenant e naquele recurso.**

A documentação funcional exige isolamento total entre empresas, menor privilégio, usuário ativo, vínculo com tenant e permissões coerentes com o papel.  A proposta técnica também deixa claro que validar apenas o JWT não é suficiente: a aplicação precisa verificar membership atual e permissão no tenant, porque claims podem ficar desatualizadas. 

# PR-03 — Tenancy + Authentication Foundation

O objetivo é estabelecer:

```text
Identity
+
Tenant Context
+
Membership
+
Permissions
+
Authentication Guard
+
Tenant Guard
+
Permission Guard
+
ExecutionContext enrichment
```

Ainda **sem implementar regras de negócio específicas**.

---

# 1. Escopo exato

O PR-03 deve entregar:

```text
Authentication abstraction

AuthenticatedIdentity

TenantContext

Tenant membership resolution

AuthenticationGuard

TenantGuard

PermissionGuard

@CurrentActor()

@CurrentTenant()

@RequirePermission()

enriquecimento do ExecutionContext

testes de isolamento

architecture tests
```

Não implementar ainda:

```text
Customers
Professionals
Services
Appointments
Payments
Sessions

D1 repositories de domínio

DiscountPolicy
AppointmentPolicy
SessionPolicy

R2
KV
Outbox consumer
```

---

# 2. Estado esperado após PR-02

A base deve estar semelhante a:

```text
Worker
 │
 ├── Config
 │
 ├── Health
 │
 ├── Observability
 │
 └── ExecutionContext
       ├── requestId
       ├── correlationId
       ├── traceId
       ├── service
       ├── source
       ├── actorId?
       └── tenantId?
```

O PR-03 transforma os campos opcionais em contexto confiável nas requisições autenticadas.

---

# 3. Fluxo arquitetural desejado

```text
HTTP Request
   ↓
AuthenticationGuard
   ↓
AuthenticatedIdentity
   ↓
TenantMembershipResolver
   ↓
TenantGuard
   ↓
PermissionGuard
   ↓
ExecutionContext
   ├── actorId
   └── tenantId
   ↓
Controller
```

Mais tarde:

```text
Controller
   ↓
UseCase
   ↓
Policy
   ↓
Repository
```

---

# 4. Regra fundamental de confiança

Não fazer:

```text
x-tenant-id
    ↓
trusted tenant
```

Nem:

```text
body.tenantId
    ↓
trusted tenant
```

Nem:

```text
query.tenantId
    ↓
trusted tenant
```

O tenant confiável deve ser derivado de:

```text
Authenticated Identity
        +
Membership atual
        +
recurso/operação
```

A regra multiempresa é explícita: registros operacionais pertencem a uma empresa e uma empresa não pode acessar dados de outra.

---

# 5. Inventário inicial

Antes de modificar:

```bash
pwd

git status

git branch --show-current

git log -10 --oneline
```

Depois:

```bash
find apps -maxdepth 5 -type f | sort
find libs -maxdepth 5 -type f | sort
```

Pesquisar autenticação já existente:

```bash
grep -R "AuthGuard" apps libs src 2>/dev/null || true
grep -R "Authentication" apps libs src 2>/dev/null || true
grep -R "tenantId" apps libs src 2>/dev/null || true
grep -R "permission" apps libs src 2>/dev/null || true
grep -R "membership" apps libs src 2>/dev/null || true
```

Não criar infraestrutura paralela se já existir uma base válida.

---

# 6. Criar library `authentication`

Se não existir:

```bash
nest g library authentication
```

Estrutura esperada:

```text
libs/authentication/src/
├── domain/
│   ├── authenticated-identity.ts
│   └── permission.ts
│
├── ports/
│   ├── identity-provider.ts
│   └── membership-provider.ts
│
├── guards/
│   ├── authentication.guard.ts
│   └── permission.guard.ts
│
├── decorators/
│   ├── current-actor.decorator.ts
│   └── require-permission.decorator.ts
│
└── authentication.module.ts
```

Mas não force a pasta `domain/` se ela for apenas contrato técnico. O importante é manter o código organizado por responsabilidade.

---

# 7. Criar library `tenancy`

```bash
nest g library tenancy
```

Depois:

```bash
nest g module tenancy --project tenancy
```

Estrutura:

```text
libs/tenancy/src/
├── tenant-context.ts
├── tenant-membership.ts
├── tenant-membership-resolver.ts
├── guards/
│   └── tenant.guard.ts
├── decorators/
│   └── current-tenant.decorator.ts
└── tenancy.module.ts
```

---

# 8. `AuthenticatedIdentity`

Criar contrato simples.

Via CLI:

```bash
nest g interface authenticated-identity --project authentication
```

Conceitualmente:

```ts
export interface AuthenticatedIdentity {
  actorId: string;
  subject: string;
}
```

Não incluir ainda:

```text
email
name
phone
CPF
```

como contexto operacional principal.

Isso reduz exposição de PII.

---

# 9. Não colocar roles diretamente no JWT como autoridade definitiva

Mesmo que o token possua:

```text
role
permissions
tenantId
```

essas informações devem ser tratadas no máximo como hints.

A autorização real deve verificar o estado atual.

A proposta técnica diz explicitamente que identidade autenticada não basta para autorizar; membership e permissão devem ser verificadas no tenant. 

---

# 10. Criar `IdentityProvider`

Gerar:

```bash
nest g interface ports/identity-provider --project authentication
```

Contrato conceitual:

```ts
export interface IdentityProvider {
  authenticate(
    token: string,
  ): Promise<AuthenticatedIdentity | null>;
}
```

Essa interface permite trocar:

```text
Supabase Auth
Mock Auth
Future Identity Provider
```

sem modificar Guards/Application.

---

# 11. Adapter inicial de autenticação

Como ainda estamos preparando fundação, podem existir dois adapters:

```text
MockIdentityProvider
SupabaseIdentityProvider
```

Mas não implementar Supabase de forma profunda se ainda não estiver no escopo do runtime.

Para desenvolvimento:

```bash
nest g provider adapters/mock-identity-provider --project authentication
```

Se já houver provider real aprovado, adaptá-lo em vez de criar mock paralelo.

---

# 12. Criar `AuthenticationGuard`

Via CLI:

```bash
nest g guard guards/authentication --project authentication
```

Responsabilidade:

```text
Authorization header
     ↓
token
     ↓
IdentityProvider
     ↓
AuthenticatedIdentity
```

Não deve:

```text
consultar Appointment
calcular desconto
decidir licença
verificar regra comercial
```

---

# 13. Tratamento do Bearer token

Fluxo:

```text
Authorization: Bearer <token>
```

Validar:

```text
header existe?
prefixo correto?
token não vazio?
```

Depois delegar ao `IdentityProvider`.

Não fazer parsing de token espalhado por Controllers.

---

# 14. Falhas de autenticação

Usar respostas estáveis:

```text
sem token
→ 401

token inválido
→ 401

identidade inativa/inexistente
→ 401 ou 403 conforme contrato definido
```

Não retornar:

```text
JWT parsing failed because secret XYZ...
```

ao cliente.

---

# 15. Criar `@CurrentActor()`

Via CLI:

```bash
nest g decorator decorators/current-actor --project authentication
```

Permite:

```ts
@CurrentActor()
actor: AuthenticatedIdentity
```

Mas o decorator apenas extrai o contexto já resolvido.

Não autentica novamente.

---

# 16. Criar `TenantMembership`

Contrato:

```ts
export interface TenantMembership {
  tenantId: string;
  actorId: string;

  active: boolean;

  roles: string[];

  permissions: string[];
}
```

Se o modelo normativo usar apenas permissões e não roles, simplifique.

Não inventar estrutura maior que a documentação.

---

# 17. Criar `MembershipProvider`

Via CLI:

```bash
nest g interface ports/membership-provider --project authentication
```

Ou dentro da tenancy:

```bash
nest g interface ports/tenant-membership-provider --project tenancy
```

Contrato conceitual:

```ts
export interface TenantMembershipProvider {
  findActiveMembership(
    actorId: string,
    tenantId: string,
  ): Promise<TenantMembership | null>;
}
```

---

# 18. De onde vem o tenant candidato

Há algumas possibilidades legítimas:

```text
rota
subdomain
contexto do recurso
tenant selecionado na sessão
```

Mas o PR não deve inventar uma estratégia se ela ainda não estiver definida.

Se o backend já usa:

```text
/:tenantId/...
```

esse ID pode ser o candidato.

Mas:

```text
candidateTenantId
≠
trustedTenantId
```

Ele só se torna confiável depois da verificação de membership.

---

# 19. Criar `TenantContext`

Via CLI:

```bash
nest g interface tenant-context --project tenancy
```

Modelo:

```ts
export interface TenantContext {
  tenantId: string;
  actorId: string;
}
```

Pode futuramente incluir:

```text
membershipId
licenseId
```

se necessário.

Não antecipar agora.

---

# 20. Criar `TenantGuard`

```bash
nest g guard guards/tenant --project tenancy
```

Responsabilidade:

```text
authenticated actor
     +
candidate tenant
     ↓
membership lookup
     ↓
membership active?
     ↓
trusted tenant context
```

Se não houver membership:

```text
403
```

---

# 21. Enriquecer `ExecutionContext`

Depois de autenticação:

```text
actorId
```

Depois de tenancy:

```text
tenantId
```

Resultado:

```ts
{
  requestId,
  correlationId,
  traceId,
  service,
  source,

  actorId,
  tenantId,
}
```

Isso evita manter um `AuthContext` separado e um `TenantContext` paralelo desconectados.

---

# 22. Não usar singleton mutável

Proibido:

```ts
let currentTenantId;
let currentActorId;
```

Também proibido:

```ts
@Injectable()
export class TenantContextService {
  tenantId?: string;
}
```

como singleton mutável.

Em Workers concorrentes, isso pode misturar requests.

O contexto deve permanecer request-scoped ou explicitamente propagado.

---

# 23. Estratégia de armazenamento request-local

Como no PR-02, prefira:

```text
request-local metadata
```

ou equivalente suportado pelo adapter.

Exemplo conceitual:

```ts
request.executionContext = {
  ...existingContext,
  actorId,
  tenantId,
};
```

Sem estado global.

---

# 24. Criar `@CurrentTenant()`

```bash
nest g decorator decorators/current-tenant --project tenancy
```

Uso:

```ts
@CurrentTenant()
tenant: TenantContext
```

O decorator não aceita `tenantId` do request arbitrariamente.

Ele lê somente contexto previamente validado.

---

# 25. Criar permission metadata

Gerar:

```bash
nest g decorator decorators/require-permission --project authentication
```

Exemplo:

```ts
@RequirePermission('appointment.create')
@Post()
create() {}
```

O decorator apenas adiciona metadata.

Não resolve permissão sozinho.

---

# 26. Criar `PermissionGuard`

```bash
nest g guard guards/permission --project authentication
```

Fluxo:

```text
@RequirePermission(...)
       ↓
PermissionGuard
       ↓
trusted membership
       ↓
has permission?
```

Resultado:

```text
yes
→ controller

no
→ 403
```

---

# 27. Permission Guard não é Policy

Esse ponto precisa ficar muito claro.

`PermissionGuard` responde:

```text
o usuário possui permission appointment.create?
```

Mas não responde:

```text
cliente está bloqueado?
profissional pode executar o serviço?
horário está livre?
licença permite?
desconto é permitido?
```

Essas decisões continuam em:

```text
Application / Domain Policy
```

A documentação diferencia autorização do contexto de regras de negócio. 

---

# 28. Definir permission naming convention

Adotar padrão previsível:

```text
resource.action
```

Por exemplo:

```text
customer.read
customer.create
customer.update

appointment.read
appointment.create
appointment.reschedule
appointment.cancel

session.read
session.start
session.complete

payment.read
payment.register
payment.refund
```

Mas **não criar o catálogo completo neste PR** se os módulos ainda não existem.

Crie apenas a convenção e talvez permissions necessárias para testes.

---

# 29. Health continua público

`GET /health` deve permanecer fora de:

```text
AuthenticationGuard
TenantGuard
PermissionGuard
```

Fluxo:

```text
GET /health
→ 200
```

sem token.

---

# 30. Definir decorator `@Public()`, se necessário

Caso os Guards sejam globais no futuro, pode existir:

```bash
nest g decorator decorators/public --project authentication
```

Mas só introduzir se a composição real exigir.

Evite criar infraestrutura hipotética.

---

# 31. Guards globais ou explícitos?

Para este estágio, eu prefiro:

```text
AuthenticationGuard global
+
@Public()
```

somente se todos os endpoints futuros forem autenticados por padrão.

Caso contrário, usar guard explicitamente até a política ser definida.

O importante é evitar cenário perigoso:

```text
novo controller
→ esqueceu guard
→ endpoint público acidental
```

Portanto, para Business Workers, **default deny** é uma boa direção.

---

# 32. BFF vs Business Workers

BFF pode validar tecnicamente:

```text
token presente
token estruturalmente válido
```

Mas a Business API deve continuar fazendo:

```text
identity validation
membership
permission
resource ownership
```

Não confiar no BFF como única barreira.

A Business API é a autoridade do sistema.

---

# 33. Comunicação BFF → Worker

Propagar:

```text
Authorization
x-correlation-id
```

Mas o Business Worker deve validar novamente.

Não fazer:

```text
x-user-id
x-tenant-id
```

como autoridade única sem autenticação/verification.

---

# 34. Tenant isolation em repository contracts

Embora D1 ainda não esteja neste PR, já devemos congelar a regra:

```ts
findById(
  tenantId: string,
  id: string,
)
```

e não:

```ts
findById(id)
```

quando o dado for tenant-owned.

Isso é consequência direta da regra multiempresa.

---

# 35. Não criar Repository de domínio ainda

Não implementar:

```text
CustomerRepository
AppointmentRepository
```

agora.

Mas architecture tests podem validar que futuramente interfaces tenant-owned incluam contexto apropriado quando surgirem.

---

# 36. User status

A documentação determina que usuário inativo não pode autenticar, criar operações, alterar registros ou acessar áreas restritas. 

Portanto o membership/identity resolution precisa ter capacidade futura de representar:

```text
active
inactive
```

Mas não inventar persistence ainda.

---

# 37. Menor privilégio

Formalizar:

```text
deny by default
```

Se não existir permission requerida:

```text
não conceder automaticamente
```

Se membership não existir:

```text
deny
```

Se membership estiver inativo:

```text
deny
```

Isso implementa o princípio de menor privilégio especificado para usuários. 

---

# 38. Segregação de função

Algumas regras futuras exigem:

```text
usuário não aprova a própria ação
```

como em desconto excepcional.

Não implementar essa regra comercial agora.

Mas o contexto deve possuir:

```text
actorId
```

para permitir:

```text
requestedBy != approvedBy
```

nos futuros UseCases.

---

# 39. Observabilidade

Depois de resolver identidade, enriquecer traces com:

```text
actorId opaco
tenantId
```

quando seguro.

Não incluir:

```text
name
email
phone
CPF
```

A proposta técnica recomenda identificadores técnicos/opacos e proíbe PII sensível na observabilidade. 

---

# 40. Não logar JWT

Proibido:

```ts
logger.info({
  authorization: request.headers.authorization,
});
```

Também não registrar:

```text
decodedToken
claims completos
refresh token
```

---

# 41. Error model

Padronizar:

```text
AUTHENTICATION_REQUIRED
INVALID_AUTHENTICATION
TENANT_ACCESS_DENIED
PERMISSION_DENIED
```

Exemplo:

```json
{
  "code": "TENANT_ACCESS_DENIED",
  "message": "Acesso não autorizado",
  "requestId": "...",
  "correlationId": "..."
}
```

Não revelar:

```text
"usuário existe mas não pertence à clínica XYZ"
```

de forma desnecessária.

---

# 42. Teste do AuthenticationGuard

Cobrir:

```text
sem Authorization
→ 401
```

```text
Bearer vazio
→ 401
```

```text
token inválido
→ 401
```

```text
token válido
→ actor resolvido
```

```text
identidade inativa
→ deny
```

quando suportado pelo provider.

---

# 43. Teste do TenantGuard

Cobrir:

```text
actor sem membership
→ 403
```

```text
membership inativa
→ 403
```

```text
membership tenant A
tentativa tenant B
→ 403
```

```text
membership válida
→ trusted TenantContext
```

Esse é provavelmente o teste mais importante do PR.

---

# 44. Teste obrigatório de cross-tenant

Criar cenário explícito:

```text
Actor A
  ↓
Tenant A
```

tenta acessar:

```text
Tenant B
```

Resultado:

```text
403
```

Essa prova deve permanecer no projeto permanentemente.

---

# 45. Teste do PermissionGuard

Cobrir:

```text
permission presente
→ allow
```

```text
permission ausente
→ 403
```

```text
membership inexistente
→ 403
```

```text
permission list vazia
→ deny
```

---

# 46. Teste dos decorators

Validar:

```text
@RequirePermission()
```

metadata.

E:

```text
@CurrentActor()
@CurrentTenant()
```

extração correta de contexto.

---

# 47. Architecture tests

Adicionar regras:

```text
domain → authentication
FAIL
```

se for infraestrutura Nest.

```text
domain → tenancy guard
FAIL
```

```text
application → Nest Guard
FAIL
```

```text
authentication adapter → domain
permitido somente conforme contratos explícitos
```

---

# 48. Separar porta de adapter

Exemplo:

```text
IdentityProvider
       ▲
       │
MockIdentityProvider
```

Depois:

```text
IdentityProvider
       ▲
       │
SupabaseIdentityProvider
```

Sem reescrever Guard.

---

# 49. Não implementar Supabase diretamente dentro do Guard

Errado:

```ts
@Injectable()
export class AuthenticationGuard {
  constructor(
    private supabaseClient: SupabaseClient,
  ) {}
}
```

Preferir:

```text
AuthenticationGuard
       ↓
IdentityProvider
       ↓
Supabase adapter
```

Dependency Inversion.

---

# 50. Configuração

Adicionar somente envs realmente necessários.

Por exemplo, se adapter real for utilizado:

```text
AUTH_PROVIDER
SUPABASE_URL
SUPABASE_ANON_KEY
```

ou equivalente.

Não colocar:

```text
SUPABASE_SERVICE_ROLE_KEY
```

no Worker/browser sem necessidade explícita.

---

# 51. Mock provider para desenvolvimento

Se autenticação real ainda não estiver pronta, permitir configuração explícita:

```text
AUTH_PROVIDER=mock
```

Mas:

```text
production + mock auth
```

deve ser proibido por validation config.

Exemplo:

```text
NODE_ENV=production
AUTH_PROVIDER=mock
→ bootstrap failure
```

Isso evita publicar sem autenticação.

---

# 52. Não criar bypass mágico

Proibido:

```text
if NODE_ENV !== production
  allow everything
```

Preferir provider mock explícito com identidade previsível.

---

# 53. Mock identity determinístico

Exemplo:

```text
actor-dev-admin
```

e memberships:

```text
actor-dev-admin
→ tenant-dev-001
```

Isso permite testes.

Não usar dados pessoais reais.

---

# 54. Worker ownership

Authentication/Tenancy devem ser libraries compartilhadas.

Não duplicar:

```text
OperationsAuthenticationGuard
BillingAuthenticationGuard
ClinicalAuthenticationGuard
```

se a lógica técnica for a mesma.

Workers podem ter policies de permissões diferentes posteriormente.

---

# 55. Async Worker

O `async-worker` não usa necessariamente JWT.

Para job:

```text
actorId = system
```

ou identidade técnica equivalente.

Mas não implementar jobs ainda.

O ExecutionContext deve apenas permitir:

```text
actor type = system
```

futuramente, caso o contrato atual suporte.

---

# 56. BFF Worker

O BFF pode:

```text
propagar Authorization
```

e, dependendo da arquitetura:

```text
validar token preliminarmente
```

mas não resolve autorização definitiva de negócio.

---

# 57. Business Workers

`operations-worker`, `clinical-worker`, `billing-worker` devem tratar autenticação e tenancy como fronteira defensiva própria.

Assim:

```text
BFF comprometido/configurado incorretamente
```

não significa:

```text
Business API sem proteção
```

---

# 58. Ordem dos Guards

A ordem conceitual deve ser:

```text
AuthenticationGuard
        ↓
TenantGuard
        ↓
PermissionGuard
```

Porque não é possível verificar membership antes de saber o ator.

Nem permission antes de saber membership.

---

# 59. Ordem em termos de request pipeline

```text
Middleware
  requestId/correlationId
        ↓
Authentication
        ↓
Tenancy
        ↓
Permission
        ↓
Interceptor
        ↓
Controller
```

Observabilidade precisa capturar falhas inclusive nos Guards.

---

# 60. Health exception

O `/health` permanece:

```text
Middleware
 ↓
HealthController
```

sem authentication chain.

---

# 61. Não implementar licença ainda

Apesar de a licença ser pré-condição para operações, o PR-03 não implementa:

```text
LicenseGuard
```

nem:

```text
tenant license check
```

Isso é regra operacional/comercial e deve entrar junto do domínio/platform policy apropriado.

A documentação exige licença válida para operar, mas isso não significa que deva ser implementada como Guard genérico prematuramente. 

---

# 62. Não transformar tudo em Guard

Evitar:

```text
LicenseGuard
CustomerStatusGuard
ProfessionalGuard
DiscountGuard
AppointmentStatusGuard
```

Guards são para acesso/request boundary.

Policies/UseCases são para regras de negócio.

---

# 63. Estrutura esperada

Após o PR:

```text
libs/
├── execution-context/
│
├── observability/
│
├── authentication/
│   └── src/
│       ├── authenticated-identity.ts
│       ├── identity-provider.ts
│       ├── authentication.module.ts
│       ├── guards/
│       │   ├── authentication.guard.ts
│       │   └── permission.guard.ts
│       └── decorators/
│           ├── current-actor.decorator.ts
│           └── require-permission.decorator.ts
│
└── tenancy/
    └── src/
        ├── tenant-context.ts
        ├── tenant-membership.ts
        ├── tenant-membership-provider.ts
        ├── tenancy.module.ts
        ├── guards/
        │   └── tenant.guard.ts
        └── decorators/
            └── current-tenant.decorator.ts
```

---

# 64. Comandos Nest CLI principais

Depois do inventário:

```bash
nest g library authentication
nest g library tenancy
```

Depois:

```bash
nest g module authentication --project authentication
nest g module tenancy --project tenancy
```

Interfaces:

```bash
nest g interface authenticated-identity \
  --project authentication

nest g interface ports/identity-provider \
  --project authentication

nest g interface tenant-context \
  --project tenancy

nest g interface tenant-membership \
  --project tenancy

nest g interface ports/tenant-membership-provider \
  --project tenancy
```

Guards:

```bash
nest g guard guards/authentication \
  --project authentication

nest g guard guards/permission \
  --project authentication

nest g guard guards/tenant \
  --project tenancy
```

Decorators:

```bash
nest g decorator decorators/current-actor \
  --project authentication

nest g decorator decorators/require-permission \
  --project authentication

nest g decorator decorators/current-tenant \
  --project tenancy
```

Adapters somente se necessários:

```bash
nest g provider adapters/mock-identity-provider \
  --project authentication

nest g provider adapters/mock-tenant-membership-provider \
  --project tenancy
```

---

# 65. Integrar modules

Business Workers passam conceitualmente para:

```text
AppModule
├── Config
├── Observability
├── Authentication
├── Tenancy
└── Health
```

Ainda sem domínio funcional.

---

# 66. Testar Health após integração

```bash
npm run test
```

e E2E:

```text
GET /health
→ 200 sem token
```

Esse teste impede que um Guard global quebre liveness.

---

# 67. Criar endpoint técnico protegido?

Não é necessário criar um endpoint público adicional apenas para testar auth.

Prefira testar Guards isoladamente.

Se houver necessidade real de E2E, pode existir endpoint apenas em fixture/test app.

Não poluir API produtiva com:

```text
GET /auth-test
```

---

# 68. Lint

Executar:

```bash
npm run lint
```

---

# 69. Tests

```bash
npm run test
```

Quando aplicável:

```bash
npm run test:e2e
```

---

# 70. Builds

```bash
nest build bff-worker
nest build operations-worker
nest build clinical-worker
nest build billing-worker
nest build async-worker
```

---

# 71. Wrangler

```bash
npx wrangler types
```

Depois:

```bash
npx wrangler deploy --dry-run
```

Sem deploy real.

---

# 72. Segurança do Free Tier

Este PR não deve introduzir consultas D1 por enquanto.

Então, com provider mock:

```text
D1 reads = 0
D1 writes = 0
```

Quando o `MembershipProvider` passar para D1 no PR seguinte, precisamos evitar:

```text
3 queries de auth
×
cada request
```

Por isso já devemos pensar em contrato compacto.

---

# 73. Preparação para cache futuro

Não implementar KV agora.

Mas o `MembershipProvider` deve permitir futuramente:

```text
CachedMembershipProvider
       ↓
D1MembershipProvider
```

sem alterar Guards.

---

# 74. Não cachear permissão indefinidamente

Quando cache existir, deverá ter TTL curto e invalidação coerente.

Porque a documentação exige que mudanças de perfil/permissão tenham efeito atual e sejam auditadas. 

---

# 75. Definition of Done

Eu congelaria:

```text
[ ] PR-00 íntegro
[ ] PR-01 íntegro
[ ] PR-02 íntegro

[ ] authentication library criada
[ ] tenancy library criada

[ ] AuthenticatedIdentity definido
[ ] IdentityProvider definido
[ ] TenantMembership definido
[ ] TenantMembershipProvider definido
[ ] TenantContext definido

[ ] AuthenticationGuard criado via CLI
[ ] TenantGuard criado via CLI
[ ] PermissionGuard criado via CLI

[ ] CurrentActor decorator criado
[ ] CurrentTenant decorator criado
[ ] RequirePermission decorator criado

[ ] tenant não é confiado a partir de body/query/header arbitrário

[ ] actorId entra no ExecutionContext
[ ] tenantId entra no ExecutionContext apenas após membership

[ ] ausência de membership → deny
[ ] membership inativa → deny
[ ] permission ausente → deny

[ ] tenant A não acessa tenant B

[ ] Health permanece público
[ ] Health continua sem DB

[ ] JWT não é logado
[ ] claims completos não são logados
[ ] PII não entra na observabilidade

[ ] Domain não depende de Nest Guards
[ ] Application não depende de Nest Guards

[ ] architecture tests PASS
[ ] auth tests PASS
[ ] tenancy tests PASS
[ ] cross-tenant tests PASS

[ ] lint PASS
[ ] test PASS

[ ] builds individuais PASS
[ ] wrangler types PASS
[ ] wrangler dry-run PASS

[ ] nenhum domínio funcional implementado
[ ] diff revisado
```

# 76. Estado arquitetural depois do PR-03

Teremos:

```text
                    HTTP
                     │
             Request/Correlation
                     │
                     ▼
            AuthenticationGuard
                     │
             AuthenticatedIdentity
                     │
                     ▼
                TenantGuard
                     │
            Trusted TenantContext
                     │
                     ▼
              PermissionGuard
                     │
                     ▼
             ExecutionContext
            ┌────────┴─────────┐
            │                  │
         actorId            tenantId
            │                  │
            └────────┬─────────┘
                     ▼
                  Controller
```

Ainda sem:

```text
Appointment
Customer
Payment
Session
```