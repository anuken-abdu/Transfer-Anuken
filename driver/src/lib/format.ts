import type { OrderStatus, PaymentMethod } from "./types";

export const TZ = "Asia/Almaty";

export const money = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : new Intl.NumberFormat("ru-RU").format(v) + " ₸";

export const timeOnly = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
export const dayLabel = (iso: string) => {
  const v = dayKey(new Date(iso));
  if (v === dayKey(new Date())) return "Сегодня";
  if (v === dayKey(new Date(Date.now() + 864e5))) return "Завтра";
  if (v === dayKey(new Date(Date.now() - 864e5))) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, weekday: "short", day: "numeric", month: "long" }).format(new Date(iso));
};
export const isToday = (iso: string) => dayKey(new Date(iso)) === dayKey(new Date());

/** «через 25 мин», «через 3 ч», «опоздание 10 мин» */
export const relative = (iso: string) => {
  const m = Math.round((new Date(iso).getTime() - Date.now()) / 6e4);
  if (m < -1) return `прошло ${fmtDur(-m)}`;
  if (m <= 1) return "сейчас";
  return `через ${fmtDur(m)}`;
};
const fmtDur = (m: number) => (m < 60 ? `${m} мин` : m < 60 * 24 ? `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ""}` : `${Math.round(m / 1440)} дн`);

export const phonePretty = (p: string | null | undefined) => {
  if (!p) return "—";
  let d = p.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  return d.length === 11 ? `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}` : p;
};
export const telLink = (p: string) => "tel:+" + p.replace(/\D/g, "").replace(/^8(\d{10})$/, "7$1");
export const waLink = (p: string) => "https://wa.me/" + p.replace(/\D/g, "").replace(/^8(\d{10})$/, "7$1");

/** Ссылки навигации: по координатам, если есть, иначе поиск по адресу в городе */
export function navLinks(address: string, lat: number | null, lng: number | null, citySlug = "almaty") {
  const q = encodeURIComponent(address);
  const hasPt = lat !== null && lng !== null;
  return {
    dgis: hasPt ? `https://2gis.kz/${citySlug}/directions/points/%7C${lng}%2C${lat}` : `https://2gis.kz/${citySlug}/search/${q}`,
    yandex: hasPt ? `https://yandex.kz/maps/?rtext=~${lat},${lng}&rtt=auto` : `https://yandex.kz/maps/?text=${q}`,
    google: hasPt ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : `https://www.google.com/maps/search/?api=1&query=${q}`,
  };
}
export const flightLink = (f: string) => `https://www.flightradar24.com/data/flights/${f.replace(/\s/g, "").toLowerCase()}`;

export const STATUS: Record<OrderStatus, { label: string; tone: string }> = {
  new: { label: "Новый", tone: "warn" },
  confirmed: { label: "Ожидает", tone: "warn" },
  assigned: { label: "Назначен вам", tone: "info" },
  en_route: { label: "Еду к клиенту", tone: "info" },
  arrived: { label: "На месте", tone: "warn" },
  in_progress: { label: "В пути с клиентом", tone: "go" },
  completed: { label: "Выполнен", tone: "done" },
  cancelled: { label: "Отменён", tone: "off" },
};

/** Следующий шаг водителя: какую кнопку показать */
export const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string; hint: string }>> = {
  assigned: { to: "en_route", label: "Выехал к клиенту", hint: "Клиент увидит, что вы в пути" },
  en_route: { to: "arrived", label: "Я на месте", hint: "Нажмите, когда подъедете к точке подачи" },
  arrived: { to: "in_progress", label: "Клиент в машине", hint: "Начинаем поездку" },
  in_progress: { to: "completed", label: "Завершить поездку", hint: "Заказ уйдёт в историю" },
};

export const PAY: Record<PaymentMethod, string> = {
  cash: "Наличными водителю", kaspi: "Kaspi", card: "Картой онлайн", invoice: "По счёту (безнал)",
};

export const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};

export const errText = (e: unknown) => {
  const m = (e as { message?: string })?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return "Неверный email или пароль";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Нет связи с сервером. Проверьте интернет";
  if (/Недопустимый переход/.test(m)) return "Статус уже изменился. Обновите список";
  return m;
};
