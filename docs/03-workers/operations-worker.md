# Operations Worker

Ownership: Customer, Professional, Service, Appointment, Availability, Confirmation, Check-in e estado operacional do tenant. Use cases incluem criar cliente, agendar, reagendar, cancelar, confirmar presença, registrar chegada e no-show. Avaliar tenancy, autorização, idempotência, audit, outbox e conflitos de agenda.

O RPC demonstrativo de leitura exige `SELECTOR_DEMO_TENANT_IDS`, limitado a tenants exclusivamente sintéticos. Configuração ausente/inválida fecha em 503; IDs reais fora da lista são negados. Contatos e snapshots financeiros não são expostos nesse RPC. [Configuração, qualificação e limites](../selector-demo-safety.md).
