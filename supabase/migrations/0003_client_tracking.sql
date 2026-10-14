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
