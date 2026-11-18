-- Account status is readable by its owner but only service-side admins may change it.
alter table public.cadence_profiles
  add column if not exists status text not null default 'active',
  add column if not exists ban_reason text,
  add column if not exists banned_until timestamptz,
  add column if not exists status_updated_at timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cadence_profiles_status_check') then
    alter table public.cadence_profiles add constraint cadence_profiles_status_check
      check (status in ('active', 'banned', 'deleting'));
  end if;
end $$;

alter table public.cadence_profiles drop constraint if exists cadence_profiles_ban_fields_check;
alter table public.cadence_profiles add constraint cadence_profiles_ban_fields_check
  check (status = 'banned' or (ban_reason is null and banned_until is null));

-- A profile may be read by its owner in every status so Cadence can show the
-- ban/deletion explanation. Browser users can only edit their profile fields.
revoke all on table public.cadence_profiles from public, anon, authenticated;
grant select on table public.cadence_profiles to authenticated;
grant insert (user_id, display_name, avatar_path) on public.cadence_profiles to authenticated;
grant update (display_name, avatar_path, updated_at) on public.cadence_profiles to authenticated;

-- Read only the caller's own active flag; SECURITY DEFINER avoids policy recursion.
create or replace function public.cadence_account_is_active()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cadence_profiles p
    where p.user_id = (select auth.uid()) and (
      p.status = 'active' or (p.status = 'banned' and p.banned_until is not null and p.banned_until <= now())
    )
  );
$$;
revoke all on function public.cadence_account_is_active() from public, anon;
grant execute on function public.cadence_account_is_active() to authenticated;

drop policy if exists "Users can create their own Cadence profile" on public.cadence_profiles;
create policy "Active users can create their own Cadence profile"
  on public.cadence_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'active');

drop policy if exists "Users can update their own Cadence profile" on public.cadence_profiles;
create policy "Active users can update their own Cadence profile"
  on public.cadence_profiles for update to authenticated
  using ((select auth.uid()) = user_id and public.cadence_account_is_active())
  with check ((select auth.uid()) = user_id and public.cadence_account_is_active());

drop policy if exists "Users can delete their own Cadence profile" on public.cadence_profiles;

-- Every account-scoped study operation checks the authoritative profile row.
drop policy if exists "Users can read their own Cadence data" on public.cadence_user_data;
create policy "Active users can read their own Cadence data"
  on public.cadence_user_data for select to authenticated
  using ((select auth.uid()) = user_id and public.cadence_account_is_active());
drop policy if exists "Users can create their own Cadence data" on public.cadence_user_data;
create policy "Active users can create their own Cadence data"
  on public.cadence_user_data for insert to authenticated
  with check ((select auth.uid()) = user_id and public.cadence_account_is_active());
drop policy if exists "Users can update their own Cadence data" on public.cadence_user_data;
create policy "Active users can update their own Cadence data"
  on public.cadence_user_data for update to authenticated
  using ((select auth.uid()) = user_id and public.cadence_account_is_active())
  with check ((select auth.uid()) = user_id and public.cadence_account_is_active());
drop policy if exists "Users can delete their own Cadence data" on public.cadence_user_data;
create policy "Active users can delete their own Cadence data"
  on public.cadence_user_data for delete to authenticated
  using ((select auth.uid()) = user_id and public.cadence_account_is_active());

drop policy if exists "Users can read their own Cadence avatar" on storage.objects;
create policy "Active users can read their own Cadence avatar" on storage.objects for select to authenticated
  using (bucket_id = 'cadence-avatars' and name = (select auth.uid())::text || '/avatar'
    and public.cadence_account_is_active());
drop policy if exists "Users can upload their own Cadence avatar" on storage.objects;
create policy "Active users can upload their own Cadence avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'cadence-avatars' and name = (select auth.uid())::text || '/avatar'
    and public.cadence_account_is_active());
drop policy if exists "Users can replace their own Cadence avatar" on storage.objects;
create policy "Active users can replace their own Cadence avatar" on storage.objects for update to authenticated
  using (bucket_id = 'cadence-avatars' and name = (select auth.uid())::text || '/avatar'
    and public.cadence_account_is_active())
  with check (bucket_id = 'cadence-avatars' and name = (select auth.uid())::text || '/avatar'
    and public.cadence_account_is_active());
drop policy if exists "Users can remove their own Cadence avatar" on storage.objects;
create policy "Active users can remove their own Cadence avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'cadence-avatars' and name = (select auth.uid())::text || '/avatar'
    and public.cadence_account_is_active());

grant select, insert, update, delete on public.cadence_profiles to service_role;

