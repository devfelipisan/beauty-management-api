# PR-20 — Session Photos + Cloudflare R2 Storage Foundation

Implementação da fundação de evidências fotográficas clínicas no Clinical Worker.

- D1 é autoridade para metadata, tenant, owner, purpose e lifecycle.
- R2 privado armazena somente os bytes, por meio de `SESSION_MEDIA`.
- Upload usa intent `PENDING_UPLOAD`, uma PUT em streaming e finalização `AVAILABLE`.
- Falhas deixam estado recuperável; reconciliação é explícita e limitada.
- Não há hard delete, URL pública, multipart, thumbnail, outbox ou conclusão de sessão.

