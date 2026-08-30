Com o **PR-19 concluído** e a sessão ainda em `IN_PROGRESS`, o próximo PR deve materializar o último grande requisito técnico pendente antes de permitir a conclusão da sessão:

# PR-20 — Session Photos + Cloudflare R2 Storage Foundation

O objetivo é adicionar **evidências fotográficas privadas e historicamente vinculadas à sessão/intercorrência**, usando **Cloudflare R2 para o binário** e **D1 apenas para metadados**.

A arquitetura deve ficar assim:

```text
Clinical Worker
     │
     ├── Session IN_PROGRESS
     │     ├── Technical Form
     │     ├── Technical Values
     │     ├── Power
     │     ├── Equipment
     │     ├── Variation Alerts
     │     ├── Intercurrences
     │     └── Photos
     │           │
     │           ├── metadata → D1
     │           └── binary   → R2
     │
     └── private download/streaming
```

O PR deve **terminar com a sessão ainda `IN_PROGRESS`**.

`CompleteSession` continua fora e deve ser o PR seguinte.

---

# 1. Escopo exato do PR-20

Entram:

```text
Photo/Attachment domain

Session photo
Intercurrence photo

photo type/purpose
historical ownership

R2 StoragePort
Cloudflare R2 adapter

private object keys
content type validation
size validation

streaming upload
streaming/private download

D1 metadata

upload lifecycle
idempotency

tenant isolation
professional authorization

soft logical deletion / historical preservation
quando normativamente permitido

orphan/reconciliation strategy

photo requirement projection
para futura CompleteSession

Cloudflare Workers physical tests

gate:pr20
```

Continuam fora:

```text
CompleteSession

public image gallery
public R2 bucket
Cloudflare Images
image transformation pipeline

AI image analysis
OCR

Payment
Refund

WhatsApp
Email

material inventory
```

---

# 2. Começar limpando a baseline

Antes de modificar qualquer arquivo:

```bash
git status
git branch --show-current
git log --oneline -20

npm run gate:pr18
npm run gate:pr19
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

Tudo precisa permanecer:

```text
PASS
```

---

# 3. Verificar novamente ruído de package manager

Como o ambiente anteriormente modificou:

```text
yarn.lock
.yarn/install-state.gz
```

confirmar antes do PR:

```bash
git status --short
git diff -- yarn.lock
```

O PR-20 não deve carregar alterações acidentais de Yarn se o projeto usa:

```text
package-lock.json
```

como lock autoritativo.

---

# 4. Criar plano formal

Criar:

```text
docs/plans/PR-20-session-photos-r2-storage.md
```

Com:

```text
Objective
Scope

Photo ownership
Photo purposes
R2 ownership
D1 metadata

Upload lifecycle
Object key policy
Validation
Streaming
Privacy

Idempotency

R2/D1 consistency
Failure recovery

Authorization
Tenant isolation

Historical immutability

Free-tier constraints

Tests
Definition of Done
Out of scope
```

---

# 5. Ownership

As fotografias técnicas pertencem ao:

```text
clinical-worker
```

porque estão associadas a:

```text
Session
Intercurrence
Technical history
```

Portanto:

```text
Clinical
├── Session
├── Technical data
├── Equipment
├── Intercurrence
└── PhotoAttachment
```

Não criar domínio autoritativo de fotos no Operations Worker.

---

# 6. R2 guarda binários, D1 guarda metadados

Congelar esta regra:

```text
R2
→ bytes

D1
→ identity
→ tenant
→ owner
→ content metadata
→ R2 key
→ status
→ timestamps
```

Nunca persistir:

```text
base64 image
blob
binary
```

em D1.

---

# 7. Não tornar bucket público

As fotos podem conter dados sensíveis.

A arquitetura deve assumir:

```text
R2 bucket = private
```

A leitura ocorre:

```text
authenticated request
        ↓
Clinical Worker
        ↓
authorization
        ↓
R2
        ↓
stream
```

Não armazenar URL pública permanente.

---

# 8. Adicionar binding R2 ao Clinical Worker

Inspecionar primeiro:

```bash
cat apps/clinical-worker/wrangler.jsonc
```

Adicionar binding conceitualmente:

```text
SESSION_MEDIA
```

ou nome coerente com o projeto.

Exemplo de responsabilidade:

```text
env.SESSION_MEDIA
→ R2Bucket
```

Não usar:

```text
env.BUCKET1
```

ou nomes genéricos sem domínio.

---

# 9. Não colocar binding R2 no Operations sem necessidade

Neste PR:

```text
Clinical → R2
```

Operations não precisa conhecer o bucket.

---

# 10. Gerar os tipos novamente

Depois da configuração:

```bash
npx wrangler types \
  -c apps/clinical-worker/wrangler.jsonc
```

E garantir:

```text
typecheck = PASS
```

---

# 11. Criar módulo de mídia

Se ainda não existir:

```bash
nest g module media \
  --project clinical-worker
```

Ou:

```text
session-media
```

se essa nomenclatura encaixar melhor no repositório.

Estrutura:

```text
media/
├── domain/
├── application/
├── ports/
└── adapters/
```

---

# 12. Não modelar como “arquivo genérico do sistema”

Embora o adapter de storage possa ser genérico, o domínio deve saber que estamos lidando com:

```text
SessionPhoto
```

ou:

```text
ClinicalPhotoAttachment
```

Não criar um:

```text
FileManager
```

global sem contexto.

---

# 13. Criar `PhotoAttachment`

Via CLI:

```bash
nest g class \
  media/domain/photo-attachment \
  --project clinical-worker \
  --no-spec
```

Campos mínimos:

```text
id
tenantId

sessionId
intercurrenceId?

purpose

objectKey

contentType
sizeBytes

originalFileName?
checksum?

status

capturedAt?
uploadedAt
uploadedBy

createdAt
```

Não armazenar URL pública.

---

# 14. Definir purposes canônicos

A documentação do produto já diferencia fotos associadas ao atendimento, como antes/durante/depois e evidências de intercorrência.

Uma modelagem possível:

```text
BEFORE
DURING
AFTER
INTERCURRENCE
```

Mas use exatamente os termos normativos existentes na documentação/código.

Não adicionar:

```text
PROFILE
MARKETING
DOCUMENT
```

nesse domínio clínico sem requisito.

---

# 15. Não confiar no purpose do caller sem contexto

Por exemplo:

```text
purpose=INTERCURRENCE
```

deve exigir:

```text
intercurrenceId
```

válida da mesma:

```text
tenant
session
```

---

# 16. Photo BEFORE/DURING/AFTER

Devem referenciar:

```text
tenantId
sessionId
```

e Session existente.

---

# 17. Session deve aceitar fotografia apenas em estado compatível

Para novas fotos técnicas durante o atendimento:

```text
Session = IN_PROGRESS
```

deve ser o caminho normal.

Não permitir upload arbitrário para:

```text
Session inexistente
Session de outro tenant
```

---

# 18. Registro tardio fica fora

Não inventar ainda workflow de:

```text
adicionar foto depois da conclusão
```

Se necessário futuramente, será operação administrativa auditada.

---

# 19. Criar `ObjectStoragePort`

O Domain/Application não deve conhecer:

```text
R2Bucket
```

Criar:

```text
ObjectStoragePort
```

ou:

```text
ClinicalMediaStoragePort
```

Contrato mínimo:

```text
put(...)
get(...)
delete(...)
head(...)
```

somente conforme necessidades reais.

---

# 20. Adapter Cloudflare R2

Criar provider:

```bash
nest g provider \
  media/adapters/r2-clinical-media-storage \
  --project clinical-worker
```

O adapter recebe:

```text
R2Bucket
```

via bootstrap/runtime adapter.

---

# 21. Domain não importa tipos Cloudflare

Proibido:

```ts
import type { R2Bucket } from '@cloudflare/workers-types';
```

dentro de:

```text
domain/
application/
```

Somente adapter/runtime conhece Cloudflare.

---

# 22. Gerar object key no backend

Não aceitar:

```json
{
  "objectKey": "..."
}
```

do frontend.

Object key deve ser server-generated.

Estratégia conceitual:

```text
tenant/<tenantId>/
sessions/<sessionId>/
photos/<photoId>
```

ou equivalente.

---

# 23. Não colocar PII no object key

Não:

```text
/customer-jose-da-silva/cpf-123...
```

Use IDs opacos.

---

# 24. Não confiar em filename para object key

`originalFileName` pode ser metadata sanitizada.

Nunca:

```text
objectKey = originalFileName
```

Isso cria colisão/path traversal/problemas de encoding.

---

# 25. Validação de content type

Permitir apenas formatos aprovados.

Por exemplo, se normativo:

```text
image/jpeg
image/png
image/webp
```

Não aceitar automaticamente:

```text
image/svg+xml
application/octet-stream
text/html
```

porque SVG/HTML possuem riscos diferentes.

---

# 26. Não confiar apenas no header

O request pode declarar:

```text
Content-Type: image/jpeg
```

sem ser JPEG.

Idealmente validar:

```text
magic bytes
```

de forma limitada.

Não fazer OCR ou decoding completo.

---

# 27. Validação de tamanho

Criar configuração operacional:

```text
MAX_CLINICAL_PHOTO_BYTES
```

Não deixar upload ilimitado.

Isso é fundamental para:

```text
R2 Free
Worker memory
abuse prevention
```

---

# 28. Não usar buffer integral

Esse é um requisito arquitetural importante.

Evitar:

```ts
const bytes = await request.arrayBuffer();
```

para fotos grandes, sempre que o runtime/adapter permitir streaming adequado.

Preferir:

```text
Request.body
→ stream
→ R2 put
```

ou mecanismo streaming compatível do runtime.

---

# 29. Seguir a mesma filosofia de `StreamingFiles`

A camada HTTP deve:

```text
validate metadata
↓
stream content
↓
storage adapter
```

e não carregar o arquivo inteiro em memória.

Isso é especialmente importante no Workers.

---

# 30. Não utilizar Multer como autoridade no Module Worker

O projeto possui entrypoint Cloudflare próprio.

Multer é orientado ao stack Node/Express e não deve ser forçado sobre `workerd` se não for compatível.

Pode haver adapter Nest/Node futuro, mas o runtime Cloudflare deve usar streaming nativo.

---

# 31. Estratégia de upload

Eu recomendo para este PR:

```text
POST metadata/upload request
        ↓
Clinical validates
        ↓
stream directly through Worker
        ↓
R2
        ↓
D1 finalize metadata
```

Mas existe um problema:

```text
R2 + D1
```

não possuem transação distribuída.

Precisamos modelar isso conscientemente.

---

# 32. Não fingir atomicidade D1 + R2

Proibido afirmar:

```text
photo upload is atomically committed in D1 and R2
```

Não é.

Precisamos de lifecycle recuperável.

---

# 33. Criar lifecycle técnico da Photo

Uma modelagem robusta:

```text
PENDING_UPLOAD
      ↓
AVAILABLE
```

e, quando necessário:

```text
FAILED
```

Talvez:

```text
DELETED
```

posteriormente.

O principal é que:

```text
AVAILABLE
```

signifique:

```text
metadata valid
+
object confirmed in R2
```

---

# 34. Fluxo recomendado

### Fase 1 — D1 intent

Criar metadata:

```text
PENDING_UPLOAD
```

com:

```text
photoId
objectKey
expected content metadata
```

Idempotentemente.

### Fase 2 — R2 upload

```text
put(objectKey, stream)
```

### Fase 3 — finalize D1

Confirmar:

```text
AVAILABLE
size
etag/checksum
uploadedAt
```

---

# 35. Por que metadata first?

Se Worker morrer antes do R2 upload:

```text
PENDING_UPLOAD
```

é visível e recuperável.

Se upload terminar mas finalize falhar:

```text
R2 object exists
D1 = PENDING_UPLOAD
```

também é reconciliável.

Muito melhor que objeto R2 órfão sem qualquer referência.

---

# 36. Unique object identity

Criar:

```text
UNIQUE tenant_id + id
```

e:

```text
UNIQUE object_key
```

quando aplicável.

---

# 37. `PENDING_UPLOAD` antigo precisa ser reconciliável

PR-20 deve pelo menos criar uma operação:

```text
ReconcilePendingPhotoUpload
```

ou repository primitives para:

```text
head R2
```

e decidir:

```text
object exists
→ finalize

does not exist
→ FAILED/retryable
```

Não precisa de Cron ainda.

---

# 38. Não implementar polling contínuo

Nada de:

```text
scan PENDING_UPLOAD every request
```

Reconciliation é explícito/bounded.

---

# 39. Criar migration `0014`

Provavelmente:

```text
database/d1/migrations/
0014_session_photos_r2_storage.sql
```

depois de confirmar a sequência real.

Tabela:

```text
clinical_photo_attachments
```

ou nomenclatura coerente.

---

# 40. Schema conceitual

```text
id
tenant_id

session_id
intercurrence_id

purpose

object_key
content_type
size_bytes
checksum
etag

status

captured_at
uploaded_at
uploaded_by

failure_code
created_at
updated_at
```

Sem URL pública.

---

# 41. Índices

Queries principais:

```text
tenant + session + status
tenant + intercurrence + status
tenant + id
```

Portanto índices coerentes.

Não indexar filename.

---

# 42. Criar `PhotoAttachmentRepository`

Via CLI:

```bash
nest g interface \
  media/ports/photo-attachment-repository \
  --project clinical-worker
```

Operações orientadas ao lifecycle:

```text
createPending
findById
listAvailableBySession
listAvailableByIntercurrence
markAvailable
markFailed
```

---

# 43. Criar D1 adapter

```bash
nest g provider \
  media/adapters/d1-photo-attachment-repository \
  --project clinical-worker
```

Tenant-aware.

---

# 44. Criar `UploadSessionPhoto`

```bash
nest g service \
  media/application/upload-session-photo \
  --project clinical-worker
```

Responsabilidade:

```text
validate Session
↓
professional authorization
↓
validate purpose
↓
validate file metadata
↓
reserve PhotoAttachment/PENDING_UPLOAD
↓
stream to R2
↓
head/result validation
↓
finalize AVAILABLE
↓
Audit
```

---

# 45. Atomicidade do D1 intent

A criação do:

```text
PENDING_UPLOAD
```

e idempotência podem ser localmente atômicas.

Mas não segure a transação durante upload R2.

---

# 46. Upload R2 fica fora da D1 transaction

Fluxo:

```text
D1 commit intent
↓
R2 upload
↓
D1 finalize
```

Documentar explicitamente.

---

# 47. Idempotency-Key obrigatório

Uploads também sofrem:

```text
double click
network retry
```

Então a criação do PhotoAttachment precisa ser idempotente.

---

# 48. Mas cuidado com replay de body stream

Uma segunda request com mesma key pode chegar com outro arquivo.

O request hash precisa incluir metadata suficiente.

Se possível:

```text
client-provided checksum
```

pode compor identidade.

Mas não confiar cegamente nele para integridade.

---

# 49. Estratégia simples para MVP

Request metadata:

```text
purpose
contentType
contentLength
clientChecksum?
```

Idempotency hash:

```text
tenant
session
purpose
content metadata
client checksum quando disponível
```

Se mesma key com metadata diferente:

```text
IDEMPOTENCY_KEY_CONFLICT
```

---

# 50. Não incluir stream inteiro no hash em memória

Não faça:

```text
read complete image
→ SHA256
→ upload
```

se isso exigir buffer completo.

Se checksum server-side for necessário, use streaming hashing quando possível.

---

# 51. ETag não substitui necessariamente hash criptográfico

Trate:

```text
etag
```

como metadata R2, não como garantia universal de conteúdo se a semântica não estiver congelada.

---

# 52. Audit da foto

Eventos auditáveis:

```text
SessionPhotoUploaded
IntercurrencePhotoUploaded
```

Metadata segura:

```text
tenantId
sessionId
photoId
purpose
contentType
sizeBytes
actorId
correlationId
```

Não colocar binário.

---

# 53. Outbox não é necessário para cada foto

Nenhum outro Worker precisa receber o arquivo.

Não crie:

```text
PhotoUploaded → Outbox
```

apenas por simetria, salvo consumer real.

---

# 54. Upload de Intercurrence Photo

Pode reutilizar o mesmo use case com owner/context específico ou ter:

```text
UploadIntercurrencePhoto
```

fino.

Validações:

```text
intercurrence.tenant = tenant
intercurrence.session = session
```

---

# 55. Não permitir Intercurrence A usar foto de Session B

Todos os owners precisam ser coerentes.

---

# 56. Download deve ser autorizado

Criar:

```text
GetClinicalPhoto
```

ou:

```text
StreamClinicalPhoto
```

Fluxo:

```text
auth
↓
tenant
↓
permission
↓
Photo metadata D1
↓
owner authorization
↓
R2 get
↓
stream
```

---

# 57. Endpoint de upload

Uma possibilidade:

```http
POST /tenants/:tenantId/sessions/:sessionId/photos
```

Com metadata via headers/query/form conforme bridge escolhido.

Como o Worker precisa fazer streaming, não force multipart parsing pesado se não for necessário.

---

# 58. Uma API streaming simples é preferível

Conceitualmente:

```http
POST /tenants/:tenantId/sessions/:sessionId/photos?purpose=BEFORE

Content-Type: image/jpeg
Content-Length: ...
Idempotency-Key: ...
```

Body:

```text
raw image stream
```

Isso é muito mais simples no Workers que multipart.

Se o frontend precisar filename, pode enviar header sanitizado separado.

---

# 59. Não inventar multipart se o produto não precisa

O endpoint recebe uma foto por request.

Logo raw body é suficiente.

---

# 60. Endpoint de leitura

Por exemplo:

```http
GET /tenants/:tenantId/sessions/:sessionId/photos/:photoId
```

Response:

```text
stream privado
```

Com:

```text
Content-Type
Content-Length
ETag
Cache-Control apropriado
```

Não expor R2 key.

---

# 61. Cache privado

Fotos clínicas não devem ser cacheadas publicamente pela CDN.

Usar headers coerentes com:

```text
private
```

e política de segurança.

Não:

```text
public, max-age=31536000
```

por padrão.

---

# 62. Download range?

Não é essencial para foto pequena.

Não complicar o PR com Range requests, salvo se streaming helper já suportar naturalmente.

---

# 63. Endpoint de listagem

```http
GET /tenants/:tenantId/sessions/:sessionId/photos
```

Deve retornar somente metadata autorizada:

```text
id
purpose
contentType
sizeBytes
capturedAt
uploadedAt
```

Não:

```text
R2 object key
internal bucket
```

---

# 64. A listagem não retorna binários

Fotos são carregadas sob demanda.

Isso reduz:

```text
Worker CPU
R2 reads
bandwidth
```

---

# 65. Professional authorization

O profissional da Session pode:

```text
upload
view
```

segundo permissões clínicas.

Profissional diferente precisa da permissão explícita de histórico técnico.

Reutilizar política do PR-17/18/19.

---

# 66. Admin/recepção não ganham acesso automaticamente

Fotos técnicas são mais sensíveis que Appointment operacional.

Não inferir:

```text
tenant membership = photo access
```

A autorização precisa ser específica.

---

# 67. Caller não define uploadedBy

Vem do ExecutionContext.

---

# 68. `capturedAt`

Pode ser informado se a foto foi tirada ligeiramente antes do upload.

Validar:

```text
not future beyond tolerance
```

e coerência temporal.

`uploadedAt` é server-side.

---

# 69. Remoção de foto

Cuidado.

A documentação exige histórico consistente.

Eu **não implementaria hard delete** neste PR.

Se correção for necessária, poderá existir:

```text
VOIDED
```

ou similar somente quando normativo.

Por enquanto, upload e consulta são suficientes.

---

# 70. R2 `delete()` ainda pode ser necessário para rollback/reconciliation

Isso não significa expor DeletePhoto ao usuário.

O adapter pode precisar apagar objeto inválido/orphan durante recuperação técnica.

---

# 71. Requirement de foto por Service

O Service já possui:

```text
requiresPhoto
```

ou equivalente, segundo o histórico do projeto.

PR-20 deve materializar uma policy consultiva:

```text
EvaluateSessionPhotoRequirement
```

---

# 72. Resultado explícito

Algo como:

```text
NOT_REQUIRED

REQUIRED_SATISFIED

REQUIRED_MISSING
```

Talvez detalhado por purposes:

```text
BEFORE missing
AFTER missing
```

somente se a regra configurar tipos obrigatórios.

---

# 73. Não bloquear upload porque Service não exige foto

Se:

```text
requiresPhoto=false
```

o profissional ainda pode adicionar foto quando permitido.

`requiresPhoto` significa requisito mínimo para futura conclusão, não proibição.

---

# 74. Não implementar conclusão

Neste PR:

```text
REQUIRED_MISSING
```

apenas informa readiness.

Não muda:

```text
Session IN_PROGRESS
```

---

# 75. Intercurrence photos não contam automaticamente como Session requirement

Uma:

```text
INTERCURRENCE
```

photo não deve satisfazer:

```text
BEFORE
AFTER
```

a menos que regra diga isso.

---

# 76. Histórico imutável

Após upload:

```text
SessionPhoto metadata
```

deve permanecer associada à:

```text
session
tenant
purpose
```

Mesmo que:

```text
Professional INACTIVE
Equipment INACTIVE
Service changed
```

no futuro.

---

# 77. R2 key também não deve depender de estado atual

Nada de reconstruir key a partir do nome atual do Customer/Service.

Persistir objectKey.

---

# 78. R2 object metadata

Pode armazenar metadados técnicos mínimos:

```text
tenantId
photoId
sessionId
```

mas D1 continua autoridade para autorização.

Não autorizar somente por metadata R2.

---

# 79. Não colocar descrição clínica em R2 metadata

Metadata pode ser inspecionada operacionalmente.

Mantenha mínima.

---

# 80. Falha no R2 upload

Cenário:

```text
D1 PENDING_UPLOAD
↓
R2 put fails
```

Resultado:

```text
photo not AVAILABLE
```

Pode:

```text
PENDING_UPLOAD
```

permanecer retryable ou ir:

```text
FAILED
```

conforme política.

Nunca retornar sucesso.

---

# 81. Falha no D1 finalize

```text
R2 put succeeds
D1 finalize fails
```

Resultado:

```text
PENDING_UPLOAD
R2 object exists
```

Reconciliation deve conseguir:

```text
head object
→ finalize AVAILABLE
```

---

# 82. Falha do Worker depois do upload

Mesmo comportamento.

Isso precisa de teste físico.

---

# 83. R2 object inexistente durante read

Metadata:

```text
AVAILABLE
```

mas object sumiu.

Isso é inconsistência séria.

Retornar erro sanitizado e observabilidade:

```text
PHOTO_OBJECT_MISSING
```

Não `404` simples como se metadata nunca existisse, pois há corrupção/inconsistência.

---

# 84. Criar `ReconcilePhotoAttachment`

Use case:

```text
PENDING_UPLOAD
        ↓
R2 head
        ├── exists → AVAILABLE
        └── missing → FAILED/retryable
```

Também pode detectar:

```text
AVAILABLE + missing object
```

para diagnóstico.

---

# 85. Não criar Cron neste PR

A operação existe e é testada.

Agendamento automático pode vir depois se necessário.

---

# 86. Free Tier — R2

O projeto deve continuar consciente dos limites definidos para o MVP:

```text
10 GB R2
1M Class A ops/mês
```

Portanto não criar excesso de operações:

```text
head
get
put
list
```

sem necessidade.

---

# 87. Não usar `bucket.list()` para listar fotos de Session

Isso é importante.

Listagem deve vir do:

```text
D1 metadata
```

por:

```text
tenant + session
```

Não:

```text
R2 LIST prefix
```

em toda tela.

Isso economiza operações R2 e preserva autorização.

---

# 88. Fluxo de tela

```text
GET photo metadata list
→ D1 only

user opens photo
→ R2 GET only for selected photo
```

Muito melhor para Free-first.

---

# 89. Não usar R2 HEAD em toda listagem

Só reconciliation/integrity checks.

---

# 90. Upload = uma única PUT

Evite upload multipart para arquivos pequenos do MVP, salvo necessidade real.

Isso economiza operações Classe A.

---

# 91. Limite de fotos

Se não existe limite normativo por sessão:

```text
não inventar 3
não inventar 5
```

Mas pode haver proteção operacional:

```text
MAX_PHOTOS_PER_SESSION
```

somente se considerada anti-abuse/config operacional.

Melhor não introduzir sem necessidade.

---

# 92. Abuse protection

No mínimo:

```text
authentication
tenant
permission
Session ownership
max file size
accepted content type
```

antes de consumir grande upload.

Quando `Content-Length` conhecido e acima do limite:

```text
reject before R2
```

---

# 93. Content-Length ausente

Ainda aplicar limite durante streaming quando a API/runtime permitir.

Não permitir bypass apenas omitindo o header.

---

# 94. Não gerar thumbnails neste PR

Isso aumentaria:

```text
CPU
R2 writes
complexidade
```

Fotos originais apenas.

Thumbnail/transformação pode ser PR futuro.

---

# 95. Não usar Cloudflare Images

O requisito atual é R2 e Free-first.

Não adicionar outro produto.

---

# 96. Testes unitários do domínio

Cobrir:

```text
valid purposes

INTERCURRENCE requires intercurrence

content type allowed/rejected

size valid/invalid

status transitions

tenant ownership
```

---

# 97. Testes unitários da key policy

Object key:

```text
stable
opaque
tenant partitioned
no original filename
no path traversal
```

---

# 98. Workers test — upload feliz

Fixture:

```text
Session IN_PROGRESS
Professional authorized
JPEG valid
```

Request:

```text
POST photo
```

Esperado:

```text
D1 metadata AVAILABLE
R2 object exists
Audit = 1
```

---

# 99. Workers test — tenant isolation

Tenant B tenta:

```text
upload
list
read
```

Photo da Session A.

Tudo:

```text
BLOCKED
```

---

# 100. Workers test — professional ownership

Professional B sem autorização tenta upload na Session A.

```text
403
```

---

# 101. Workers test — size

Arquivo acima de:

```text
MAX_CLINICAL_PHOTO_BYTES
```

Resultado:

```text
reject
R2 put = 0
AVAILABLE metadata = 0
```

Pode haver PENDING intent dependendo da ordem escolhida; nesse caso precisa terminar como FAILED/clean.

---

# 102. Workers test — content type

```text
text/html
→ reject
```

Sem R2 object.

---

# 103. Workers test — fake MIME

Se implementar magic-byte check:

```text
Content-Type=image/jpeg
body=not JPEG
→ reject
```

---

# 104. Workers test — idempotency

Duas chamadas:

```text
same key
same metadata/content identity
```

Resultado lógico:

```text
one PhotoAttachment
one R2 object
one Audit
```

---

# 105. Workers test — idempotency conflict

Same key com outro purpose/file metadata:

```text
IDEMPOTENCY_KEY_CONFLICT
```

---

# 106. Workers test — R2 failure

Simular storage failure.

Resultado:

```text
Photo != AVAILABLE
```

e nenhum sucesso HTTP.

---

# 107. Workers test — finalize failure

Simular:

```text
R2 success
D1 finalize failure
```

Depois:

```text
ReconcilePhotoAttachment
```

Esperado:

```text
AVAILABLE
```

com o mesmo object.

---

# 108. Workers test — private read

Usuário autorizado:

```text
GET
→ bytes corretos
```

Headers:

```text
Content-Type
private caching policy
```

---

# 109. Workers test — metadata list

Duas fotos:

```text
BEFORE
DURING
```

List:

```text
2 metadata records
0 binary in JSON
0 object keys exposed
```

---

# 110. Workers test — Intercurrence photo

Criar:

```text
Intercurrence OPEN
```

Upload:

```text
purpose=INTERCURRENCE
intercurrenceId=X
```

Passa.

Outro `intercurrenceId` de outra Session:

```text
BLOCKED
```

---

# 111. Histórico depois da Intercurrence resolvida

A foto continua ligada à intercorrência histórica.

Não desaparece ao:

```text
OPEN → RESOLVED
```

---

# 112. Teste requirement

Service:

```text
requiresPhoto=true
```

Sem foto:

```text
REQUIRED_MISSING
```

Após upload válido:

```text
REQUIRED_SATISFIED
```

Mas Session permanece:

```text
IN_PROGRESS
```

---

# 113. Foto PENDING não satisfaz requisito

Apenas:

```text
AVAILABLE
```

conta.

---

# 114. Foto FAILED não satisfaz

Mesmo.

---

# 115. Architecture tests

Proibir:

```text
Photo Domain → R2Bucket

Photo Domain → Cloudflare

Photo Domain → D1

Clinical media → Operations DB
```

Permitido:

```text
UploadSessionPhoto
→ ClinicalMediaStoragePort
→ PhotoAttachmentRepository
```

---

# 116. Observabilidade

Upload:

```text
operation=UploadSessionPhoto
tenantId
sessionId
photoId
purpose
contentType
sizeBucket/range
result
correlationId
duration
```

Evite até `sizeBytes` como métrica de alta cardinalidade se não necessário; pode usar histogram.

---

# 117. Não logar filename se possuir PII

`originalFileName` não precisa aparecer em logs.

---

# 118. Download

Logar:

```text
photoId
tenant
result
```

sem objectKey.

---

# 119. Métricas úteis

Se observability foundation suporta:

```text
clinical.photo.upload.success
clinical.photo.upload.failure
clinical.photo.read.success
clinical.photo.read.failure
clinical.photo.reconcile.success
```

Mais:

```text
photo upload bytes histogram
```

sem IDs como labels.

---

# 120. Health regression

Mesmo com R2 binding:

```http
GET /health
```

não deve executar:

```text
R2 head
R2 list
R2 get
D1
```

Health continua barato.

---

# 121. Dry-run

Agora é essencial verificar binding:

```bash
npx wrangler deploy --dry-run \
  -c apps/clinical-worker/wrangler.jsonc
```

Precisa reconhecer:

```text
D1
Operations Service Binding
R2 binding
```

---

# 122. Workers harness precisa incluir R2

Atualizar:

```text
vitest.config.workers.mjs
```

para disponibilizar bucket de teste do Clinical.

Não mockar armazenamento em memória no teste físico principal se o plugin suporta R2 no workerd.

---

# 123. Migrations

Banco vazio:

```text
0001
...
0014
```

PASS.

Reaplicação:

```text
No migrations to apply
```

---

# 124. `EXPLAIN QUERY PLAN`

Quando possível, verificar:

```text
list photos by session
list photos by intercurrence
```

D1 deve usar índice.

---

# 125. Não usar R2 list como fallback

Se D1 não encontrar metadata:

```text
return no photo
```

Não buscar bucket inteiro tentando descobrir arquivo perdido.

Reconciliation é operação separada.

---

# 126. Atualizar documentação arquitetural

Atualizar:

```text
docs/architecture/workers.md
docs/architecture/cloudflare-runtime.md
```

com:

```text
Clinical Worker
    ├── D1
    └── R2 SESSION_MEDIA
```

---

# 127. Criar documento de storage

Adicionar:

```text
docs/storage/clinical-media.md
```

Explicando:

```text
private bucket
metadata authority
object key
upload lifecycle
R2/D1 consistency
streaming
reconciliation
retention
privacy
```

---

# 128. Atualizar README

Adicionar setup local necessário para:

```text
R2 binding
test:workers
gate:pr20
```

Sem instruções de deploy real.

---

# 129. Criar `gate:pr20`

```bash
npm run gate:pr20
```

Se `gate:pr19` já incorpora todos os anteriores:

```text
gate:pr20
→ gate:pr19
→ PR20 unit tests
→ PR20 workerd/R2 tests
→ dry-runs
```

---

# 130. Definition of Done — Domain

```text
[ ] PhotoAttachment domain

[ ] Session ownership

[ ] Intercurrence ownership optional

[ ] purpose validated

[ ] private object key

[ ] content type metadata

[ ] size metadata

[ ] lifecycle explicit

[ ] historical references preserved
```

---

# 131. Definition of Done — R2

```text
[ ] R2 binding Clinical

[ ] R2 adapter behind port

[ ] private bucket assumption

[ ] upload streaming

[ ] private download streaming

[ ] no base64

[ ] no binary D1

[ ] no public URL persistence

[ ] no R2 listing for normal application flow
```

---

# 132. Definition of Done — validation

```text
[ ] supported image content types

[ ] invalid type rejected

[ ] max size enforced

[ ] caller cannot choose objectKey

[ ] caller cannot forge uploadedBy

[ ] intercurrence ownership validated
```

---

# 133. Definition of Done — consistency

```text
[ ] PENDING_UPLOAD

[ ] AVAILABLE

[ ] failure state/retry semantics

[ ] D1 intent before or explicitly coordinated with R2

[ ] no distributed transaction claim

[ ] R2 success + finalize failure recoverable

[ ] reconciliation application service

[ ] AVAILABLE requires confirmed object
```

---

# 134. Definition of Done — Idempotency

```text
[ ] upload uses Idempotency-Key

[ ] replay does not duplicate metadata

[ ] replay does not duplicate object

[ ] hash conflict detected

[ ] tenant key isolation
```

---

# 135. Definition of Done — Security

```text
[ ] authentication

[ ] tenant membership

[ ] clinical photo permission

[ ] professional ownership

[ ] cross-tenant upload blocked

[ ] cross-tenant read blocked

[ ] object key not exposed

[ ] bucket not public

[ ] no sensitive photo data in logs
```

---

# 136. Definition of Done — historical integrity

```text
[ ] photo remains linked to Session

[ ] Intercurrence photo remains linked after resolution

[ ] future Service changes do not alter metadata

[ ] future Professional inactivation does not remove history

[ ] no normal hard-delete workflow
```

---

# 137. Definition of Done — photo requirement

```text
[ ] Service photo requirement readable

[ ] NOT_REQUIRED

[ ] REQUIRED_MISSING

[ ] REQUIRED_SATISFIED

[ ] only AVAILABLE photo satisfies requirement

[ ] requirement evaluation does not complete Session
```

---

# 138. Definition of Done — Free-first

```text
[ ] list uses D1

[ ] binary retrieved only when requested

[ ] no bucket.list in normal flow

[ ] one R2 PUT per photo

[ ] no thumbnails

[ ] no Cloudflare Images

[ ] no unnecessary HEAD requests

[ ] bounded file size
```

---

# 139. Definition of Done — regressions

```text
[ ] PR-16 StartSession PASS

[ ] PR-17 Technical Forms PASS

[ ] PR-18 Equipment/Variation PASS

[ ] PR-19 Intercurrence PASS

[ ] Clinical restriction propagation PASS

[ ] Session remains IN_PROGRESS
```

---

# 140. Qualidade final

Executar:

```bash
npm run lint
npx tsc --build --force
npm run test
npm run test:workers

npm run gate:pr19
npm run gate:pr20

npm run workers:dry-run
git diff --check
```

Esperado:

```text
PASS
```

---

# 141. O que NÃO entra no PR-20

Não permitir scope creep para:

```text
CompleteSession

automatic session completion

Cloudflare Images

thumbnail generation

image editing

image classification
AI analysis

public CDN URLs

Payment

Package consumption

return scheduling

notifications

generic document management
```

E principalmente:

```text
R2 bucket public
```

não deve aparecer como atalho.

---

# 142. Relatório pós-implementação obrigatório

Eu pediria ao Codex um relatório assim:

```text
PR-20 — Session Photos + Cloudflare R2 Storage Foundation

Baseline
PR19 gate:

Photo Domain
purposes:
statuses:
Session ownership:
Intercurrence ownership:

R2
binding:
private access:
adapter:
streaming upload:
streaming read:

Object Key
strategy:
PII:
collision protection:

Validation
content types:
size:
content validation:

Persistence
migration:
metadata:
indexes:

Upload
PENDING:
R2 PUT:
AVAILABLE:
Audit:
idempotency:

Failure
R2 failure:
D1 finalize failure:
reconciliation:
orphan protection:

Read
authorization:
streaming:
headers:
metadata exposure:

Intercurrence Photo
link:
cross-session:
resolved intercurrence:

Photo Requirement
not required:
missing:
satisfied:

Tenant Isolation
upload:
list:
read:

Free Tier
R2 PUT per upload:
R2 LIST:
R2 HEAD:
D1 metadata reads:
thumbnails:

Regression
PR16:
PR17:
PR18:
PR19:

Quality
unit:
workers:
R2 workerd:
lint:
typecheck:
dry-runs:
PR20 gate:

Remaining blockers:

Next PR:
```

---

# Próximo PR depois do PR-20

Se `gate:pr20` passar, então finalmente teremos todos os principais ingredientes técnicos necessários para fechar uma sessão:

```text
Session IN_PROGRESS
    │
    ├── Technical Form Snapshot
    ├── Required Technical Values
    ├── Power
    ├── Equipment Usage
    ├── Variation Alerts
    ├── Intercurrences
    └── Photos / R2
```

O próximo PR deverá ser:

# PR-21 — CompleteSession Authoritative Flow + Completion Eligibility

Esse PR deverá finalmente montar uma policy agregada:

```text
EvaluateSessionCompletionEligibility
```

avaliando, conforme as regras aplicáveis:

```text
Session IN_PROGRESS?

required technical fields complete?

required equipment present?

required photos AVAILABLE?

open/intercurrence conditions?

required technical data valid?

professional authorized?

idempotency?

completion not already performed?
```

e somente então:

```text
Session
IN_PROGRESS
    ↓
COMPLETED

Clinical outbox
SessionCompleted
    ↓
Operations
Appointment
IN_PROGRESS
    ↓
COMPLETED
```

com a mesma consistência eventual e reconciliação já consolidadas nos PRs 13, 14 e 16.

Portanto, **o próximo PR correto é o PR-20 — Session Photos + Cloudflare R2 Storage Foundation**. O ponto mais importante é não tratá-lo apenas como “upload de imagens”: ele deve construir uma fronteira privada de armazenamento, com R2 para bytes, D1 para metadata, streaming para não pressionar a memória do Worker, autorização clínica, idempotência e uma estratégia explícita de recuperação da inevitável não-atomicidade entre D1 e R2.
