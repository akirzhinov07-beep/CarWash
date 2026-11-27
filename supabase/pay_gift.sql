-- Зарплата в рублях за услугу, скидки и «Мойка в подарок». Выполнить один раз в Supabase → SQL Editor.
alter table services add column if not exists pay numeric;
alter table bookings add column if not exists discount numeric not null default 0;
alter table bookings add column if not exists gift boolean not null default false;
alter table orders add column if not exists discount numeric not null default 0;
alter table orders add column if not exists gift boolean not null default false;
alter table orders add column if not exists list_total numeric;
alter table orders add column if not exists staff_earn numeric;
notify pgrst, 'reload schema';
