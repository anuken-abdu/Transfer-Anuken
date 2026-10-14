-- Anuken Transfer — вся база одним файлом. Supabase → SQL Editor → вставить целиком → Run.
-- Перед запуском замените в самом конце ВАШ_EMAIL на email, который вы создали в Authentication → Users.

-- ===== migrations/0001_init.sql =====
-- =====================================================================
-- Anuken Transfer — схема базы данных (Supabase / PostgreSQL 15+)
-- Трансферы и аренда авто с водителем. Алматы, Астана и далее по РК.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Перечисления
-- ---------------------------------------------------------------------
create type public.user_role      as enum ('admin', 'dispatcher', 'driver', 'client');
create type public.order_type     as enum ('transfer', 'hourly', 'intercity');
create type public.order_status   as enum (
  'new',          -- создан, ждёт подтверждения диспетчером (или цены по запросу)
  'confirmed',    -- подтверждён, водитель ещё не назначен
  'assigned',     -- водитель назначен
  'en_route',     -- водитель едет к клиенту
  'arrived',      -- водитель на месте
  'in_progress',  -- клиент в машине
  'completed',
  'cancelled'
);
create type public.payment_method as enum ('cash', 'kaspi', 'card', 'invoice');
create type public.payment_status as enum ('unpaid', 'paid', 'refunded');
create type public.driver_state   as enum ('offline', 'online', 'busy');
create type public.order_source   as enum ('web', 'app', 'admin', 'phone');

-- ---------------------------------------------------------------------
-- Справочники
-- ---------------------------------------------------------------------
create table public.cities (
  id         smallint generated always as identity primary key,
  slug       text not null unique,
  name_ru    text not null,
  name_kz    text not null,
  name_en    text not null,
  timezone   text not null default 'Asia/Almaty',
  is_active  boolean not null default true,
  sort       smallint not null default 0
);

create table public.car_classes (
  id         smallint generated always as identity primary key,
  code       text not null unique,          -- comfort, business, minivan, vip
  name_ru    text not null,
  name_kz    text not null,
  name_en    text not null,
  seats      smallint not null check (seats between 1 and 20),
  luggage    smallint not null default 2 check (luggage >= 0),
  description_ru text,
  is_active  boolean not null default true,
  sort       smallint not null default 0
);

-- Почасовые и базовые ставки по городу и классу
create table public.class_rates (
  city_id       smallint not null references public.cities(id) on delete cascade,
  car_class_id  smallint not null references public.car_classes(id) on delete cascade,
  hourly_price  integer  not null check (hourly_price >= 0),   -- тенге за час
  min_hours     smallint not null default 2 check (min_hours >= 1),
  intercity_km_price integer not null default 0 check (intercity_km_price >= 0),
  primary key (city_id, car_class_id)
);

-- Фиксированные маршруты (аэропорт — центр, вокзал, Шымбулак и т.д.)
create table public.tariffs (
  id            integer generated always as identity primary key,
  city_id       smallint not null references public.cities(id) on delete cascade,
  car_class_id  smallint not null references public.car_classes(id) on delete cascade,
  title_ru      text not null,
  title_kz      text,
  title_en      text,
  from_label    text not null,
  to_label      text not null,
  price         integer not null check (price > 0),             -- тенге
  is_active     boolean not null default true,
  sort          smallint not null default 0,
  created_at    timestamptz not null default now()
);
create index tariffs_city_class_idx on public.tariffs (city_id, car_class_id) where is_active;

-- ---------------------------------------------------------------------
-- Пользователи
-- ---------------------------------------------------------------------
create table public.companies (
  id            integer generated always as identity primary key,
  name          text not null,
  bin           text check (bin is null or bin ~ '^\d{12}$'),
  contact_name  text,
  contact_phone text,
  email         text,
  discount_pct  numeric(5,2) not null default 0 check (discount_pct between 0 and 50),
  is_active     boolean not null default true,
  note          text,
  created_at    timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        public.user_role not null default 'client',
  full_name   text,
  phone       text,
  email       text,
  city_id     smallint references public.cities(id),
  company_id  integer references public.companies(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);

create table public.drivers (
  id              uuid primary key references public.profiles(id) on delete cascade,
  city_id         smallint not null references public.cities(id),
  state           public.driver_state not null default 'offline',
  is_active       boolean not null default true,
  commission_pct  numeric(5,2) not null default 20 check (commission_pct between 0 and 100),
  rating          numeric(3,2) not null default 5.00 check (rating between 1 and 5),
  languages       text[] not null default array['ru'],
  note            text,
  last_lat        double precision,
  last_lng        double precision,
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index drivers_city_state_idx on public.drivers (city_id, state) where is_active;

create table public.cars (
  id            integer generated always as identity primary key,
  driver_id     uuid not null references public.drivers(id) on delete cascade,
  car_class_id  smallint not null references public.car_classes(id),
  make          text not null,
  model         text not null,
  year          smallint check (year between 1990 and 2100),
  color         text,
  plate         text not null,
  seats         smallint not null default 4 check (seats between 1 and 20),
  photo_url     text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index cars_plate_uidx on public.cars (upper(replace(plate, ' ', '')));
create index cars_driver_idx on public.cars (driver_id);

-- ---------------------------------------------------------------------
-- Заказы
-- ---------------------------------------------------------------------
create sequence public.order_number_seq start 1001;

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  number           bigint not null unique default nextval('public.order_number_seq'),
  tracking_token   uuid not null unique default gen_random_uuid(),
  source           public.order_source not null default 'web',
  type             public.order_type   not null default 'transfer',
  status           public.order_status not null default 'new',

  city_id          smallint not null references public.cities(id),
  car_class_id     smallint not null references public.car_classes(id),
  tariff_id        integer references public.tariffs(id) on delete set null,

  client_id        uuid references public.profiles(id) on delete set null,
  company_id       integer references public.companies(id) on delete set null,
  client_name      text not null,
  client_phone     text not null,

  pickup_at        timestamptz not null,
  pickup_address   text not null,
  pickup_lat       double precision,
  pickup_lng       double precision,
  dropoff_address  text,
  dropoff_lat      double precision,
  dropoff_lng      double precision,
  hours            smallint check (hours is null or hours between 1 and 24),
  distance_km      integer  check (distance_km is null or distance_km >= 0),

  passengers       smallint not null default 1 check (passengers between 1 and 20),
  luggage          smallint not null default 0 check (luggage between 0 and 30),
  flight_number    text,
  sign_text        text,          -- текст на табличке при встрече
  child_seat       boolean not null default false,
  comment          text,

  price            integer check (price is null or price >= 0),  -- null = цена по запросу
  driver_payout    integer check (driver_payout is null or driver_payout >= 0),
  payment_method   public.payment_method not null default 'cash',
  payment_status   public.payment_status not null default 'unpaid',

  driver_id        uuid references public.drivers(id) on delete set null,
  car_id           integer references public.cars(id) on delete set null,

  cancel_reason    text,
  internal_note    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint orders_hourly_has_hours check (type <> 'hourly' or hours is not null),
  constraint orders_transfer_has_dropoff check (type = 'hourly' or dropoff_address is not null)
);
create index orders_status_pickup_idx on public.orders (status, pickup_at);
create index orders_city_pickup_idx   on public.orders (city_id, pickup_at desc);
create index orders_driver_idx        on public.orders (driver_id, pickup_at) where driver_id is not null;
create index orders_client_idx        on public.orders (client_id) where client_id is not null;

create table public.order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders(id) on delete cascade,
  status      public.order_status not null,
  actor_id    uuid,
  note        text,
  created_at  timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- ---------------------------------------------------------------------
-- Вспомогательные функции доступа
-- ---------------------------------------------------------------------
create or replace function public.current_role_of_user()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','dispatcher'))
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.normalize_phone(p text)
returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if length(d) = 11 and left(d, 1) = '8' then d := '7' || substr(d, 2); end if;
  if length(d) = 10 then d := '7' || d; end if;
  if d !~ '^7\d{10}$' then return null; end if;
  return '+' || d;
end $$;

-- ---------------------------------------------------------------------
-- Триггеры
-- ---------------------------------------------------------------------
-- Профиль создаётся автоматически при регистрации
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    public.normalize_phone(coalesce(new.phone, new.raw_user_meta_data ->> 'phone')),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Роль, компанию и город меняет только админ (или сервисный ключ)
create or replace function public.guard_profile_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.role is distinct from old.role
     or new.company_id is distinct from old.company_id then
    raise exception 'Недостаточно прав для изменения роли или компании' using errcode = '42501';
  end if;
  if new.id is distinct from old.id then
    raise exception 'Нельзя менять id профиля' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- Журнал статусов
create or replace function public.log_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_events (order_id, status, actor_id, note)
    values (new.id, new.status, auth.uid(),
            case when new.status = 'cancelled' then new.cancel_reason end);
  end if;
  return new;
end $$;

create trigger orders_log after insert or update of status on public.orders
  for each row execute function public.log_order_status();

-- Статус водителя «занят/на линии» следует за активными заказами
create or replace function public.sync_driver_state()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.driver_id is not null and new.status in ('en_route','arrived','in_progress') then
    update public.drivers set state = 'busy' where id = new.driver_id and state <> 'busy';
  elsif tg_op = 'UPDATE' and old.driver_id is not null
        and new.status in ('completed','cancelled','confirmed') then
    update public.drivers d set state = 'online'
    where d.id = old.driver_id and d.state = 'busy'
      and not exists (select 1 from public.orders o
                      where o.driver_id = d.id and o.id <> new.id
                        and o.status in ('en_route','arrived','in_progress'));
  end if;
  return new;
end $$;

create trigger orders_driver_state after insert or update of status, driver_id on public.orders
  for each row execute function public.sync_driver_state();

-- ---------------------------------------------------------------------
-- Расчёт цены (только на сервере — клиент не может подделать цену)
-- ---------------------------------------------------------------------
create or replace function public.calc_price(
  p_city smallint, p_class smallint, p_type public.order_type,
  p_tariff integer default null, p_hours smallint default null,
  p_distance_km integer default null, p_company integer default null
) returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v_price numeric;
  v_rate  public.class_rates;
  v_disc  numeric := 0;
begin
  if p_type = 'transfer' then
    if p_tariff is null then return null; end if;          -- индивидуальный маршрут: цена по запросу
    select price into v_price from public.tariffs
     where id = p_tariff and city_id = p_city and car_class_id = p_class and is_active;
    if v_price is null then raise exception 'Тариф не найден для выбранного города и класса' using errcode = '22023'; end if;
  else
    select * into v_rate from public.class_rates where city_id = p_city and car_class_id = p_class;
    if not found then return null; end if;
    if p_type = 'hourly' then
      if p_hours is null then raise exception 'Укажите количество часов' using errcode = '22023'; end if;
      v_price := v_rate.hourly_price * greatest(p_hours, v_rate.min_hours);
    else -- intercity
      if p_distance_km is null or v_rate.intercity_km_price = 0 then return null; end if;
      v_price := v_rate.intercity_km_price * p_distance_km;
    end if;
  end if;

  if p_company is not null then
    select discount_pct into v_disc from public.companies where id = p_company and is_active;
    v_price := v_price * (1 - coalesce(v_disc, 0) / 100);
  end if;

  return (round(v_price / 100) * 100)::integer;   -- округление до 100 ₸
end $$;

-- ---------------------------------------------------------------------
-- Создание заказа: сайт (без входа), приложение клиента, админка
-- ---------------------------------------------------------------------
create or replace function public.create_order(
  p_city smallint,
  p_class smallint,
  p_type public.order_type,
  p_pickup_at timestamptz,
  p_pickup_address text,
  p_client_name text,
  p_client_phone text,
  p_dropoff_address text default null,
  p_tariff integer default null,
  p_hours smallint default null,
  p_distance_km integer default null,
  p_passengers smallint default 1,
  p_luggage smallint default 0,
  p_flight_number text default null,
  p_sign_text text default null,
  p_child_seat boolean default false,
  p_comment text default null,
  p_payment_method public.payment_method default 'cash',
  p_pickup_lat double precision default null,
  p_pickup_lng double precision default null,
  p_dropoff_lat double precision default null,
  p_dropoff_lng double precision default null,
  p_company integer default null,
  p_price_override integer default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_role    public.user_role := public.current_role_of_user();
  v_staff   boolean := coalesce(v_role in ('admin','dispatcher'), false);
  v_phone   text := public.normalize_phone(p_client_phone);
  v_company integer;
  v_price   integer;
  v_source  public.order_source;
  v_order   public.orders;
  v_seats   smallint;
begin
  if v_phone is null then raise exception 'Неверный номер телефона' using errcode = '22023'; end if;
  if length(trim(coalesce(p_client_name, ''))) < 2 then raise exception 'Укажите имя' using errcode = '22023'; end if;
  if length(trim(coalesce(p_pickup_address, ''))) < 3 then raise exception 'Укажите адрес подачи' using errcode = '22023'; end if;
  if p_type <> 'hourly' and length(trim(coalesce(p_dropoff_address, ''))) < 3 then
    raise exception 'Укажите адрес назначения' using errcode = '22023';
  end if;
  if not exists (select 1 from public.cities where id = p_city and is_active) then
    raise exception 'Город недоступен' using errcode = '22023';
  end if;
  select seats into v_seats from public.car_classes where id = p_class and is_active;
  if v_seats is null then raise exception 'Класс авто недоступен' using errcode = '22023'; end if;
  if coalesce(p_passengers, 1) > v_seats then
    raise exception 'В этом классе максимум % пассажиров', v_seats using errcode = '22023';
  end if;
  if not v_staff then
    if p_pickup_at < now() + interval '30 minutes' then
      raise exception 'Заказ принимается минимум за 30 минут до подачи' using errcode = '22023';
    end if;
    if p_pickup_at > now() + interval '180 days' then
      raise exception 'Слишком дальняя дата' using errcode = '22023';
    end if;
    if p_payment_method = 'invoice' then
      raise exception 'Оплата по счёту доступна только корпоративным клиентам' using errcode = '22023';
    end if;
    -- защита от спама с сайта: не более 5 активных заказов на один номер
    if (select count(*) from public.orders
         where client_phone = v_phone and status in ('new','confirmed','assigned')) >= 5 then
      raise exception 'Слишком много активных заказов на этот номер. Позвоните диспетчеру' using errcode = '22023';
    end if;
  end if;

  v_company := case when v_staff then p_company
                    else (select company_id from public.profiles where id = v_uid) end;

  v_price := case when v_staff and p_price_override is not null then p_price_override
                  else public.calc_price(p_city, p_class, p_type, p_tariff, p_hours, p_distance_km, v_company) end;

  v_source := case when v_staff then 'admin'::public.order_source
                   when v_uid is not null then 'app'::public.order_source
                   else 'web'::public.order_source end;

  insert into public.orders (
    source, type, status, city_id, car_class_id, tariff_id,
    client_id, company_id, client_name, client_phone,
    pickup_at, pickup_address, pickup_lat, pickup_lng,
    dropoff_address, dropoff_lat, dropoff_lng, hours, distance_km,
    passengers, luggage, flight_number, sign_text, child_seat, comment,
    price, payment_method
  ) values (
    v_source, p_type,
    case when v_staff and v_price is not null then 'confirmed' else 'new' end::public.order_status,
    p_city, p_class, case when p_type = 'transfer' then p_tariff end,
    case when v_staff then null else v_uid end, v_company,
    trim(p_client_name), v_phone,
    p_pickup_at, trim(p_pickup_address), p_pickup_lat, p_pickup_lng,
    nullif(trim(coalesce(p_dropoff_address, '')), ''), p_dropoff_lat, p_dropoff_lng,
    case when p_type = 'hourly' then p_hours end, p_distance_km,
    coalesce(p_passengers, 1), coalesce(p_luggage, 0),
    nullif(upper(trim(coalesce(p_flight_number, ''))), ''),
    nullif(trim(coalesce(p_sign_text, '')), ''),
    coalesce(p_child_seat, false),
    nullif(trim(coalesce(p_comment, '')), ''),
    v_price, p_payment_method
  ) returning * into v_order;

  return jsonb_build_object(
    'id', v_order.id, 'number', v_order.number, 'price', v_order.price,
    'status', v_order.status, 'tracking_token', v_order.tracking_token
  );
end $$;

-- ---------------------------------------------------------------------
-- Диспетчер: назначение водителя, смена статуса, оплата
-- ---------------------------------------------------------------------
create or replace function public.assign_driver(p_order uuid, p_driver uuid, p_car integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_drv   public.drivers;
  v_car   public.cars;
  v_class_sort smallint;
  v_car_class_sort smallint;
begin
  if not public.is_staff() then raise exception 'Только для диспетчера' using errcode = '42501'; end if;
  select * into v_order from public.orders where id = p_order for update;
  if not found then raise exception 'Заказ не найден' using errcode = 'P0002'; end if;
  if v_order.status in ('in_progress','completed','cancelled') then
    raise exception 'Нельзя переназначить заказ в статусе %', v_order.status using errcode = '22023';
  end if;
  if v_order.price is null then raise exception 'Сначала укажите цену заказа' using errcode = '22023'; end if;

  select * into v_drv from public.drivers where id = p_driver and is_active;
  if not found then raise exception 'Водитель не найден или отключён' using errcode = '22023'; end if;
  select * into v_car from public.cars where id = p_car and driver_id = p_driver and is_active;
  if not found then raise exception 'Машина не принадлежит водителю' using errcode = '22023'; end if;
  if v_car.seats < v_order.passengers then
    raise exception 'В машине недостаточно мест' using errcode = '22023';
  end if;
  select sort into v_class_sort from public.car_classes where id = v_order.car_class_id;
  select sort into v_car_class_sort from public.car_classes where id = v_car.car_class_id;
  if v_car_class_sort < v_class_sort then
    raise exception 'Класс машины ниже заказанного' using errcode = '22023';
  end if;

  update public.orders set
    driver_id = p_driver,
    car_id = p_car,
    driver_payout = round(v_order.price * (1 - v_drv.commission_pct / 100))::integer,
    status = case when status in ('new','confirmed','assigned') then 'assigned'::public.order_status else status end
  where id = p_order;
end $$;

create or replace function public.staff_set_status(p_order uuid, p_status public.order_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Только для диспетчера' using errcode = '42501'; end if;
  if p_status in ('assigned','en_route','arrived','in_progress','completed')
     and not exists (select 1 from public.orders where id = p_order and driver_id is not null) then
    raise exception 'Сначала назначьте водителя' using errcode = '22023';
  end if;
  update public.orders set
    status = p_status,
    cancel_reason = case when p_status = 'cancelled' then coalesce(p_reason, cancel_reason) else cancel_reason end,
    driver_id = case when p_status in ('new','confirmed') then null else driver_id end,
    car_id    = case when p_status in ('new','confirmed') then null else car_id end,
    driver_payout = case when p_status in ('new','confirmed') then null else driver_payout end
  where id = p_order;
  if not found then raise exception 'Заказ не найден' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Водитель: смена статуса, отказ, геопозиция, выход на линию
-- ---------------------------------------------------------------------
create or replace function public.driver_set_status(p_order uuid, p_status public.order_status)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cur public.order_status;
begin
  select status into v_cur from public.orders
   where id = p_order and driver_id = auth.uid() for update;
  if not found then raise exception 'Заказ не найден' using errcode = 'P0002'; end if;
  if not ((v_cur = 'assigned'    and p_status = 'en_route')
       or (v_cur = 'en_route'    and p_status = 'arrived')
       or (v_cur = 'arrived'     and p_status = 'in_progress')
       or (v_cur = 'in_progress' and p_status = 'completed')) then
    raise exception 'Недопустимый переход: % → %', v_cur, p_status using errcode = '22023';
  end if;
  update public.orders set status = p_status where id = p_order;
end $$;

create or replace function public.driver_decline(p_order uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders set
    status = 'confirmed', driver_id = null, car_id = null, driver_payout = null,
    internal_note = concat_ws(E'\n', internal_note,
      'Отказ водителя ' || to_char(now() at time zone 'Asia/Almaty', 'DD.MM HH24:MI') ||
      coalesce(': ' || p_reason, ''))
  where id = p_order and driver_id = auth.uid() and status = 'assigned';
  if not found then raise exception 'Отказаться можно только от назначенного, но не начатого заказа' using errcode = '22023'; end if;
end $$;

create or replace function public.driver_ping(p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Неверные координаты' using errcode = '22023';
  end if;
  update public.drivers set last_lat = p_lat, last_lng = p_lng, last_seen_at = now()
   where id = auth.uid() and is_active;
  if not found then raise exception 'Профиль водителя не найден' using errcode = '42501'; end if;
end $$;

create or replace function public.driver_set_online(p_online boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.drivers set
    state = case when p_online then
                   case when exists (select 1 from public.orders where driver_id = auth.uid()
                                      and status in ('en_route','arrived','in_progress'))
                        then 'busy' else 'online' end
                 else 'offline' end::public.driver_state,
    last_seen_at = now()
  where id = auth.uid() and is_active;
  if not found then raise exception 'Профиль водителя не найден' using errcode = '42501'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Клиент: отмена своего заказа, отслеживание по ссылке
-- ---------------------------------------------------------------------
create or replace function public.client_cancel(p_order uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status = 'cancelled', cancel_reason = coalesce(p_reason, 'Отменён клиентом')
   where id = p_order and client_id = auth.uid()
     and status in ('new','confirmed','assigned');
  if not found then raise exception 'Заказ нельзя отменить — позвоните диспетчеру' using errcode = '22023'; end if;
end $$;

-- Публичное отслеживание: только безопасные поля, без телефонов клиента
create or replace function public.track_order(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'number', o.number, 'status', o.status, 'pickup_at', o.pickup_at,
    'pickup_address', o.pickup_address, 'dropoff_address', o.dropoff_address,
    'price', o.price, 'car_class', cc.name_ru,
    'driver', case when o.driver_id is not null and o.status not in ('completed','cancelled') then jsonb_build_object(
        'name', split_part(coalesce(p.full_name, ''), ' ', 1),
        'phone', p.phone,
        'car', concat_ws(' ', c.color, c.make, c.model),
        'plate', c.plate,
        'lat', case when o.status in ('en_route','arrived','in_progress') then d.last_lat end,
        'lng', case when o.status in ('en_route','arrived','in_progress') then d.last_lng end)
      end)
  from public.orders o
  join public.car_classes cc on cc.id = o.car_class_id
  left join public.drivers d on d.id = o.driver_id
  left join public.profiles p on p.id = o.driver_id
  left join public.cars c on c.id = o.car_id
  where o.tracking_token = p_token
$$;

-- Админ: смена роли пользователя (например, клиента сделать водителем)
create or replace function public.set_user_role(p_user uuid, p_role public.user_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для администратора' using errcode = '42501'; end if;
  if p_user = auth.uid() and p_role <> 'admin' then
    raise exception 'Нельзя снять роль администратора с себя' using errcode = '22023';
  end if;
  update public.profiles set role = p_role where id = p_user;
  if not found then raise exception 'Пользователь не найден' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.cities       enable row level security;
alter table public.car_classes  enable row level security;
alter table public.class_rates  enable row level security;
alter table public.tariffs      enable row level security;
alter table public.companies    enable row level security;
alter table public.profiles     enable row level security;
alter table public.drivers      enable row level security;
alter table public.cars         enable row level security;
alter table public.orders       enable row level security;
alter table public.order_events enable row level security;

-- Справочники: читают все (сайт без входа), меняет персонал
create policy cities_read      on public.cities      for select using (is_active or public.is_staff());
create policy cities_write     on public.cities      for all using (public.is_admin()) with check (public.is_admin());
create policy classes_read     on public.car_classes for select using (is_active or public.is_staff());
create policy classes_write    on public.car_classes for all using (public.is_admin()) with check (public.is_admin());
create policy rates_read       on public.class_rates for select using (true);
create policy rates_write      on public.class_rates for all using (public.is_staff()) with check (public.is_staff());
create policy tariffs_read     on public.tariffs     for select using (is_active or public.is_staff());
create policy tariffs_write    on public.tariffs     for all using (public.is_staff()) with check (public.is_staff());

-- Компании: персонал; сотрудник компании видит свою
create policy companies_staff  on public.companies for all using (public.is_staff()) with check (public.is_staff());
create policy companies_member on public.companies for select
  using (id = (select company_id from public.profiles where id = auth.uid()));

-- Профили: свой профиль + персонал видит всех
create policy profiles_self_read   on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy profiles_self_update on public.profiles for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy profiles_staff_update on public.profiles for update using (public.is_staff()) with check (public.is_staff());
-- Клиент видит имя и телефон назначенного ему водителя
create policy profiles_my_driver on public.profiles for select using (
  exists (select 1 from public.orders o where o.client_id = auth.uid() and o.driver_id = profiles.id
          and o.status in ('assigned','en_route','arrived','in_progress')));

-- Водители и машины: водитель видит себя, меняет только персонал
create policy drivers_read  on public.drivers for select using (id = auth.uid() or public.is_staff());
create policy drivers_write on public.drivers for all using (public.is_staff()) with check (public.is_staff());
create policy cars_read     on public.cars for select using (driver_id = auth.uid() or public.is_staff()
  or exists (select 1 from public.orders o where o.client_id = auth.uid() and o.car_id = cars.id));
create policy cars_write    on public.cars for all using (public.is_staff()) with check (public.is_staff());

-- Заказы: изменения только через функции выше (кроме персонала)
create policy orders_staff  on public.orders for all using (public.is_staff()) with check (public.is_staff());
create policy orders_driver on public.orders for select using (driver_id = auth.uid());
create policy orders_client on public.orders for select using (client_id = auth.uid());

create policy events_read on public.order_events for select using (
  public.is_staff() or exists (select 1 from public.orders o where o.id = order_id
                                and (o.driver_id = auth.uid() or o.client_id = auth.uid())));

-- ---------------------------------------------------------------------
-- Права на функции
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_order, public.track_order, public.calc_price,
                          public.normalize_phone, public.is_staff, public.is_admin,
                          public.current_role_of_user to anon, authenticated;
grant execute on function public.assign_driver, public.staff_set_status, public.set_user_role,
                          public.driver_set_status, public.driver_decline, public.driver_ping,
                          public.driver_set_online, public.client_cancel to authenticated;

-- Приложение водителя читает свои заказы через это представление (только нужные ему поля)
create or replace view public.driver_orders with (security_invoker = true) as
  select o.id, o.number, o.status, o.type, o.pickup_at, o.pickup_address, o.pickup_lat, o.pickup_lng,
         o.dropoff_address, o.dropoff_lat, o.dropoff_lng, o.hours, o.passengers, o.luggage,
         o.flight_number, o.sign_text, o.child_seat, o.comment, o.client_name, o.client_phone,
         o.driver_payout, o.payment_method, o.payment_status, o.car_id, o.city_id, o.car_class_id
  from public.orders o
  where o.driver_id = auth.uid();
grant select on public.driver_orders to authenticated;

-- ---------------------------------------------------------------------
-- Realtime (живое обновление заказов в админке и у водителя)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.drivers;
  end if;
end $$;

-- ===== migrations/0002_driver_price.sql =====
-- Водителю нужна полная сумма заказа, чтобы принять оплату наличными от клиента
create or replace view public.driver_orders with (security_invoker = true) as
  select o.id, o.number, o.status, o.type, o.pickup_at, o.pickup_address, o.pickup_lat, o.pickup_lng,
         o.dropoff_address, o.dropoff_lat, o.dropoff_lng, o.hours, o.passengers, o.luggage,
         o.flight_number, o.sign_text, o.child_seat, o.comment, o.client_name, o.client_phone,
         o.driver_payout, o.payment_method, o.payment_status, o.car_id, o.city_id, o.car_class_id,
         o.price
  from public.orders o
  where o.driver_id = auth.uid();
grant select on public.driver_orders to authenticated;

-- ===== migrations/0003_client_tracking.sql =====
-- Клиент без регистрации: отслеживание и отмена заказа по личной ссылке

-- Отмена по ссылке: до выезда водителя и не позже чем за час до подачи
create or replace function public.cancel_by_token(p_token uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders set
    status = 'cancelled',
    cancel_reason = coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Отменён клиентом')
  where tracking_token = p_token
    and status in ('new', 'confirmed', 'assigned')
    and pickup_at > now() + interval '1 hour';
  if not found then
    raise exception 'Отменить онлайн можно до выезда водителя и не позже чем за час до подачи. Позвоните диспетчеру'
      using errcode = '22023';
  end if;
end $$;

-- Отслеживание: добавлены тип, часы, пассажиры, город и признак «можно отменить»
create or replace function public.track_order(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'number', o.number, 'status', o.status, 'type', o.type, 'hours', o.hours,
    'pickup_at', o.pickup_at, 'pickup_address', o.pickup_address, 'dropoff_address', o.dropoff_address,
    'passengers', o.passengers, 'price', o.price, 'payment_method', o.payment_method,
    'car_class', cc.name_ru, 'car_class_en', cc.name_en, 'city_slug', ci.slug, 'city', ci.name_ru,
    'cancel_reason', case when o.status = 'cancelled' then o.cancel_reason end,
    'can_cancel', o.status in ('new', 'confirmed', 'assigned') and o.pickup_at > now() + interval '1 hour',
    'driver', case when o.driver_id is not null and o.status not in ('completed', 'cancelled') then jsonb_build_object(
        'name', split_part(coalesce(p.full_name, ''), ' ', 1),
        'phone', p.phone,
        'car', concat_ws(' ', c.color, c.make, c.model),
        'plate', c.plate,
        'lat', case when o.status in ('en_route', 'arrived', 'in_progress') then d.last_lat end,
        'lng', case when o.status in ('en_route', 'arrived', 'in_progress') then d.last_lng end,
        'seen_at', case when o.status in ('en_route', 'arrived', 'in_progress') then d.last_seen_at end)
      end)
  from public.orders o
  join public.car_classes cc on cc.id = o.car_class_id
  join public.cities ci on ci.id = o.city_id
  left join public.drivers d on d.id = o.driver_id
  left join public.profiles p on p.id = o.driver_id
  left join public.cars c on c.id = o.car_id
  where o.tracking_token = p_token
$$;

revoke execute on function public.cancel_by_token from public;
grant execute on function public.cancel_by_token, public.track_order to anon, authenticated;

-- ===== seed.sql =====
-- Стартовые данные Anuken Transfer.
-- ЦЕНЫ — ОРИЕНТИРОВОЧНЫЕ, поменяйте в админке (раздел «Тарифы») под свои.

insert into public.cities (slug, name_ru, name_kz, name_en, timezone, sort) values
  ('almaty', 'Алматы', 'Алматы', 'Almaty', 'Asia/Almaty', 1),
  ('astana', 'Астана', 'Астана', 'Astana', 'Asia/Almaty', 2);

insert into public.car_classes (code, name_ru, name_kz, name_en, seats, luggage, description_ru, sort) values
  ('comfort',  'Комфорт', 'Комфорт', 'Comfort',  4, 2, 'Toyota Camry, Hyundai Sonata, Kia K5 или аналог', 1),
  ('business', 'Бизнес',  'Бизнес',  'Business', 4, 3, 'Mercedes E-класс, BMW 5, Lexus ES или аналог',    2),
  ('minivan',  'Минивэн', 'Минивэн', 'Minivan',  7, 6, 'Hyundai Staria, Kia Carnival или аналог',          3),
  ('vip',      'VIP',     'VIP',     'VIP',      3, 3, 'Mercedes S-класс, Toyota Alphard или аналог',       4);

-- Почасовая аренда и межгород (₸)
insert into public.class_rates (city_id, car_class_id, hourly_price, min_hours, intercity_km_price)
select ci.id, cc.id,
       case cc.code when 'comfort' then 7000 when 'business' then 12000 when 'minivan' then 14000 else 25000 end,
       case cc.code when 'vip' then 3 else 2 end,
       case cc.code when 'comfort' then 150 when 'business' then 250 when 'minivan' then 300 else 500 end
from public.cities ci cross join public.car_classes cc;

-- Фиксированные маршруты (₸)
with r(city, title, from_label, to_label, comfort, business, minivan, vip, sort) as (values
  ('almaty', 'Аэропорт — центр города', 'Аэропорт Алматы (ALA)', 'Центр Алматы', 8000, 15000, 18000, 35000, 1),
  ('almaty', 'Центр — аэропорт',        'Центр Алматы', 'Аэропорт Алматы (ALA)', 8000, 15000, 18000, 35000, 2),
  ('almaty', 'Аэропорт — Шымбулак',     'Аэропорт Алматы (ALA)', 'Шымбулак', 18000, 30000, 35000, 60000, 3),
  ('almaty', 'Центр — Шымбулак',        'Центр Алматы', 'Шымбулак', 12000, 20000, 24000, 45000, 4),
  ('almaty', 'Вокзал Алматы-2 — центр', 'Вокзал Алматы-2', 'Центр Алматы', 6000, 12000, 15000, 30000, 5),
  ('astana', 'Аэропорт — центр города', 'Аэропорт Астаны (NQZ)', 'Центр Астаны', 7000, 13000, 16000, 30000, 1),
  ('astana', 'Центр — аэропорт',        'Центр Астаны', 'Аэропорт Астаны (NQZ)', 7000, 13000, 16000, 30000, 2),
  ('astana', 'Вокзал Нурлы Жол — центр','Вокзал Нурлы Жол', 'Центр Астаны', 5000, 10000, 13000, 25000, 3),
  ('astana', 'Астана — Бурабай',        'Астана', 'Бурабай (Боровое)', 45000, 75000, 85000, 150000, 4)
)
insert into public.tariffs (city_id, car_class_id, title_ru, from_label, to_label, price, sort)
select ci.id, cc.id, r.title, r.from_label, r.to_label,
       case cc.code when 'comfort' then r.comfort when 'business' then r.business
                    when 'minivan' then r.minivan else r.vip end,
       r.sort
from r
join public.cities ci on ci.slug = r.city
cross join public.car_classes cc;

-- Названия маршрутов для англоязычной версии сайта
update public.tariffs set title_en = case title_ru
  when 'Аэропорт — центр города' then 'Airport — city centre'
  when 'Центр — аэропорт' then 'City centre — airport'
  when 'Аэропорт — Шымбулак' then 'Airport — Shymbulak'
  when 'Центр — Шымбулак' then 'City centre — Shymbulak'
  when 'Вокзал Алматы-2 — центр' then 'Almaty-2 station — city centre'
  when 'Вокзал Нурлы Жол — центр' then 'Nurly Zhol station — city centre'
  when 'Астана — Бурабай' then 'Astana — Burabay'
  else title_en end;

-- Профили для пользователей, созданных до запуска этого файла
insert into public.profiles (id, full_name, phone, email)
select u.id, nullif(u.raw_user_meta_data ->> 'full_name', ''), public.normalize_phone(u.phone), u.email
from auth.users u on conflict (id) do nothing;

-- Вы — администратор
update public.profiles set role = 'admin' where email = lower('ВАШ_EMAIL');
