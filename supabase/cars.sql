-- Несколько авто у клиента, гос. знак и фотографии. Выполнить ОДИН раз в Supabase -> SQL Editor.
-- Существующие данные не удаляются: авто из карточек клиентов переносятся в новую таблицу.

-- 1. Автомобили клиента (у одного клиента их может быть несколько)
create table if not exists cars (
  id bigint generated always as identity primary key,
  client_id bigint not null references clients(id) on delete cascade,
  model text not null,
  plate text,                                   -- гос. знак, необязательно
  created_at timestamptz not null default now()
);
create index if not exists cars_client_idx on cars(client_id);

-- 2. Фотографии клиента (файлы лежат в Storage, здесь только путь)
create table if not exists client_photos (
  id bigint generated always as identity primary key,
  client_id bigint not null references clients(id) on delete cascade,
  car_id bigint references cars(id) on delete set null,
  path text not null,
  created_at timestamptz not null default now()
);
create index if not exists client_photos_client_idx on client_photos(client_id);

-- 3. Гос. знак в записи
alter table bookings add column if not exists plate text;

-- 4. Права
alter table cars enable row level security;
alter table client_photos enable row level security;
revoke all on cars, client_photos from anon;
grant select, insert, update, delete on cars, client_photos to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists cars_read on cars;   drop policy if exists cars_ins on cars;
drop policy if exists cars_upd on cars;    drop policy if exists cars_del on cars;
create policy cars_read on cars for select to authenticated using (is_user());
create policy cars_ins  on cars for insert to authenticated with check (is_user());
create policy cars_upd  on cars for update to authenticated using (is_user()) with check (is_user());
create policy cars_del  on cars for delete to authenticated using (is_admin());

drop policy if exists photos_read on client_photos; drop policy if exists photos_ins on client_photos;
drop policy if exists photos_del on client_photos;
create policy photos_read on client_photos for select to authenticated using (is_user());
create policy photos_ins  on client_photos for insert to authenticated with check (is_user());
create policy photos_del  on client_photos for delete to authenticated using (is_admin());

-- 5. Перенос уже сохранённых авто клиентов
insert into cars (client_id, model)
select c.id, trim(c.car) from clients c
where coalesce(trim(c.car),'') <> '' and not exists (select 1 from cars k where k.client_id = c.id);

-- 6. Хранилище для фото (закрытое, доступ только после входа)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-photos','client-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists cphotos_read on storage.objects; drop policy if exists cphotos_ins on storage.objects;
drop policy if exists cphotos_del on storage.objects;
create policy cphotos_read on storage.objects for select to authenticated using (bucket_id = 'client-photos' and is_user());
create policy cphotos_ins  on storage.objects for insert to authenticated with check (bucket_id = 'client-photos' and is_user());
create policy cphotos_del  on storage.objects for delete to authenticated using (bucket_id = 'client-photos' and is_admin());
