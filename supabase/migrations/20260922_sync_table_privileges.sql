-- Ortak panel eşitlemesi için temel tablo izinleri.
-- Satır düzeyi kurallar (RLS) hangi aktif kullanıcının hangi işlemi
-- yapabileceğini ayrıca denetlemeye devam eder.
grant select, insert, update on table public.app_state to authenticated;

-- Genel stok özeti, app_state üzerinden oluşan salt-okunur bir görünümüdür.
-- Bu nedenle ayrıca yazılmaz; anonim ziyaretçiler yalnızca okuyabilir.
grant select on table public.public_stock_summary to anon, authenticated;
