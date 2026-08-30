# Clinical media storage

O Clinical Worker usa o binding privado `SESSION_MEDIA` para armazenar bytes de fotos clínicas. A tabela `clinical_photo_attachments` no D1 é a autoridade de tenant, sessão, intercorrência, purpose, lifecycle e autorização; nenhuma URL pública ou chave R2 é devolvida à aplicação.

O upload recebe body bruto em streaming. O fluxo é `PENDING_UPLOAD` em D1 → PUT no R2 → `AVAILABLE` em D1. D1 e R2 não têm transação distribuída: falhas deixam `PENDING_UPLOAD`/`FAILED` e podem ser tratadas por `reconcilePhotoAttachment`, que usa HEAD apenas nessa operação explícita.

São aceitos JPEG, PNG e WebP, com limite operacional `MAX_CLINICAL_PHOTO_BYTES` e validação limitada de magic bytes. Leituras são autenticadas, autorizadas e retornam stream privado (`private, no-store`). Listagens usam apenas metadata D1; não há `bucket.list()`, thumbnails, Cloudflare Images ou hard delete neste PR.
