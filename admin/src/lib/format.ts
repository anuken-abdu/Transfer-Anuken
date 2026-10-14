import type { OrderStatus, OrderType, PaymentMethod, PaymentStatus, DriverState } from "./types";

export const TZ = "Asia/Almaty"; // весь Казахстан с 2024 года — UTC+5
const TZ_OFFSET = "+05:00";

export const money = (v: number | null | undefined) =>
  v === null || v === undefined ? "по запросу" : new Intl.NumberFormat("ru-RU").format(v) + " ₸";

export const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso)).replace(".", "");

export const timeOnly = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export const dayLabel = (iso: string) => {
  const d = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(x);
  const today = d(new Date());
  const tomorrow = d(new Date(Date.now() + 864e5));
  const v = d(new Date(iso));
  if (v === today) return "Сегодня";
  if (v === tomorrow) return "Завтра";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, weekday: "short", day: "numeric", month: "long" }).format(new Date(iso));
};

/** "YYYY-MM-DD" сегодняшнего дня по Алматы */
export const todayKey = (shiftDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Date.now() + shiftDays * 864e5));

/** значение для <input type="datetime-local"> → ISO с поясом Казахстана */
export const localInputToIso = (v: string) => new Date(v + ":00" + TZ_OFFSET).toISOString();
export const isoToLocalInput = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
};
export const dayStartIso = (key: string) => new Date(key + "T00:00:00" + TZ_OFFSET).toISOString();

export const phonePretty = (p: string | null | undefined) => {
  if (!p) return "—";
  let d = p.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  return d.length === 11 ? `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}` : p;
};
export const waLink = (p: string) => "https://wa.me/" + p.replace(/\D/g, "").replace(/^8(\d{10})$/, "7$1");

export const STATUS: Record<OrderStatus, { label: string; tone: string }> = {
  new:         { label: "Новый",       tone: "warn" },
  confirmed:   { label: "Ждёт водителя", tone: "warn" },
  assigned:    { label: "Назначен",    tone: "info" },
  en_route:    { label: "Едет к клиенту", tone: "info" },
  arrived:     { label: "На месте",    tone: "info" },
  in_progress: { label: "В пути",      tone: "go" },
  completed:   { label: "Выполнен",    tone: "done" },
  cancelled:   { label: "Отменён",     tone: "off" },
};
export const ACTIVE_STATUSES: OrderStatus[] = ["new", "confirmed", "assigned", "en_route", "arrived", "in_progress"];

export const TYPE: Record<OrderType, string> = { transfer: "Трансфер", hourly: "Почасовая", intercity: "Межгород" };
export const PAY_METHOD: Record<PaymentMethod, string> = { cash: "Наличные", kaspi: "Kaspi", card: "Карта", invoice: "Счёт (безнал)" };
export const PAY_STATUS: Record<PaymentStatus, string> = { unpaid: "Не оплачен", paid: "Оплачен", refunded: "Возврат" };
export const DRIVER_STATE: Record<DriverState, string> = { offline: "Не на линии", online: "На линии", busy: "На заказе" };

export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export const errText = (e: unknown) => {
  const m = (e as { message?: string })?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return "Неверный email или пароль";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Нет связи с сервером. Проверьте интернет";
  return m;
};
