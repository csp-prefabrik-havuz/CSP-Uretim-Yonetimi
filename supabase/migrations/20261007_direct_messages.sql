-- Kullanıcılar arası mesajlar yalnızca Edge Function üzerinden okunur ve yazılır.
-- Tarayıcı rolüne doğrudan tablo yetkisi verilmez; işlev hem alıcıyı hem de
-- göndereni doğrulayarak her kullanıcının yalnızca kendi mesajlarına erişmesini sağlar.
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint direct_messages_sender_recipient_different check (sender_id <> recipient_id),
  constraint direct_messages_subject_length check (char_length(subject) <= 120),
  constraint direct_messages_body_length check (char_length(body) between 1 and 2000)
);

create index if not exists direct_messages_recipient_created_idx
  on public.direct_messages (recipient_id, created_at desc);
create index if not exists direct_messages_sender_created_idx
  on public.direct_messages (sender_id, created_at desc);

alter table public.direct_messages enable row level security;
revoke all on table public.direct_messages from anon, authenticated;
