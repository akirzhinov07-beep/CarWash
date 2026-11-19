-- Раздел «Расходники». Выполнить ОДИН раз в Supabase -> SQL Editor.
-- Данные остальных таблиц НЕ затрагиваются.
create table if not exists supplies (
  id bigint generated always as identity primary key,
  name text not null,
  qty numeric not null check (qty > 0),
  unit_price numeric not null check (unit_price >= 0),
  bought_at date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
alter table supplies enable row level security;
revoke all on supplies from anon, authenticated;
grant select, insert, update, delete on supplies to authenticated;
grant usage, select on all sequences in schema public to authenticated;
drop policy if exists supplies_adm on supplies;
create policy supplies_adm on supplies for all to authenticated using (is_admin()) with check (is_admin());
