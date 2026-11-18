-- Keep the SECURITY DEFINER status predicate out of exposed API schemas.
drop policy if exists "Active users can update their own Cadence profile" on public.cadence_profiles;
drop policy if exists "Active users can read their own Cadence data" on public.cadence_user_data;
drop policy if exists "Active users can create their own Cadence data" on public.cadence_user_data;
drop policy if exists "Active users can update their own Cadence data" on public.cadence_user_data;
drop policy if exists "Active users can delete their own Cadence data" on public.cadence_user_data;
drop policy if exists "Active users can read their own Cadence avatar" on storage.objects;
drop policy if exists "Active users can upload their own Cadence avatar" on storage.objects;
drop policy if exists "Active users can replace their own Cadence avatar" on storage.objects;
drop policy if exists "Active users can remove their own Cadence avatar" on storage.objects;
drop function if exists public.cadence_account_is_active();

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create or replace function private.cadence_account_is_active()
returns boolean language sql stable security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.cadence_profiles p
    where p.user_id = (select auth.uid()) and (
      p.status = 'active' or (p.status = 'banned' and p.banned_until is not null and p.banned_until <= now())
    )
  );
$function$;
revoke all on function private.cadence_account_is_active() from public, anon;
grant execute on function private.cadence_account_is_active() to authenticated;

create policy "Active users can update their own Cadence profile"
  on public.cadence_profiles for update to authenticated
  using ((select auth.uid()) = user_id and private.cadence_account_is_active())
  with check ((select auth.uid()) = user_id and private.cadence_account_is_active());

create policy "Active users can read their own Cadence data"
  on public.cadence_user_data for select to authenticated
  using ((select auth.uid()) = user_id and private.cadence_account_is_active());
create policy "Active users can create their own Cadence data"
  on public.cadence_user_data for insert to authenticated
  with check ((select auth.uid()) = user_id and private.cadence_account_is_active());
create policy "Active users can update their own Cadence data"
  on public.cadence_user_data for update to authenticated
  using ((select auth.uid()) = user_id and private.cadence_account_is_active())
  with check ((select auth.uid()) = user_id and private.cadence_account_is_active());
create policy "Active users can delete their own Cadence data"
  on public.cadence_user_data for delete to authenticated
  using ((select auth.uid()) = user_id and private.cadence_account_is_active());

create policy "Active users can read their own Cadence avatar" on storage.objects for select to authenticated
  using (bucket_id = 'cadence-avatars' and name = (select auth.uid())::text || '/avatar'
    and private.cadence_account_is_active());
create policy "Active users can upload their own Cadence avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'cadence-avatars' and name = (select auth.uid())::text || '/avatar'
    and private.cadence_account_is_active());
create policy "Active users can replace their own Cadence avatar" on storage.objects for update to authenticated
  using (bucket_id = 'cadence-avatars' and name = (select auth.uid())::text || '/avatar'
    and private.cadence_account_is_active())
  with check (bucket_id = 'cadence-avatars' and name = (select auth.uid())::text || '/avatar'
    and private.cadence_account_is_active());
create policy "Active users can remove their own Cadence avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'cadence-avatars' and name = (select auth.uid())::text || '/avatar'
    and private.cadence_account_is_active());

