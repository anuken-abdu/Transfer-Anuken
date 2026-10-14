export const TZ = "Asia/Almaty";
const OFFSET = "+05:00";

export const money = (v: number | null | undefined, lang: string) =>
  v === null || v === undefined ? null : new Intl.NumberFormat(lang === "en" ? "en-US" : "ru-RU").format(v) + " ₸";

export const dateTime = (iso: string, lang: string) =>
  new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ru-RU", { timeZone: TZ, weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso));
export const timeOnly = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** datetime-local (время Казахстана) ↔ ISO */
export const localToIso = (v: string) => new Date(v + ":00" + OFFSET).toISOString();
export const isoToLocal = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
};
/** ближайшее время подачи: через час, округлено до 15 минут */
export const defaultPickup = () => isoToLocal(new Date(Math.ceil((Date.now() + 60 * 6e4) / 9e5) * 9e5).toISOString());
export const minPickup = () => isoToLocal(new Date(Date.now() + 31 * 6e4).toISOString());

export const phoneDigits = (p: string) => {
  let d = p.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return d;
};
export const phoneOk = (p: string) => /^7\d{10}$/.test(phoneDigits(p));
export const phonePretty = (p: string | null | undefined) => {
  if (!p) return "";
  const d = phoneDigits(p);
  return d.length === 11 ? `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}` : p;
};
export const telLink = (p: string) => "tel:+" + phoneDigits(p);
export const waLink = (p: string, text = "") => "https://wa.me/" + phoneDigits(p) + (text ? "?text=" + encodeURIComponent(text) : "");
export const mapLink = (lat: number, lng: number, city: string) => `https://2gis.kz/${city}/geo/${lng}%2C${lat}`;

export const isAirport = (s: string) => /аэропорт|airport|\b(ala|nqz|cit|gyd)\b/i.test(s);

export const errText = (e: unknown) => {
  const m = (e as { message?: string })?.message || String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз";
  return m;
};

/** Ссылки на заказы, сделанные с этого телефона */
const KEY = "at.orders";
export const savedOrders = (): { token: string; number: number; at: string }[] => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
};
export const saveOrder = (token: string, number: number) => {
  try {
    const list = savedOrders().filter((o) => o.token !== token);
    list.unshift({ token, number, at: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30)));
  } catch { /* без хранилища — ссылка остаётся на экране */ }
};
