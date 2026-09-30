create table if not exists public.public_stock_summary (
  source text not null,
  item_id text not null,
  stock_code text not null default '',
  stock_group text not null default '',
  category text not null default '',
  material_name text not null default '',
  variant text not null default '',
  unit text not null default '',
  on_hand numeric not null default 0,
  image_url text not null default ''
);

alter table public.public_stock_summary enable row level security;

drop policy if exists "Public stock summary can be read" on public.public_stock_summary;
create policy "Public stock summary can be read"
  on public.public_stock_summary
  for select to anon, authenticated
  using (true);

grant select on public.public_stock_summary to anon, authenticated;
