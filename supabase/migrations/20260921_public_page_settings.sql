-- Yönetici tarafından belirlenen, şifresiz görüntülenebilecek panel sayfaları.
create table if not exists public.public_page_settings (
  page_id text primary key check (page_id in ('stock-summary')),
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.public_page_settings enable row level security;

drop policy if exists "Public pages can be read" on public.public_page_settings;
create policy "Public pages can be read"
on public.public_page_settings
for select
to anon, authenticated
using (true);

drop policy if exists "Admins manage public pages" on public.public_page_settings;
create policy "Admins manage public pages"
on public.public_page_settings
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

grant select on public.public_page_settings to anon, authenticated;
grant insert, update, delete on public.public_page_settings to authenticated;

insert into public.public_page_settings (page_id, is_public)
values ('stock-summary', true)
on conflict (page_id) do nothing;
