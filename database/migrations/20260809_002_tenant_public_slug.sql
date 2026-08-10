alter table app.tenants
	add column if not exists public_slug text;

create unique index if not exists tenants_public_slug_unique_idx
	on app.tenants (public_slug)
	where public_slug is not null;

alter table app.tenants
	drop constraint if exists tenants_public_slug_format;

alter table app.tenants
	add constraint tenants_public_slug_format
	check (
		public_slug is null
		or (
			char_length(public_slug) between 3 and 63
			and public_slug = lower(public_slug)
			and public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
		)
	);

comment on column app.tenants.public_slug is
	'Canonical first URL path segment for public and authenticated tenant routes.';
