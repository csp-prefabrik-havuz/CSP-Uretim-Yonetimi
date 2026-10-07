-- Mesajlaşma, Edge Function içindeki kullanıcı oturumu ile çalışır. Bu
-- yardımcı işlevler yalnızca etkin kullanıcıların görülebilmesini sağlar.
create or replace function public.is_current_panel_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and is_active = true and role = 'admin'
  );
$$;

create or replace function public.is_active_panel_user(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_id and is_active = true
  );
$$;

create or replace function public.message_recipients()
returns table (id uuid, name text, department text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
    coalesce(nullif(trim(p.display_name), ''), p.username) as name,
    coalesce(p.department, '') as department
  from public.profiles p
  where p.is_active = true and p.id <> auth.uid()
  order by coalesce(nullif(trim(p.display_name), ''), p.username);
$$;

revoke all on function public.is_current_panel_admin() from public;
revoke all on function public.is_active_panel_user(uuid) from public;
revoke all on function public.message_recipients() from public;
grant execute on function public.is_current_panel_admin() to authenticated;
grant execute on function public.is_active_panel_user(uuid) to authenticated;
grant execute on function public.message_recipients() to authenticated;

grant select, insert, update, delete on table public.direct_messages to authenticated;

drop policy if exists direct_messages_read on public.direct_messages;
drop policy if exists direct_messages_send on public.direct_messages;
drop policy if exists direct_messages_mark_read on public.direct_messages;
drop policy if exists direct_messages_remove on public.direct_messages;

create policy direct_messages_read on public.direct_messages
  for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid() or public.is_current_panel_admin());

create policy direct_messages_send on public.direct_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and recipient_id <> auth.uid()
    and public.is_active_panel_user(recipient_id)
  );

create policy direct_messages_mark_read on public.direct_messages
  for update to authenticated
  using (recipient_id = auth.uid() or public.is_current_panel_admin())
  with check (recipient_id = auth.uid() or public.is_current_panel_admin());

create policy direct_messages_remove on public.direct_messages
  for delete to authenticated
  using (sender_id = auth.uid() or public.is_current_panel_admin());
