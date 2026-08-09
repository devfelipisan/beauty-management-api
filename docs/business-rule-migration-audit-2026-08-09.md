# Auditoria de migração das regras negociais — 2026-08-09

## Objetivo

Revalidar a separação entre `beauty-management-web` e `beauty-management-api` diretamente sobre a `main`, garantindo que o Web seja apenas Frontend/BFF e que a API seja a autoridade negocial.

## Contrato arquitetural

```text
beauty-management-web
  Presentation
    -> /api/bff/<path>
       -> BUSINESS_API_BASE_URL/<path>

beauty-management-api
  /v1/*
    -> HTTP adapter
    -> BusinessApi
    -> Application / Domain / FSM
    -> UnitOfWork / repositories
    -> persistence
```

`BUSINESS_API_BASE_URL` contém somente o host. O path versionado permanece no contrato do cliente:

```env
BUSINESS_API_BASE_URL=https://<host>
```

Exemplo:

```text
Browser:  /api/bff/v1/customers
Backend:  https://<host>/v1/customers
```

## Regras já autoritativas na API

- tenants: criação;
- profissionais: listagem/criação;
- serviços: listagem/criação;
- clientes: listagem/criação e prevenção de duplicidade;
- agendamentos: criação/listagem, conflito de agenda, sinal e FSM;
- sinal: confirmação transacional;
- sessões: início e conclusão;
- pagamentos: listagem por tenant e registro transacional;
- leads públicos: criação, deduplicação e ciclo de estado;
- branding do tenant;
- auditoria, outbox e idempotência;
- autorização tenant/platform;
- adapters Memory e PostgreSQL/UnitOfWork.

## Inconsistências HTTP encontradas e corrigidas no Web

O Web ainda usava paths da antiga API embarcada. O cliente foi alinhado ao contrato atual da API:

| Operação | Path antigo no Web | Path autoritativo |
|---|---|---|
| criação de tenant | `/v1/platform/tenants` | `/v1/tenants` |
| auditoria | `/v1/audit-events` | `/v1/audit` |
| branding | `/v1/tenant/branding` | `/v1/tenant-branding` |
| confirmar sinal | `/v1/appointments/:id/deposit/confirm` | `/v1/deposits/confirm` |
| iniciar sessão | `/v1/appointments/:id/sessions` | `/v1/sessions/start` |
| concluir sessão | `/v1/sessions/:id/complete` | `/v1/sessions/complete` |
| atualizar lead | `/v1/leads/:id/actions` | `PATCH /v1/leads/:id/status` |
| catálogo público | `/v1/public/sites/:slug/catalog` | `/v1/public/:slug/catalog` |
| agendamento público | `/v1/public/sites/:slug/appointments` | `/v1/public/:slug/appointments` |
| lead público | `/v1/public/sites/:slug/leads` | `/v1/public/:slug/leads` |

O `ApiClient` do Web passou a suportar `PATCH` e a interpretar o envelope de erro `{ error: { code, message, details } }` emitido pela API.

## Lacunas ainda expostas pelo contrato do Web

A auditoria do `ApplicationGateway` encontrou operações que o frontend já expõe, mas ainda não possuem implementação autoritativa equivalente na Business API:

- equipamentos: listar/criar;
- usuários: listar/criar/atualizar;
- pacotes: listar/criar;
- configuração de perfil de relacionamento;
- políticas e aprovações de desconto;
- configurações do tenant;
- landing page: consultar/salvar draft/publicar/ocultar.

O modelo legado do Web também contém `Assessment`, `TechnicalRecord`, `PackageMovement` e `FollowUp`. Esses conceitos devem ser migrados quando seus fluxos HTTP/UI forem ativados; não devem receber novas regras dentro do Web.

## Próximos slices

1. Migrar Equipments e Packages como bounded contexts com ports tenant-aware.
2. Migrar Tenant Settings e Landing Page.
3. Migrar Users/RBAC administrativo sem duplicar a infraestrutura de autenticação.
4. Migrar Commercial Policy (perfil, desconto e aprovação) preservando cálculo/autoridade no backend.
5. Migrar Assessment, TechnicalRecord, PackageMovement e FollowUp quando os contratos de jornada forem ativados.
6. Após cada slice, remover o código equivalente e seus testes backend-only de `beauty-management-web`.

## Regra de conclusão

A migração só está concluída quando:

- nenhum componente de apresentação/BFF importa Domain/Application/Persistence;
- nenhum backend executável existe no Next.js;
- toda operação exposta pelo `ApplicationGateway` possui endpoint equivalente em `beauty-management-api`;
- os paths do Web apontam exclusivamente para `BUSINESS_API_BASE_URL + /v1/...`;
- regras transacionais permanecem dentro de `UnitOfWork` no backend.
