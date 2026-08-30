# Outbox

Mutation de negócio, audit e outbox devem ser confirmados na mesma fronteira transacional. O Async Worker consome eventos com idempotência, retry seguro e observabilidade.

