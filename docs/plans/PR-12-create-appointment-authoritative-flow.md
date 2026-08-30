# PR-12 — CreateAppointment Authoritative Flow

## Objective

Disponibilizar `POST /tenants/:tenantId/appointments` como única entrada autoritativa para criar Appointment, sem aceitar duração, preço, desconto, sinal ou status calculados pelo caller.

## Flow

```text
HTTP bridge
→ authentication / tenant membership / permission
→ validation / Idempotency-Key
→ CheckAppointmentEligibility
→ Billing RPC / CommercialTerms
→ Appointment.create
→ D1UnitOfWork: reservation + appointment + audit + outbox + idempotency
→ 201 Created
```

RPCs e leituras ocorrem antes da unidade de escrita local. A reserva SQL tenant/profissional/intervalo permanece a autoridade final contra corrida.

## Contract

Request body:

```json
{
  "customerId": "...",
  "serviceId": "...",
  "professionalId": "...",
  "startsAt": "...",
  "origin": "RECEPTION"
}
```

`Idempotency-Key` é obrigatório no header. O tenant vem do path e o actor vem da autenticação. A duração é derivada do Service; os valores comerciais vêm do Billing.

## Persistence

Migration `0006_create_appointment_authoritative_snapshot.sql` adiciona `deposit_required`, perfil comercial, identidade/snapshot da DiscountPolicy e configuração do depósito. O Appointment mantém valores inteiros e status inicial `AWAITING_DEPOSIT` ou `AWAITING_CONFIRMATION`.

Audit usa somente IDs, actor, request/correlation e status. Outbox grava `AppointmentCreated` como `PENDING`, sem consumer neste PR.

## Idempotency and concurrency

O hash inclui tenant, customer, service, professional, início e origem. Mesmo tenant/operação/chave/hash retorna o mesmo response; hash diferente retorna `IDEMPOTENCY_KEY_CONFLICT`. A reserva exige `changes=1`; `changes=0` retorna `APPOINTMENT_TIME_CONFLICT` e impede efeitos parciais.

## Tests and gates

- `test/workers/create-appointment.spec.ts`: fluxo HTTP vertical, snapshots/reliability, replay, hash conflict, validation e time conflict.
- `test/workers/clinical-persistence.spec.ts`: Clinical físico e AppointmentEligibility.
- `npm run gate:physical-safety` mantém as regressões anteriores.
- `npm run gate:create-appointment` fecha readiness e Clinical.
- `npm run gate:pr12` executa a qualificação completa do PR-12.

## Out of scope

Não entram confirmação/expiração de depósito, pagamentos, cancelamento, reagendamento, consumers, filas, cron, KV, R2 ou qualquer fluxo posterior ao Appointment criado.
