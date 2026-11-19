-- Выдача логинов сотрудникам прямо с сайта. Выполнить ОДИН раз в Supabase -> SQL Editor.
-- Данные остальных таблиц НЕ затрагиваются.
alter table profiles add column if not exists staff_id bigint references staff(id) on delete set null;

create or replace function public.admin_create_login(p_login text, p_password text, p_staff_id bigint)
returns void language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_login text := lower(trim(p_login)); v_email text; v_id uuid := gen_random_uuid();
begin
  if not is_admin() then raise exception 'Только администратор может выдавать доступ'; end if;
  if v_login !~ '^[a-z0-9._-]{3,30}$' then raise exception 'Логин: 3–30 символов, латиница, цифры, точка, дефис, подчёркивание'; end if;
  if length(coalesce(p_password,'')) < 8 then raise exception 'Пароль должен быть не короче 8 символов'; end if;
  v_email := v_login || '@carwash.crm';
  if exists (select 1 from auth.users where email = v_email) then raise exception 'Такой логин уже существует'; end if;
  if p_staff_id is not null and exists (select 1 from profiles where staff_id = p_staff_id) then raise exception 'У этого сотрудника уже есть доступ'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());

  update profiles set staff_id = p_staff_id, full_name = v_login where id = v_id;
end $$;

create or replace function public.admin_set_password(p_login text, p_password text)
returns void language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not is_admin() then raise exception 'Только администратор'; end if;
  if length(coalesce(p_password,'')) < 8 then raise exception 'Пароль должен быть не короче 8 символов'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
   where email = lower(trim(p_login)) || '@carwash.crm';
  if not found then raise exception 'Логин не найден'; end if;
end $$;

create or replace function public.admin_delete_login(p_login text)
returns void language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'Только администратор'; end if;
  select id into v_id from auth.users where email = lower(trim(p_login)) || '@carwash.crm';
  if v_id is null then raise exception 'Логин не найден'; end if;
  if v_id = auth.uid() then raise exception 'Нельзя удалить собственный вход'; end if;
  delete from auth.users where id = v_id;
end $$;

revoke all on function public.admin_create_login(text,text,bigint), public.admin_set_password(text,text), public.admin_delete_login(text) from public, anon;
grant execute on function public.admin_create_login(text,text,bigint), public.admin_set_password(text,text), public.admin_delete_login(text) to authenticated;
