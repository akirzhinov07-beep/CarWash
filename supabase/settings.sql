-- Раздел «Настройки» (запись задним числом, рабочие часы, шаг времени). Выполнить ОДИН раз в Supabase -> SQL Editor.
-- Данные остальных таблиц НЕ затрагиваются.
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table settings enable row level security;
revoke all on settings from anon, authenticated;
grant select, insert, update, delete on settings to authenticated;
drop policy if exists settings_read on settings;
create policy settings_read on settings for select to authenticated using (is_user());
drop policy if exists settings_write on settings;
create policy settings_write on settings for all to authenticated using (is_admin()) with check (is_admin());
