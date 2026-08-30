# CreateAppointment Readiness

## PR-11.9 — Clinical Persistence Qualification

O gate físico de Clinical foi fechado sem criar `POST /appointments` ou qualquer fluxo de persistência de Appointment.

| Gate | Resultado |
| --- | ---: |
| Worker runtime, HTTP bridge e autenticação existentes | PASS |
| D1 e migrations 0001–0005 | PASS |
| Tenant/context isolation | PASS |
| Scheduling concurrency | PASS |
| Reliability e idempotência | PASS |
| Clinical RPC real | PASS |
| Clinical D1 APTO | PASS |
| Clinical D1 APTO_COM_RESTRICOES | PASS |
| Clinical D1 NAO_APTO | PASS |
| Assessment validity e latest selection | PASS |
| Assessment cross-tenant/service/customer | PASS |
| `requiresAssessment=false` short-circuit | PASS |
| AppointmentEligibility fully eligible | PASS |
| Billing RPC e CommercialTerms READY | PASS |
| Discount e Deposit Policy | PASS |

### Evidências executáveis

- `npm run gate:physical-safety` — PASS.
- `npm run test:clinical-persistence` — PASS.
- `npm run gate:create-appointment` — PASS.
- `npm run workers:dry-run` — Operations, Clinical e Billing PASS.
- A suíte física usa D1 do harness, o Service Binding `CLINICAL_SERVICE`, o Clinical Worker e `D1AssessmentRepository` reais.

### Decisão

```text
CreateAppointmentReady = PASS
POST /appointments = NOT IMPLEMENTED
```

O próximo trabalho autorizado pela documentação é o PR-12 — CreateAppointment Authoritative Flow.
