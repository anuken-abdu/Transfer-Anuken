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
