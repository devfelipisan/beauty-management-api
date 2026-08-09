begin;

create table if not exists audit.events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references app.tenants(id) on delete restrict,
  actor_id uuid,
  actor_type text not null check (actor_type in ('user','system','worker','job')),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  request_id text not null,
  correlation_id text not null,
  changes jsonb,
  metadata jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_events_tenant_occurred_idx on audit.events (tenant_id, occurred_at desc);
create index if not exists audit_events_correlation_idx on audit.events (correlation_id);
create index if not exists audit_events_resource_idx on audit.events (tenant_id, resource_type, resource_id);

create or replace function audit.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit.events is append-only' using errcode = '55000';
end;
$$;

drop trigger if exists audit_events_append_only_update on audit.events;
create trigger audit_events_append_only_update
before update or delete on audit.events
for each row execute function audit.reject_mutation();

create table if not exists app.outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references app.tenants(id) on delete restrict,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  correlation_id text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','published','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  last_error text
);

create index if not exists outbox_pending_idx on app.outbox_events (status, created_at) where status in ('pending','failed');
create index if not exists outbox_tenant_idx on app.outbox_events (tenant_id, created_at desc);

create table if not exists app.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  idempotency_key text not null,
  operation text not null,
  request_hash text not null,
  status text not null check (status in ('processing','completed','failed')),
  response jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, operation, idempotency_key)
);

create index if not exists idempotency_expiry_idx on app.idempotency_keys (expires_at);

commit;
