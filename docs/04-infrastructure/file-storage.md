# File Storage

Para binários de produção, o fluxo é: intenção → autorização → transferência direta para R2. D1 guarda `fileId`, `tenantId`, `objectKey`, `mimeType`, `size`, `hash`, `createdAt` e `createdBy`; nunca o binário.

