begin;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'beauty_runtime') then
    grant select, insert, update, delete on identity.professional_memberships to beauty_runtime;
  end if;
end $$;

commit;
