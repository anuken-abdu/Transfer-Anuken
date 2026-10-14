#!/bin/sh
# Собирает setup.sql — всю базу одним файлом для SQL Editor в Supabase
cd "$(dirname "$0")"
{
  echo "-- Anuken Transfer — вся база одним файлом. Supabase → SQL Editor → вставить целиком → Run."
  echo "-- Перед запуском замените в самом конце ВАШ_EMAIL на email, который вы создали в Authentication → Users."
  for f in migrations/*.sql seed.sql; do echo; echo "-- ===== $f ====="; cat "$f"; done
  cat <<'SQL'

-- Профили для пользователей, созданных до запуска этого файла
insert into public.profiles (id, full_name, phone, email)
select u.id, nullif(u.raw_user_meta_data ->> 'full_name', ''), public.normalize_phone(u.phone), u.email
from auth.users u on conflict (id) do nothing;

-- Вы — администратор
update public.profiles set role = 'admin' where email = lower('ВАШ_EMAIL');
SQL
} > setup.sql
