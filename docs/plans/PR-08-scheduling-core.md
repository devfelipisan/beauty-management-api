# PR-08 — Scheduling Core

Implementa intervalo, FSM de Appointment, política de ocupação, consulta de
disponibilidade e port de reserva transacional D1. `CreateAppointment` não é
exposto porque as pré-condições de licença, avaliação, restrições do cliente,
limites do plano e pricing/deposit ainda não estão disponíveis.

O `GET /tenants/:tenantId/professionals/:professionalId/availability` apenas
consulta uma janela derivada de `from` e `durationMinutes`; não cria reserva.
