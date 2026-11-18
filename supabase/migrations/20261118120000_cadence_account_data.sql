create table if not exists public.cadence_user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  imported_guest_fingerprints text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.cadence_user_data enable row level security;

revoke all on table public.cadence_user_data from public, anon, authenticated;
grant select, insert, update, delete on table public.cadence_user_data to authenticated;

create policy "Users can read their own Cadence data"
  on public.cadence_user_data for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own Cadence data"
  on public.cadence_user_data for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own Cadence data"
  on public.cadence_user_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own Cadence data"
  on public.cadence_user_data for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.save_cadence_user_data(
  p_data jsonb,
  p_expected_revision bigint,
  p_import_fingerprint text default null
)
returns table (
  data jsonb,
  revision bigint,
  imported_guest_fingerprints text[],
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  saved_row public.cadence_user_data;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Cadence data must be a JSON object' using errcode = '22023';
  end if;
  if p_expected_revision < 0 then
    raise exception 'Expected revision cannot be negative' using errcode = '22023';
  end if;

  insert into public.cadence_user_data as existing (
    user_id, data, revision, imported_guest_fingerprints, updated_at
  ) values (
    (select auth.uid()),
    p_data,
    1,
    case when p_import_fingerprint is null then '{}'::text[] else array[p_import_fingerprint] end,
    now()
  )
  on conflict (user_id) do update set
    data = excluded.data,
    revision = existing.revision + 1,
    imported_guest_fingerprints = case
      when p_import_fingerprint is null then existing.imported_guest_fingerprints
      when p_import_fingerprint = any(existing.imported_guest_fingerprints) then existing.imported_guest_fingerprints
      else array_append(existing.imported_guest_fingerprints, p_import_fingerprint)
    end,
    updated_at = now()
  where existing.revision = p_expected_revision
  returning existing.* into saved_row;

  if not found then
    raise exception 'CADENCE_REVISION_CONFLICT';
  end if;

  return query select saved_row.data, saved_row.revision,
    saved_row.imported_guest_fingerprints, saved_row.updated_at;
end;
$function$;

revoke all on function public.save_cadence_user_data(jsonb, bigint, text) from public, anon, authenticated;
grant execute on function public.save_cadence_user_data(jsonb, bigint, text) to authenticated;

do $publication$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cadence_user_data'
  ) then
    alter publication supabase_realtime add table public.cadence_user_data;
  end if;
end;
$publication$;
