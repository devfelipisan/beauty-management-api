# PR-23 — Packages + Customer Packages + Idempotent Session Consumption

## Objective

Implementar a fundação de PackageDefinition, CustomerPackage e PackageMovement, com consumo de exatamente uma unidade após `SessionCompleted`.

## Ownership

Billing é proprietário de pacotes e movimentos. Clinical apenas emite a referência explícita `customerPackageId` no fato de conclusão. Operations recebe somente o evento funcional `PackageUnitConsumed` para sua timeline.

## Invariants

- `ACTIVE`, validade futura e saldo positivo são necessários.
- O saldo é decrementado por CAS e nunca fica negativo.
- `UNIQUE(tenant_id, session_id, movement_type)` impede consumo da mesma sessão em pacotes diferentes ou com eventos diferentes.
- Movimento é append-only e registra saldo anterior/posterior, sessão, pacote e evento de origem.
- Sem referência explícita de pacote, `SessionCompleted` não consome pacote.

## Session integration

`customerPackageId` é opcional e congelado no Appointment/Session. A conclusão emite `PackageConsumptionRequested` apenas quando essa referência existe. Não há seleção arbitrária, criação automática, pagamento ou ledger.

## Eventual consistency

Billing confirma decremento, movimento, audit e outbox localmente. O evento `PackageUnitConsumed` atualiza Operations posteriormente; redelivery é idempotente. Não existe transação distribuída.

## Known gap

`RN-CONC-002` passa a ter package consumption qualificado como efeito eventual. Financial balance/payment continuam `NOT IMPLEMENTED`; `RN-CONC-002 FULL = NOT YET`.

## Out of scope

Payment, ledger, settlement financeiro, transferência, ajuste manual, refund, renewal, cron de expiração, reserva de unidade e consumo manual público.
