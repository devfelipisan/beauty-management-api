# State Machines

Não existe máquina global. Cada agregado possui sua própria máquina quando houver regra normativa suficiente: `AppointmentStateMachine`, `DepositStateMachine`, `SessionStateMachine`, `PaymentStateMachine`, `PackageStateMachine` e `LicenseStateMachine`. Não criar transições apenas porque um enum contém um estado.

