begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create schema if not exists app;
create schema if not exists identity;
create schema if not exists audit;

create or replace function app.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

create or replace function app.current_actor_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.actor_id', true), '')::uuid
$$;

commit;
