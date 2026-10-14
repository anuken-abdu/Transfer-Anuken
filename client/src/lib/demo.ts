// Демо-режим клиентского сайта: тарифы и заказы в памяти, без сервера. Запуск: npm run demo
// После заказа статус сам меняется каждые 12 секунд — так видно, как работает отслеживание.
import type { Api } from "./api";
import type { BookingResult, CarClass, City, ClassRate, OrderStatus, Tariff, Tracking } from "./types";

const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));

export function demoApi(): Api {
  const cities: City[] = [
    { id: 1, slug: "almaty", name_ru: "Алматы", name_en: "Almaty", sort: 1 },
    { id: 2, slug: "astana", name_ru: "Астана", name_en: "Astana", sort: 2 },
  ];
  const classes: CarClass[] = [
    { id: 1, code: "comfort", name_ru: "Комфорт", name_en: "Comfort", seats: 4, luggage: 2, description_ru: "Toyota Camry, Hyundai Sonata, Kia K5 или аналог", sort: 1 },
    { id: 2, code: "business", name_ru: "Бизнес", name_en: "Business", seats: 4, luggage: 3, description_ru: "Mercedes E-класс, BMW 5, Lexus ES или аналог", sort: 2 },
    { id: 3, code: "minivan", name_ru: "Минивэн", name_en: "Minivan", seats: 7, luggage: 6, description_ru: "Hyundai Staria, Kia Carnival или аналог", sort: 3 },
    { id: 4, code: "vip", name_ru: "VIP", name_en: "VIP", seats: 3, luggage: 3, description_ru: "Mercedes S-класс, Toyota Alphard или аналог", sort: 4 },
  ];
  const routes: [number, string, string, string, string, number[]][] = [
    [1, "Аэропорт — центр города", "Airport — city centre", "Аэропорт Алматы (ALA)", "Центр Алматы", [8000, 15000, 18000, 35000]],
    [1, "Центр — аэропорт", "City centre — airport", "Центр Алматы", "Аэропорт Алматы (ALA)", [8000, 15000, 18000, 35000]],
    [1, "Аэропорт — Шымбулак", "Airport — Shymbulak", "Аэропорт Алматы (ALA)", "Шымбулак", [18000, 30000, 35000, 60000]],
    [2, "Аэропорт — центр города", "Airport — city centre", "Аэропорт Астаны (NQZ)", "Центр Астаны", [7000, 13000, 16000, 30000]],
    [2, "Астана — Бурабай", "Astana — Burabay", "Астана", "Бурабай (Боровое)", [45000, 75000, 85000, 150000]],
  ];
  let tid = 0;
  const tariffs: Tariff[] = routes.flatMap(([city, ru, en, from, to, prices], i) =>
    prices.map((price, k) => ({ id: ++tid, city_id: city, car_class_id: k + 1, title_ru: ru, title_en: en, from_label: from, to_label: to, price, sort: i + 1 })));
  const rates: ClassRate[] = cities.flatMap((c) => [7000, 12000, 14000, 25000].map((h, k) =>
    ({ city_id: c.id, car_class_id: k + 1, hourly_price: h, min_hours: k === 3 ? 3 : 2, intercity_km_price: 0 })));

  type Rec = Tracking & { token: string; created: number; cancelled: boolean };
  const orders: Rec[] = [];
  let num = 1100;
  const flow: OrderStatus[] = ["new", "confirmed", "assigned", "en_route", "arrived", "in_progress", "completed"];
  const statusOf = (o: Rec): OrderStatus => {
    if (o.cancelled) return "cancelled";
    if (o.price === null) return "new";
    return flow[Math.min(flow.length - 1, Math.floor((Date.now() - o.created) / 12000))];
  };

  return {
    demo: true,
    async cities() { return cities; },
    async classes() { return classes; },
    async tariffs(city) { await wait(); return tariffs.filter((t) => t.city_id === city); },
    async rates(city) { return rates.filter((r) => r.city_id === city); },
    async book(i): Promise<BookingResult> {
      await wait(500);
      const cls = classes.find((c) => c.id === i.car_class)!;
      if (i.passengers > cls.seats) throw new Error(`В этом классе максимум ${cls.seats} пассажиров`);
      if (new Date(i.pickup_at).getTime() < Date.now() + 30 * 6e4) throw new Error("Заказ принимается минимум за 30 минут до подачи");
      let price: number | null = null;
      if (i.type === "transfer" && i.tariff) price = tariffs.find((t) => t.id === i.tariff)?.price ?? null;
      if (i.type === "hourly" && i.hours) {
        const r = rates.find((x) => x.city_id === i.city && x.car_class_id === i.car_class)!;
        price = r.hourly_price * Math.max(i.hours, r.min_hours);
      }
      const city = cities.find((c) => c.id === i.city)!;
      const token = crypto.randomUUID();
      orders.push({
        token, created: Date.now(), cancelled: false, number: ++num, status: "new", type: i.type, hours: i.hours ?? null,
        pickup_at: i.pickup_at, pickup_address: i.pickup_address, dropoff_address: i.dropoff_address ?? null, passengers: i.passengers,
        price, payment_method: i.payment_method, car_class: cls.name_ru, car_class_en: cls.name_en, city_slug: city.slug, city: city.name_ru,
        cancel_reason: null, can_cancel: true, driver: null,
      });
      return { id: token, number: num, price, status: price === null ? "new" : "new", tracking_token: token };
    },
    async track(token) {
      await wait();
      const o = orders.find((x) => x.token === token);
      if (!o) return null;
      const status = statusOf(o);
      const withDriver = ["assigned", "en_route", "arrived", "in_progress"].includes(status);
      const moving = ["en_route", "arrived", "in_progress"].includes(status);
      return {
        ...o, status,
        can_cancel: ["new", "confirmed", "assigned"].includes(status) && new Date(o.pickup_at).getTime() > Date.now() + 36e5,
        driver: withDriver ? { name: "Ерлан", phone: "+77011112233", car: "Чёрный Mercedes-Benz E 200", plate: "777 ABE 02",
          lat: moving ? 43.33 : null, lng: moving ? 77.01 : null, seen_at: moving ? new Date().toISOString() : null } : null,
      };
    },
    async cancel(token, reason) {
      await wait();
      const o = orders.find((x) => x.token === token);
      if (!o || !["new", "confirmed", "assigned"].includes(statusOf(o))) throw new Error("Отменить онлайн можно до выезда водителя и не позже чем за час до подачи. Позвоните диспетчеру");
      o.cancelled = true; o.cancel_reason = reason || "Отменён клиентом";
    },
  };
}
