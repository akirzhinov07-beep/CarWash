-- CarwasH: схема + роли + RLS. Выполнить целиком в Supabase -> SQL Editor.
-- ВНИМАНИЕ: старые демо-таблицы clients/staff/services/orders/bookings будут удалены.

drop table if exists orders, bookings, staff_pay, staff, services, clients, profiles cascade;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'staff' check (role in ('admin','staff'))
);

create table clients (
  id bigint generated always as identity primary key,
  name text not null, phone text not null, car text, note text,
  created_at timestamptz not null default now()
);
create table services (
  id bigint generated always as identity primary key,
  name text not null, category text not null default 'Прочее',
  price numeric not null check (price >= 0), minutes int not null default 30,
  active boolean not null default true
);
create table staff (
  id bigint generated always as identity primary key,
  name text not null, position text, phone text, active boolean not null default true
);
-- процент зарплаты виден только администратору
create table staff_pay (
  staff_id bigint primary key references staff(id) on delete cascade,
  percent numeric not null default 30 check (percent between 0 and 100)
);
create table bookings (
  id bigint generated always as identity primary key,
  client_id bigint references clients(id) on delete set null,
  client_name text not null, phone text not null, car text not null, comment text,
  services jsonb not null default '[]', total numeric not null default 0,
  staff_id bigint references staff(id) on delete set null,
  starts_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','done','cancelled')),
  pay_type text check (pay_type in ('cash','card')),
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create table orders (
  id bigint generated always as identity primary key,
  booking_id bigint references bookings(id) on delete set null,
  client_name text, phone text, car text,
  services jsonb not null default '[]', total numeric not null,
  staff_id bigint references staff(id) on delete set null,
  pay_type text not null check (pay_type in ('cash','card')),
  created_at timestamptz not null default now()
);

-- роль берётся ТОЛЬКО из таблицы profiles (не из user_metadata)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;
create or replace function public.is_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;
revoke all on function public.is_admin(), public.is_user() from public, anon;
grant execute on function public.is_admin(), public.is_user() to authenticated;

-- профиль создаётся автоматически с ролью staff
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, full_name, role) values (new.id, split_part(new.email,'@',1), 'staff');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table profiles enable row level security;
alter table clients enable row level security;
alter table services enable row level security;
alter table staff enable row level security;
alter table staff_pay enable row level security;
alter table bookings enable row level security;
alter table orders enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on profiles to authenticated;
grant select, insert, update, delete on clients, services, staff, staff_pay, bookings, orders to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy profiles_self on profiles for select to authenticated using (id = auth.uid() or is_admin());

-- сотрудник: читает справочники, создаёт/меняет клиентов и записи
create policy clients_read   on clients  for select to authenticated using (is_user());
create policy clients_ins    on clients  for insert to authenticated with check (is_user());
create policy clients_upd    on clients  for update to authenticated using (is_user()) with check (is_user());
create policy clients_del    on clients  for delete to authenticated using (is_admin());

create policy services_read  on services for select to authenticated using (is_user());
create policy services_adm   on services for all    to authenticated using (is_admin()) with check (is_admin());

create policy staff_read     on staff    for select to authenticated using (is_user());
create policy staff_adm      on staff    for all    to authenticated using (is_admin()) with check (is_admin());

create policy pay_adm        on staff_pay for all   to authenticated using (is_admin()) with check (is_admin());

create policy bookings_read  on bookings for select to authenticated using (is_user());
create policy bookings_ins   on bookings for insert to authenticated with check (is_user());
create policy bookings_upd   on bookings for update to authenticated using (is_user()) with check (is_user());
create policy bookings_del   on bookings for delete to authenticated using (is_admin());

-- заказы (выручка): сотрудник может только создать, читает и правит только админ
create policy orders_ins     on orders   for insert to authenticated with check (is_user());
create policy orders_adm     on orders   for select to authenticated using (is_admin());
create policy orders_upd     on orders   for update to authenticated using (is_admin()) with check (is_admin());
create policy orders_del     on orders   for delete to authenticated using (is_admin());

-- стартовые услуги
insert into services(name,category,price,minutes) values
 ('Мойка кузова','Мойка',800,30),('Комплексная мойка','Мойка',1500,60),
 ('Химчистка салона','Химчистка',6000,180),('Полировка кузова','Полировка',5000,150),
 ('Керамика','Защита',12000,240),('Чернение резины','Прочее',300,10);

-- ПОСЛЕ создания пользователей (Authentication -> Users) сделайте администратором:
-- update profiles set role='admin' where full_name='admin';
