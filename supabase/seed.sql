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
