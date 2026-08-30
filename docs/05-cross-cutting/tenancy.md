# Tenancy

Todo dado operacional possui `tenantId`. Repositories recebem `findById(tenantId, id)`, nunca apenas `findById(id)`. Tenant vem do contexto autenticado/autorizado, não de body, query ou header arbitrário. Queries, cache, idempotência e auditoria devem preservar o tenant.

