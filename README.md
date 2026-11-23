# CarwasH — CRM автомойки

Статический сайт (HTML/CSS/JS, без сборки) + Supabase (вход, база, роли через RLS). Хостинг — GitHub Pages.

* **Администратор:** главная, запись, записи, клиенты, услуги, сотрудники, аналитика, Excel.
* **Сотрудник:** поиск и запись клиента, выбор услуг, смена статуса записи. Выручки и зарплат не видит (закрыто на уровне базы).

## Запуск
1. Supabase → **SQL Editor** → вставить `supabase/schema.sql` → Run. (Удалит старые демо-таблицы!)
2. Supabase → **Authentication → Providers → Email**: выключить *Allow new users to sign up* и *Confirm email*.
3. **Authentication → Users → Add user**: email `admin@carwash.crm` + пароль, так же `ivan@carwash.crm` и т.д. Логин на сайте — часть до `@`.
4. SQL Editor: `update profiles set role='admin' where full_name='admin';`
5. Выполнить в SQL Editor ещё два файла: `supabase/supplies.sql` (раздел «Расходники») и `supabase/access.sql` (выдача логинов сотрудникам с сайта), `supabase/settings.sql` (раздел «Настройки»). И `supabase/marketing.sql` (согласие клиентов на сообщения, для оповещений в WhatsApp). И `supabase/cars.sql` (несколько авто у клиента, гос. знак, фото клиентов).
6. GitHub → Settings → Pages → Deploy from branch `main` / root.

В `js/config.js` лежит только publishable-ключ. **secret / service_role ключ в репозиторий и в код не добавлять.**
Демо без базы: открыть `index.html?demo=1` (admin/admin, staff/staff, данные в браузере).
