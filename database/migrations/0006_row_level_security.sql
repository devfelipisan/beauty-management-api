begin;

alter table app.tenant_brandings enable row level security;
alter table app.professionals enable row level security;
alter table app.services enable row level security;
alter table app.professional_services enable row level security;
alter table app.customers enable row level security;
alter table app.appointments enable row level security;
alter table app.deposits enable row level security;
alter table app.sessions enable row level security;
alter table app.payments enable row level security;
alter table app.outbox_events enable row level security;
alter table app.idempotency_keys enable row level security;
alter table audit.events enable row level security;

alter table app.tenant_brandings force row level security;
alter table app.professionals force row level security;
alter table app.services force row level security;
alter table app.professional_services force row level security;
alter table app.customers force row level security;
alter table app.appointments force row level security;
alter table app.deposits force row level security;
alter table app.sessions force row level security;
alter table app.payments force row level security;
alter table app.outbox_events force row level security;
alter table app.idempotency_keys force row level security;
alter table audit.events force row level security;

create policy tenant_brandings_tenant_policy on app.tenant_brandings
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
create policy professionals_tenant_policy on app.professionals
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
create policy services_tenant_policy on app.services
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
create policy professional_services_tenant_policy on app.professional_services
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
create policy customers_tenant_policy on app.customers
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
create policy appointments_tenant_policy on app.appointments
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
create policy deposits_tenant_policy on app.deposits
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
create policy sessions_tenant_policy on app.sessions
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
create policy payments_tenant_policy on app.payments
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
create policy outbox_events_tenant_policy on app.outbox_events
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
create policy idempotency_keys_tenant_policy on app.idempotency_keys
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
create policy audit_events_tenant_policy on audit.events
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

commit;
