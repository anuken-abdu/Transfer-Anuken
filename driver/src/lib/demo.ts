// Демо-режим приложения водителя: тестовые заказы в памяти, без сервера. Запуск: npm run demo
import type { Api } from "./api";
import type { DriverOrder, Me, OrderStatus } from "./types";

const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const at = (h: number) => new Date(Math.round((Date.now() + h * 36e5) / 3e5) * 3e5).toISOString();

export function demoApi(): Api {
  const me: Me = {
    id: "demo-driver", full_name: "Ерлан Сапаров", phone: "+77011112233", state: "offline", is_active: true,
    commission_pct: 20, rating: 4.92, city: { id: 1, slug: "almaty", name_ru: "Алматы" },
    cars: [{ id: 1, make: "Mercedes-Benz", model: "E 200", plate: "777 ABE 02", color: "Чёрный", car_class_id: 2, is_active: true }],
  };
  let n = 1060;
  const mk = (p: Partial<DriverOrder>): DriverOrder => ({
    id: crypto.randomUUID(), number: ++n, status: "assigned", type: "transfer", pickup_at: at(1),
    pickup_address: "", pickup_lat: null, pickup_lng: null, dropoff_address: null, dropoff_lat: null, dropoff_lng: null,
    hours: null, passengers: 1, luggage: 1, flight_number: null, sign_text: null, child_seat: false, comment: null,
    client_name: "", client_phone: "", driver_payout: null, payment_method: "kaspi", payment_status: "unpaid",
    car_id: 1, city_id: 1, car_class_id: 2, price: null, ...p,
  });
  const withPrice = (o: DriverOrder) => ({ ...o, price: o.price ?? (o.driver_payout === null ? null : Math.round(o.driver_payout / 0.8)) });
  const orders: DriverOrder[] = [
    mk({ pickup_at: at(0.75), pickup_address: "Аэропорт Алматы (ALA), терминал 1, зал прилёта", pickup_lat: 43.3521, pickup_lng: 77.0405,
      dropoff_address: "Rixos Almaty, пр. Сейфуллина 506", dropoff_lat: 43.2567, dropoff_lng: 76.9452,
      client_name: "Айгерим", client_phone: "+77071234567", flight_number: "KC 852", sign_text: "AIGERIM NURLANOVNA",
      passengers: 2, luggage: 3, driver_payout: 12000, comment: "Рейс из Дубая, встретить с табличкой у выхода" }),
    mk({ type: "hourly", hours: 4, pickup_at: at(3.5), pickup_address: "БЦ Нурлы Тау, пр. Аль-Фараби 19", pickup_lat: 43.2186, pickup_lng: 76.9259,
      client_name: "Динара (КазЭнергоСервис)", client_phone: "+77017770011", payment_method: "invoice", driver_payout: 34560,
      comment: "Встречи по городу, ждать у входа" }),
    mk({ pickup_at: at(22), pickup_address: "The Ritz-Carlton, пр. Аль-Фараби 77/7", dropoff_address: "Шымбулак, нижняя станция",
      client_name: "John Miller", client_phone: "+77019998877", passengers: 2, child_seat: true, driver_payout: 24000, payment_method: "card" }),
    ...[[-26, 12000, "Esentai Mall", "Аэропорт Алматы (ALA)"], [-29, 9600, "Вокзал Алматы-2", "мкр. Самал-2, 58"],
        [-50, 34560, "Отель Kazakhstan", "Почасовая · 4 ч"], [-75, 24000, "Аэропорт Алматы (ALA)", "Шымбулак"],
        [-3, 12000, "Dostyk Plaza", "Аэропорт Алматы (ALA)"]]
      .map(([h, pay, a, b], i) => mk({ status: "completed", pickup_at: at(h as number), driver_payout: pay as number, pickup_address: a as string,
        dropoff_address: b as string, client_name: ["Тимур", "Марат", "Асель", "Мария", "Олжас"][i], client_phone: "+77050000000", payment_status: "paid" })),
    mk({ status: "cancelled", pickup_at: at(-30), pickup_address: "Hotel Royal Tulip", dropoff_address: "Аэропорт Алматы (ALA)", client_name: "Сергей", client_phone: "+77010000000", driver_payout: 12000 }),
  ];

  orders.forEach((o, i) => { orders[i] = withPrice(o); });
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((f) => f());
  const find = (id: string) => { const o = orders.find((x) => x.id === id); if (!o) throw new Error("Заказ не найден"); return o; };
  const allowed: Partial<Record<OrderStatus, OrderStatus>> = { assigned: "en_route", en_route: "arrived", arrived: "in_progress", in_progress: "completed" };

  // через 25 секунд диспетчер «назначает» новый заказ — видно, как приходит уведомление
  setTimeout(() => {
    orders.push(mk({ pickup_at: at(5), pickup_address: "Аэропорт Алматы (ALA)", dropoff_address: "Hyatt Regency, ул. Акана Серэ 29/6",
      client_name: "Mr. Chen", client_phone: "+77013332211", flight_number: "CZ 6029", sign_text: "MR CHEN", driver_payout: 12000, price: 15000, payment_method: "cash" }));
    notify();
  }, 25000);

  return {
    demo: true,
    async signIn() { await wait(); },
    async signOut() { await wait(); location.reload(); },
    async me() { await wait(); return clone(me); },
    async classes() { return [{ id: 1, name_ru: "Комфорт" }, { id: 2, name_ru: "Бизнес" }, { id: 3, name_ru: "Минивэн" }, { id: 4, name_ru: "VIP" }]; },
    async setOnline(on) {
      await wait();
      me.state = on ? (orders.some((o) => ["en_route", "arrived", "in_progress"].includes(o.status)) ? "busy" : "online") : "offline";
    },
    async active() { await wait(); return clone(orders.filter((o) => ["assigned", "en_route", "arrived", "in_progress"].includes(o.status)).sort((a, b) => a.pickup_at.localeCompare(b.pickup_at))); },
    async history(days) {
      await wait();
      const since = new Date(Date.now() - days * 864e5).toISOString();
      return clone(orders.filter((o) => ["completed", "cancelled"].includes(o.status) && o.pickup_at >= since).sort((a, b) => b.pickup_at.localeCompare(a.pickup_at)));
    },
    async setStatus(id, status) {
      await wait();
      const o = find(id);
      if (allowed[o.status] !== status) throw new Error(`Недопустимый переход: ${o.status} → ${status}`);
      o.status = status;
      if (["en_route", "arrived", "in_progress"].includes(status) && me.state !== "offline") me.state = "busy";
      if (status === "completed" && me.state === "busy") me.state = "online";
      notify();
    },
    async decline(id) {
      await wait();
      const i = orders.findIndex((o) => o.id === id && o.status === "assigned");
      if (i < 0) throw new Error("Отказаться можно только от назначенного, но не начатого заказа");
      orders.splice(i, 1); notify();
    },
    async ping() { /* в демо координаты никуда не отправляются */ },
    onChange(_id, cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
  };
}
