// Демо-режим: те же экраны на тестовых данных в памяти браузера, без Supabase.
// Запуск: npm run demo
import type { Api } from "./api";
import type { CarClass, City, ClassRate, Company, Driver, Order, OrderEvent, Tariff, Car, OrderStatus } from "./types";
import { ACTIVE_STATUSES, dayStartIso } from "./format";

const uid = () => crypto.randomUUID();
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function demoApi(): Api {
  const cities: City[] = [
    { id: 1, slug: "almaty", name_ru: "Алматы", is_active: true, sort: 1 },
    { id: 2, slug: "astana", name_ru: "Астана", is_active: true, sort: 2 },
  ];
  const classes: CarClass[] = [
    { id: 1, code: "comfort", name_ru: "Комфорт", seats: 4, luggage: 2, description_ru: "Camry, Sonata, K5", is_active: true, sort: 1 },
    { id: 2, code: "business", name_ru: "Бизнес", seats: 4, luggage: 3, description_ru: "E-класс, BMW 5, Lexus ES", is_active: true, sort: 2 },
    { id: 3, code: "minivan", name_ru: "Минивэн", seats: 7, luggage: 6, description_ru: "Staria, Carnival", is_active: true, sort: 3 },
    { id: 4, code: "vip", name_ru: "VIP", seats: 3, luggage: 3, description_ru: "S-класс, Alphard", is_active: true, sort: 4 },
  ];
  const routes: [number, string, string, string, number[]][] = [
    [1, "Аэропорт — центр города", "Аэропорт Алматы (ALA)", "Центр Алматы", [8000, 15000, 18000, 35000]],
    [1, "Центр — аэропорт", "Центр Алматы", "Аэропорт Алматы (ALA)", [8000, 15000, 18000, 35000]],
    [1, "Аэропорт — Шымбулак", "Аэропорт Алматы (ALA)", "Шымбулак", [18000, 30000, 35000, 60000]],
    [2, "Аэропорт — центр города", "Аэропорт Астаны (NQZ)", "Центр Астаны", [7000, 13000, 16000, 30000]],
    [2, "Астана — Бурабай", "Астана", "Бурабай (Боровое)", [45000, 75000, 85000, 150000]],
  ];
  let tid = 0;
  const tariffs: Tariff[] = routes.flatMap(([city, title, from, to, prices], i) =>
    prices.map((price, k) => ({ id: ++tid, city_id: city, car_class_id: k + 1, title_ru: title, from_label: from, to_label: to, price, is_active: true, sort: i + 1 })));
  const rates: ClassRate[] = cities.flatMap((c) => [7000, 12000, 14000, 25000].map((h, k) =>
    ({ city_id: c.id, car_class_id: k + 1, hourly_price: h, min_hours: k === 3 ? 3 : 2, intercity_km_price: [150, 250, 300, 500][k] })));
  const companies: Company[] = [
    { id: 1, name: "ТОО «КазЭнергоСервис»", bin: "180340012345", contact_name: "Динара", contact_phone: "+77017770011", email: "office@kes.kz", discount_pct: 10, is_active: true, note: null },
    { id: 2, name: "Отель Grand Tien Shan", bin: null, contact_name: "Ресепшн", contact_phone: "+77272440000", email: null, discount_pct: 5, is_active: true, note: "Встречи гостей из аэропорта" },
  ];

  const people: [string, string, number, number, string, string, string, number][] = [
    ["Ерлан Сапаров", "+77011112233", 1, 2, "Mercedes-Benz", "E 200", "777 ABE 02", 4],
    ["Нурлан Ахметов", "+77052223344", 1, 1, "Toyota", "Camry 75", "123 KZA 02", 4],
    ["Данияр Касымов", "+77073334455", 1, 3, "Hyundai", "Staria", "505 STR 02", 7],
    ["Бауыржан Омаров", "+77024445566", 1, 4, "Toyota", "Alphard", "001 VIP 02", 3],
    ["Асхат Жунусов", "+77015556677", 2, 2, "Lexus", "ES 250", "250 LEX 01", 4],
    ["Руслан Ким", "+77786667788", 2, 1, "Kia", "K5", "555 KIA 01", 4],
  ];
  let carId = 0;
  const drivers: Driver[] = people.map(([name, phone, city, cls, make, model, plate, seats], i) => {
    const id = uid();
    return {
      id, city_id: city, state: (["online", "busy", "online", "offline", "online", "offline"] as const)[i],
      is_active: true, commission_pct: 20, rating: 4.9, languages: ["ru", "kz"], note: null,
      last_seen_at: new Date().toISOString(), profile: { full_name: name, phone, email: null },
      cars: [{ id: ++carId, driver_id: id, car_class_id: cls, make, model, year: 2022, color: ["Чёрный", "Белый", "Серый"][i % 3], plate, seats, is_active: true }],
    };
  });

  const at = (h: number) => new Date(Math.round((Date.now() + h * 36e5) / 9e5) * 9e5).toISOString();
  let num = 1040;
  const mk = (p: Partial<Order>): Order => ({
    id: uid(), number: ++num, source: "web", type: "transfer", status: "new", city_id: 1, car_class_id: 1, tariff_id: null,
    company_id: null, client_name: "", client_phone: "", pickup_at: at(3), pickup_address: "", dropoff_address: null,
    hours: null, passengers: 1, luggage: 1, flight_number: null, sign_text: null, child_seat: false, comment: null,
    price: null, driver_payout: null, payment_method: "cash", payment_status: "unpaid", driver_id: null, car_id: null,
    cancel_reason: null, internal_note: null, created_at: new Date().toISOString(), tracking_token: uid(), ...p,
  });
  const orders: Order[] = [
    mk({ client_name: "Айгерим", client_phone: "+77071234567", pickup_at: at(1.5), pickup_address: "Аэропорт Алматы (ALA), терминал 1", dropoff_address: "Rixos Almaty, пр. Сейфуллина 506", car_class_id: 2, tariff_id: 2, price: 15000, flight_number: "KC 852", sign_text: "AIGERIM", status: "new", payment_method: "kaspi" }),
    mk({ client_name: "John Miller", client_phone: "+77019998877", pickup_at: at(4), pickup_address: "The Ritz-Carlton, пр. Аль-Фараби 77/7", dropoff_address: "Шымбулак", car_class_id: 4, tariff_id: 12, price: 45000, passengers: 2, status: "confirmed", source: "app", comment: "Нужны две бутылки воды" }),
    mk({ client_name: "Динара (КазЭнергоСервис)", client_phone: "+77017770011", company_id: 1, type: "hourly", hours: 4, pickup_at: at(0.5), pickup_address: "БЦ Нурлы Тау, пр. Аль-Фараби 19", car_class_id: 2, price: 43200, status: "assigned", driver_id: drivers[0].id, car_id: 1, driver_payout: 34560, payment_method: "invoice", source: "admin" }),
    mk({ client_name: "Марат", client_phone: "+77478001122", pickup_at: at(-0.3), pickup_address: "Вокзал Алматы-2", dropoff_address: "мкр. Самал-2, 58", car_class_id: 1, price: 6000, status: "in_progress", driver_id: drivers[1].id, car_id: 2, driver_payout: 4800 }),
    mk({ client_name: "Свадьба Ерболата", client_phone: "+77002003040", type: "hourly", hours: 5, pickup_at: at(26), pickup_address: "Ресторан Tau Dastarkhan", car_class_id: 4, price: 125000, status: "confirmed", child_seat: false, comment: "Украшение машины лентами — согласовано" }),
    mk({ city_id: 2, client_name: "Алия", client_phone: "+77754445566", pickup_at: at(6), pickup_address: "Аэропорт Астаны (NQZ)", dropoff_address: "Hilton Astana", car_class_id: 2, price: 13000, status: "assigned", driver_id: drivers[4].id, car_id: 5, driver_payout: 10400, flight_number: "DV 735" }),
    mk({ city_id: 2, client_name: "Группа из Китая", client_phone: "+77013332211", type: "intercity", pickup_at: at(30), pickup_address: "Hilton Astana", dropoff_address: "Бурабай, санаторий Окжетпес", car_class_id: 3, price: null, passengers: 6, luggage: 6, status: "new", comment: "Нужен гид-переводчик?" }),
    mk({ client_name: "Тимур", client_phone: "+77051112200", pickup_at: at(-5), pickup_address: "Esentai Mall", dropoff_address: "Аэропорт Алматы (ALA)", car_class_id: 1, price: 8000, status: "completed", driver_id: drivers[1].id, car_id: 2, driver_payout: 6400, payment_status: "paid", payment_method: "kaspi" }),
  ];
  const events: Record<string, OrderEvent[]> = {};
  const log = (o: Order, note: string | null = null) =>
    (events[o.id] ??= []).push({ id: Date.now() + Math.random(), status: o.status, note, created_at: new Date().toISOString() });
  orders.forEach((o) => log(o));

  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((f) => f());
  const withJoins = (o: Order): Order => {
    const d = drivers.find((x) => x.id === o.driver_id);
    const c = d?.cars.find((x) => x.id === o.car_id);
    return { ...o, driver: d ? { profile: d.profile } : null, car: c ? { make: c.make, model: c.model, plate: c.plate, color: c.color } : null };
  };
  const quote: Api["quote"] = async (i) => {
    let p: number | null = null;
    if (i.type === "transfer") p = tariffs.find((t) => t.id === i.tariff)?.price ?? null;
    else {
      const r = rates.find((x) => x.city_id === i.city && x.car_class_id === i.car_class);
      if (r && i.type === "hourly" && i.hours) p = r.hourly_price * Math.max(i.hours, r.min_hours);
      if (r && i.type === "intercity" && i.distance_km) p = r.intercity_km_price * i.distance_km;
    }
    const disc = companies.find((c) => c.id === i.company)?.discount_pct ?? 0;
    return p === null ? null : Math.round((p * (1 - disc / 100)) / 100) * 100;
  };
  const find = (id: string) => {
    const o = orders.find((x) => x.id === id);
    if (!o) throw new Error("Заказ не найден");
    return o;
  };

  return {
    demo: true,
    async signIn() { await wait(); },
    async signOut() { await wait(); location.reload(); },
    async me() { return { id: "demo", role: "admin", full_name: "Демо-администратор", phone: null, email: "demo@anuken.kz" }; },
    onOrdersChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    async cities() { return clone(cities); },
    async classes() { return clone(classes); },

    async orders(f) {
      await wait();
      const s = f.q?.trim().toLowerCase();
      return clone(orders
        .filter((o) => !f.city || o.city_id === f.city)
        .filter((o) => f.status === "active" ? ACTIVE_STATUSES.includes(o.status) : !f.status || f.status === "all" || o.status === f.status)
        .filter((o) => !f.from || o.pickup_at >= dayStartIso(f.from))
        .filter((o) => !f.to || o.pickup_at < new Date(new Date(dayStartIso(f.to)).getTime() + 864e5).toISOString())
        .filter((o) => !s || String(o.number) === s || [o.client_name, o.client_phone, o.pickup_address].some((v) => v.toLowerCase().includes(s)))
        .sort((a, b) => a.pickup_at.localeCompare(b.pickup_at))
        .map(withJoins));
    },
    async orderEvents(id) { return clone(events[id] ?? []); },
    async createOrder(i) {
      await wait();
      const price = i.price_override ?? (await quote(i));
      const o = mk({
        source: "admin", type: i.type, status: price === null ? "new" : "confirmed", city_id: i.city, car_class_id: i.car_class,
        tariff_id: i.type === "transfer" ? i.tariff ?? null : null, company_id: i.company ?? null,
        client_name: i.client_name, client_phone: i.client_phone, pickup_at: i.pickup_at, pickup_address: i.pickup_address,
        dropoff_address: i.dropoff_address || null, hours: i.type === "hourly" ? i.hours ?? null : null,
        passengers: i.passengers, luggage: i.luggage, flight_number: i.flight_number || null, sign_text: i.sign_text || null,
        child_seat: i.child_seat, comment: i.comment || null, price, payment_method: i.payment_method,
      });
      orders.push(o); log(o); changed();
      return { id: o.id, number: o.number };
    },
    quote,
    async updateOrder(id, patch) { await wait(); Object.assign(find(id), patch); changed(); },
    async assign(oid, did, cid) {
      await wait();
      const o = find(oid);
      const d = drivers.find((x) => x.id === did);
      const c = d?.cars.find((x) => x.id === cid);
      if (!d || !c) throw new Error("Машина не принадлежит водителю");
      if (o.price === null) throw new Error("Сначала укажите цену заказа");
      const sort = (id: number) => classes.find((x) => x.id === id)!.sort;
      if (sort(c.car_class_id) < sort(o.car_class_id)) throw new Error("Класс машины ниже заказанного");
      if (c.seats < o.passengers) throw new Error("В машине недостаточно мест");
      Object.assign(o, { driver_id: did, car_id: cid, driver_payout: Math.round(o.price * (1 - d.commission_pct / 100)) });
      if (["new", "confirmed", "assigned"].includes(o.status)) o.status = "assigned";
      log(o); changed();
    },
    async setStatus(oid, status: OrderStatus, reason) {
      await wait();
      const o = find(oid);
      if (["assigned", "en_route", "arrived", "in_progress", "completed"].includes(status) && !o.driver_id) throw new Error("Сначала назначьте водителя");
      o.status = status;
      if (status === "cancelled") o.cancel_reason = reason ?? o.cancel_reason;
      if (status === "new" || status === "confirmed") Object.assign(o, { driver_id: null, car_id: null, driver_payout: null });
      log(o, status === "cancelled" ? reason ?? null : null); changed();
    },

    async drivers() { await wait(); return clone(drivers); },
    async createDriver(i) {
      await wait();
      drivers.push({ id: uid(), city_id: i.city_id, state: "offline", is_active: true, commission_pct: i.commission_pct, rating: 5,
        languages: ["ru"], note: null, last_seen_at: null, profile: { full_name: i.full_name, phone: i.phone, email: i.email }, cars: [] });
    },
    async updateDriver(id, patch) { await wait(); Object.assign(drivers.find((d) => d.id === id)!, patch); },
    async saveCar(c) {
      await wait();
      const d = drivers.find((x) => x.id === c.driver_id)!;
      if (c.id) Object.assign(d.cars.find((x) => x.id === c.id)!, c);
      else d.cars.push({ ...(c as Omit<Car, "id">), id: ++carId });
    },

    async tariffs(city) { return clone(tariffs.filter((t) => t.city_id === city).sort((a, b) => a.sort - b.sort || a.car_class_id - b.car_class_id)); },
    async saveTariff(t) {
      await wait();
      if (t.id) Object.assign(tariffs.find((x) => x.id === t.id)!, t);
      else tariffs.push({ ...t, id: ++tid } as Tariff);
    },
    async rates(city) { return clone(rates.filter((r) => r.city_id === city)); },
    async saveRate(r) { await wait(); Object.assign(rates.find((x) => x.city_id === r.city_id && x.car_class_id === r.car_class_id)!, r); },

    async companies() { return clone(companies); },
    async saveCompany(c) {
      await wait();
      if (c.id) Object.assign(companies.find((x) => x.id === c.id)!, c);
      else companies.push({ ...c, id: companies.length + 1 } as Company);
    },
  };
}
