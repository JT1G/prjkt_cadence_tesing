-- Per-account Cadence profile information and private avatar storage.
create table if not exists public.cadence_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null default ''
    check (display_name = btrim(display_name) and char_length(display_name) <= 60),
  avatar_path text,
  updated_at timestamptz not null default now(),
  constraint cadence_profiles_avatar_path_owner check (
    avatar_path is null or avatar_path = user_id::text || '/avatar'
  )
);

alter table public.cadence_profiles enable row level security;

revoke all on table public.cadence_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.cadence_profiles to authenticated;

create policy "Users can read their own Cadence profile"
  on public.cadence_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own Cadence profile"
  on public.cadence_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own Cadence profile"
  on public.cadence_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own Cadence profile"
  on public.cadence_profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cadence-avatars',
  'cadence-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can read their own Cadence avatar"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'cadence-avatars'
    and name = (select auth.uid())::text || '/avatar'
  );

create policy "Users can upload their own Cadence avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'cadence-avatars'
    and name = (select auth.uid())::text || '/avatar'
  );

create policy "Users can replace their own Cadence avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'cadence-avatars'
    and name = (select auth.uid())::text || '/avatar'
  )
  with check (
    bucket_id = 'cadence-avatars'
    and name = (select auth.uid())::text || '/avatar'
  );

create policy "Users can remove their own Cadence avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'cadence-avatars'
    and name = (select auth.uid())::text || '/avatar'
  );

do $publication$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cadence_profiles'
  ) then
    alter publication supabase_realtime add table public.cadence_profiles;
  end if;
end;
$publication$;

