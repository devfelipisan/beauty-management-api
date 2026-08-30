# Contratos de estado de Operations

Este arquivo documenta os contratos previstos. Nesta fundacao nao existem
entidades, enums TypeScript, repositories, controllers de negocio ou migrations.

## Tenant

`ACTIVE` (ativo), `INACTIVE` (inativo), `SUSPENDED` (suspenso), `CANCELED`
(cancelado).

## Professional

`ACTIVE` (ativo), `INACTIVE` (inativo).

## Service

`ACTIVE` (ativo), `INACTIVE` (inativo).

## Customer

O status operacional do cliente e separado do perfil de relacionamento:

- CustomerStatus: `ACTIVE` (ativo), `INACTIVE` (inativo).
- RelationshipProfile: `NEW` (novo), `OLD` (antigo), `REGULAR` (recorrente),
  `LOYAL` (fiel), `INACTIVE` (inativo), `RECURRING_ABSENCES`
  (faltas recorrentes).

As transicoes e regras de negocio serao definidas no PR-06, sem inventar
comportamento nesta camada.
