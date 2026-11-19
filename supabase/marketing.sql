-- Согласие клиента на сообщения (для рассылки о свободных окнах). Выполнить ОДИН раз в Supabase -> SQL Editor.
-- Данные не затрагиваются: у всех клиентов согласие по умолчанию = нет.
alter table clients add column if not exists marketing_ok boolean not null default false;
