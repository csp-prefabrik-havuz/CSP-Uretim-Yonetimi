-- Yalnızca aktif yönetici oturumları kullanıcı yönetimi amacıyla profil kayıtlarını
-- listeleyebilir ve güncelleyebilir. Şifreler hiçbir zaman profiles tablosunda tutulmaz.
create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active is true
  );
$$;

revoke all on function public.is_active_admin() from public;
grant execute on function public.is_active_admin() to authenticated;
grant insert, update on public.profiles to authenticated;

drop policy if exists profiles_select_active_admin on public.profiles;
create policy profiles_select_active_admin
on public.profiles
for select
to authenticated
using (public.is_active_admin());

drop policy if exists profiles_insert_active_admin on public.profiles;
create policy profiles_insert_active_admin
on public.profiles
for insert
to authenticated
with check (public.is_active_admin());

drop policy if exists profiles_update_active_admin on public.profiles;
create policy profiles_update_active_admin
on public.profiles
for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());
