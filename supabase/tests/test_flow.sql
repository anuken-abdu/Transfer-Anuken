\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

create schema t;
grant usage on schema t to anon, authenticated;
create function t.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FAIL: %', msg; end if; raise notice 'ok  %', msg; end $$;
grant execute on all functions in schema t to anon, authenticated;
set client_min_messages = notice;

-- пользователи
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@x.kz', '{"full_name":"Абдурасул"}'),
  ('00000000-0000-0000-0000-00000000000b', 'disp@x.kz',  '{"full_name":"Диспетчер"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@x.kz',    '{"full_name":"Ерлан Сапаров","phone":"8 701 111 22 33"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@x.kz',    '{"full_name":"Нурлан"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'c1@x.kz',    '{"full_name":"Клиент"}');
select t.ok((select count(*) = 5 from public.profiles), 'профили создаются при регистрации');
select t.ok((select phone = '+77011112233' from public.profiles where email = 'd1@x.kz'), 'телефон нормализуется');

update public.profiles set role = 'admin'      where email = 'admin@x.kz';
update public.profiles set role = 'dispatcher' where email = 'disp@x.kz';
update public.profiles set role = 'driver'     where email in ('d1@x.kz', 'd2@x.kz');
insert into public.companies (name, bin, discount_pct) values ('ТОО Тест', '123456789012', 10);
update public.profiles set company_id = 1 where email = 'c1@x.kz';

insert into public.drivers (id, city_id, commission_pct) values
  ('00000000-0000-0000-0000-0000000000d1', 1, 20),
  ('00000000-0000-0000-0000-0000000000d2', 1, 15);
insert into public.cars (driver_id, car_class_id, make, model, plate, seats) values
  ('00000000-0000-0000-0000-0000000000d1', 2, 'Mercedes', 'E200', '777 ABC 02', 4),
  ('00000000-0000-0000-0000-0000000000d2', 1, 'Toyota',   'Camry', '123 KZA 02', 4);
select t.ok(t.fails($$insert into public.cars (driver_id, car_class_id, make, model, plate) values ('00000000-0000-0000-0000-0000000000d2', 1, 'X','Y','777abc02')$$), 'дубль госномера запрещён');

-- ============ ГОСТЬ С САЙТА ============
set role anon;
select t.ok((select count(*) = 2 from public.cities), 'гость видит города');
select t.ok((select count(*) = 36 from public.tariffs), 'гость видит тарифы');
select t.ok((select count(*) = 0 from public.orders), 'гость не видит заказы');
select t.ok((select count(*) = 0 from public.profiles), 'гость не видит профили');
select t.ok(t.fails($$insert into public.orders (city_id, car_class_id, client_name, client_phone, pickup_at, pickup_address, dropoff_address) values (1,1,'x','+77010000000',now()+interval '1 day','a','b')$$), 'гость не может вставить заказ напрямую');
select t.ok(t.fails($$update public.tariffs set price = 1$$) = false and (select min(price) from public.tariffs) > 1, 'гость не может менять цены');
select t.ok(public.calc_price(1::smallint, 1::smallint, 'transfer', (select id from public.tariffs where city_id=1 and car_class_id=1 and sort=1)) = 8000, 'цена аэропорт-центр комфорт = 8000');

create temp table r as select public.create_order(
  p_city => 1::smallint, p_class => 2::smallint, p_type => 'transfer',
  p_pickup_at => now() + interval '1 day', p_pickup_address => 'Аэропорт ALA, терминал 1',
  p_dropoff_address => 'Rixos, пр. Сейфуллина 506', p_client_name => 'Айгерим',
  p_client_phone => '+7 (707) 123-45-67', p_tariff => (select id from public.tariffs where city_id=1 and car_class_id=2 and sort=1), p_flight_number => 'kc 852',
  p_sign_text => 'AIGERIM') as j;
select t.ok((select (j->>'price')::int = 15000 and j->>'status' = 'new' from r), 'заказ с сайта: цена с сервера, статус new');
select t.ok(t.fails($$select public.create_order(1::smallint,1::smallint,'transfer',now()+interval '1 day','a b c','Имя','12345','x y z',(select id from public.tariffs where city_id=1 and car_class_id=1 and sort=1))$$), 'неверный телефон отклонён');
select t.ok(t.fails($$select public.create_order(1::smallint,1::smallint,'transfer',now()+interval '10 minutes','a b c','Имя','+77071234567','x y z',(select id from public.tariffs where city_id=1 and car_class_id=1 and sort=1))$$), 'заказ менее чем за 30 мин отклонён');
select t.ok(t.fails($$select public.create_order(1::smallint,1::smallint,'transfer',now()+interval '1 day','a b c','Имя','+77071234567','x y z',(select id from public.tariffs where city_id=1 and car_class_id=2 and sort=1))$$), 'тариф другого класса отклонён');
select t.ok(t.fails($$select public.create_order(1::smallint,1::smallint,'transfer',now()+interval '1 day','a b c','Имя','+77071234567','x y z',(select id from public.tariffs where city_id=1 and car_class_id=1 and sort=1),p_passengers=>6::smallint)$$), 'пассажиров больше мест отклонено');
select t.ok(t.fails($$select public.create_order(1::smallint,1::smallint,'transfer',now()+interval '1 day','a b c','Имя','+77071234567','x y z',(select id from public.tariffs where city_id=1 and car_class_id=1 and sort=1),p_payment_method=>'invoice')$$), 'гостю нельзя оплату по счёту');
select t.ok(t.fails($$select public.assign_driver((select id from public.orders limit 1), '00000000-0000-0000-0000-0000000000d1', 1)$$), 'гость не может назначать');
select t.ok((select public.track_order((j->>'tracking_token')::uuid)->>'status' = 'new' from r), 'отслеживание по ссылке работает');
select t.ok((select (public.track_order((j->>'tracking_token')::uuid)->>'can_cancel')::boolean from r), 'по ссылке видно, что заказ можно отменить');
create temp table r4 as select public.create_order(p_city => 1::smallint, p_class => 1::smallint, p_type => 'transfer',
  p_pickup_at => now() + interval '2 days', p_pickup_address => 'Аэропорт ALA', p_dropoff_address => 'Центр', p_client_name => 'Отмена',
  p_client_phone => '+77015550000', p_tariff => (select id from public.tariffs where city_id=1 and car_class_id=1 and sort=1)) as j;
select public.cancel_by_token((select (j->>'tracking_token')::uuid from r4), 'Планы изменились');
select t.ok((select public.track_order((j->>'tracking_token')::uuid)->>'status' = 'cancelled' from r4), 'клиент отменил заказ по ссылке');
select t.ok(t.fails($q$select public.cancel_by_token((select (j->>'tracking_token')::uuid from r4))$q$), 'повторная отмена отклонена');
create temp table r5 as select public.create_order(p_city => 1::smallint, p_class => 1::smallint, p_type => 'transfer',
  p_pickup_at => now() + interval '40 minutes', p_pickup_address => 'Аэропорт ALA', p_dropoff_address => 'Центр', p_client_name => 'Поздно',
  p_client_phone => '+77015550001', p_tariff => (select id from public.tariffs where city_id=1 and car_class_id=1 and sort=1)) as j;
select t.ok(t.fails($q$select public.cancel_by_token((select (j->>'tracking_token')::uuid from r5))$q$), 'позже чем за час онлайн-отмена запрещена');
select t.ok(t.fails($q$select public.cancel_by_token(gen_random_uuid())$q$), 'чужая или выдуманная ссылка не работает');
reset role;

-- ============ КЛИЕНТ В ПРИЛОЖЕНИИ ============
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
create temp table r2 as select public.create_order(
  p_city => 1::smallint, p_class => 1::smallint, p_type => 'hourly',
  p_pickup_at => now() + interval '2 days', p_pickup_address => 'Esentai Mall',
  p_client_name => 'Клиент', p_client_phone => '87011234567', p_hours => 1::smallint) as j;
select t.ok((select (j->>'price')::int = 12600 from r2), 'почасовая: минимум 2 часа и скидка компании 10% = 12600');
select t.ok((select count(*) = 1 and bool_and(source = 'app') from public.orders), 'клиент видит только свой заказ');
select t.ok(t.fails($$update public.profiles set role = 'admin' where id = auth.uid()$$), 'клиент не может сделать себя админом');
update public.profiles set full_name = 'Клиент Новый' where id = auth.uid();
select t.ok((select full_name = 'Клиент Новый' from public.profiles where id = auth.uid()), 'клиент меняет своё имя');
update public.orders set price = 1;
select t.ok((select price = 12600 from public.orders), 'клиент не может менять цену заказа');
select t.ok((select count(*) = 1 from public.companies), 'клиент видит свою компанию');
reset role;

-- ============ ДИСПЕТЧЕР ============
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select t.ok((select count(*) = 4 from public.orders), 'диспетчер видит все заказы');
select t.ok(t.fails($$select public.assign_driver((select id from public.orders where car_class_id = 2), '00000000-0000-0000-0000-0000000000d2', 2)$$), 'нельзя дать Комфорт на заказ Бизнес');
select t.ok(t.fails($$select public.assign_driver((select id from public.orders where car_class_id = 2), '00000000-0000-0000-0000-0000000000d1', 2)$$), 'нельзя чужую машину');
select public.assign_driver((select id from public.orders where car_class_id = 2), '00000000-0000-0000-0000-0000000000d1', 1);
select t.ok((select status = 'assigned' and driver_payout = 12000 from public.orders where car_class_id = 2), 'назначен, выплата водителю 80% = 12000');
select public.assign_driver((select id from public.orders where type = 'hourly'), '00000000-0000-0000-0000-0000000000d1', 1);
select t.ok(t.fails($$select public.set_user_role('00000000-0000-0000-0000-0000000000c1', 'admin')$$), 'диспетчер не может раздавать роли');
create temp table r3 as select public.create_order(
  p_city => 2::smallint, p_class => 3::smallint, p_type => 'transfer',
  p_pickup_at => now() - interval '1 hour', p_pickup_address => 'Офис ТОО',
  p_dropoff_address => 'Караганда', p_client_name => 'Иван', p_client_phone => '+77770001122') as j;
select t.ok((select j->>'status' = 'new' and j->>'price' is null from r3), 'индивидуальный маршрут: цена по запросу');
select t.ok(t.fails($$select public.assign_driver((select id from public.orders where city_id = 2), '00000000-0000-0000-0000-0000000000d1', 1)$$), 'без цены назначить нельзя');
reset role;

-- ============ ВОДИТЕЛИ ============
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
select t.ok((select count(*) = 0 from public.orders), 'чужой водитель не видит заказ');
select t.ok(t.fails($$select public.driver_set_status((select id from public.orders limit 1), 'en_route')$$), 'чужой водитель не может менять статус');
update public.drivers set commission_pct = 0 where id = auth.uid();
select t.ok((select commission_pct = 15 from public.drivers), 'водитель не может менять свою комиссию');
reset role;

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select public.driver_set_online(true);
select t.ok((select count(*) = 2 from public.driver_orders), 'водитель видит свои заказы');
select t.ok((select bool_and(price is not null) from public.driver_orders), 'водитель видит сумму для оплаты наличными');
select public.driver_set_status((select id from public.driver_orders where car_class_id = 2), 'en_route');
select t.ok((select state = 'busy' from public.drivers), 'в пути — водитель занят');
select t.ok(t.fails($$select public.driver_set_status((select id from public.driver_orders where car_class_id = 2), 'completed')$$), 'нельзя перескочить статусы');
select public.driver_ping(43.35, 77.04);
reset role;

set role anon;
select t.ok((select (public.track_order((j->>'tracking_token')::uuid)->'driver'->>'plate') = '777 ABC 02'
              and (public.track_order((j->>'tracking_token')::uuid)->'driver'->>'lat')::float = 43.35 from r),
            'клиент по ссылке видит машину, номер и где водитель');
reset role;

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select public.driver_set_status((select id from public.driver_orders where car_class_id = 2), 'arrived');
select public.driver_set_status((select id from public.driver_orders where car_class_id = 2), 'in_progress');
select public.driver_set_status((select id from public.driver_orders where car_class_id = 2), 'completed');
select t.ok((select state = 'online' from public.drivers), 'после завершения водитель снова на линии');
select public.driver_decline((select id from public.driver_orders where type = 'hourly'), 'сломалась машина');
select t.ok((select count(*) = 1 from public.driver_orders), 'после отказа заказ ушёл от водителя');
reset role;

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select t.ok((select status = 'confirmed' and driver_id is null from public.orders), 'после отказа заказ снова ждёт водителя');
select public.client_cancel((select id from public.orders), 'передумал');
select t.ok((select status = 'cancelled' from public.orders), 'клиент отменил свой заказ');
reset role;

-- ============ АДМИН ============
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.set_user_role('00000000-0000-0000-0000-0000000000c1', 'dispatcher');
select t.ok((select role = 'dispatcher' from public.profiles where email = 'c1@x.kz'), 'админ меняет роли');
select t.ok(t.fails($$select public.set_user_role(auth.uid(), 'client')$$), 'админ не может разжаловать сам себя');
update public.tariffs set price = 9000 where id = 1;
select t.ok((select price = 9000 from public.tariffs where id = 1), 'админ меняет цены');
select t.ok((select count(*) >= 10 from public.order_events), 'журнал статусов пишется');
reset role;

\echo
\echo 'ВСЕ ТЕСТЫ ПРОЙДЕНЫ'
