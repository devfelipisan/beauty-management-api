# PR-05 — Operations Worker Foundation

## Escopo

Convergir a arquitetura do Operations Worker, remover o scaffold Hello World,
expor somente o health check, reutilizar as fundacoes compartilhadas e registrar
a decisao D1. Nao inclui dominio, CRUD, repositories, migrations funcionais ou
bindings remotos.

## Validacao

- `GET /health` retorna status, service e version.
- health nao depende de banco, tenant ou autenticacao.
- build isolado de `operations-worker` e da aplicacao existente.
- limites de dependencia permanecem testaveis.

## Proximo passo

PR-06 deve implementar a fundacao de dominio de Operations, iniciando por
Tenant, Professional, Service e Customer, conforme os contratos documentados.
