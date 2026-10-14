import { createContext, useContext } from "react";

export type Lang = "ru" | "en";

const ru = {
  brandSub: "трансфер и авто с водителем",
  heroTitle: "Трансфер и авто с водителем",
  heroText: "Фиксированная цена заранее. Встретим в аэропорту с табличкой и поможем с багажом.",
  myOrders: "Мои заказы",
  city: "Город", type: "Что нужно",
  transfer: "Трансфер", hourly: "По часам", intercity: "Межгород",
  route: "Маршрут", otherRoute: "Другой маршрут — цену назовёт диспетчер",
  hours: "Сколько часов", minHours: "минимум {n} ч",
  carClass: "Класс авто", upTo: "до {n} пасс.", onRequest: "по запросу",
  when: "Дата и время подачи", whenHint: "Время по Казахстану. Заказ — минимум за 30 минут",
  from: "Откуда", to: "Куда", fromPh: "Адрес, отель, терминал", toPh: "Адрес назначения",
  intercityHint: "Цену межгорода диспетчер назовёт по телефону после заказа",
  name: "Ваше имя", phone: "Телефон", phonePh: "+7 7__ ___ __ __",
  passengers: "Пассажиров", luggage: "Чемоданов",
  airport: "Встреча в аэропорту", flight: "Номер рейса", flightPh: "KC 852", sign: "Имя на табличке", signPh: "Как написать на табличке",
  childSeat: "Детское кресло", comment: "Пожелания", commentPh: "Например: нужна вода, едем с собакой",
  payment: "Оплата", cash: "Наличными водителю", kaspi: "Kaspi переводом водителю",
  total: "Стоимость", submit: "Заказать", sending: "Отправляем…",
  agree: "Нажимая «Заказать», вы соглашаетесь, что диспетчер свяжется с вами по указанному номеру.",
  errName: "Укажите имя", errPhone: "Укажите номер телефона полностью", errFrom: "Укажите, откуда вас забрать",
  errTo: "Укажите, куда ехать", errWhen: "Выберите время подачи не раньше чем через 30 минут", errSeats: "В этом классе максимум {n} пассажиров",
  doneTitle: "Заказ №{n} принят", doneText: "Диспетчер подтвердит заказ и назначит водителя. Следите за статусом по ссылке — мы сохранили её на этом телефоне.",
  doneOnRequest: "Диспетчер перезвонит и назовёт цену.",
  openTracking: "Открыть статус заказа", copyLink: "Скопировать ссылку", copied: "Ссылка скопирована", newOrder: "Новый заказ",
  callDispatcher: "Позвонить диспетчеру", whatsapp: "WhatsApp",
  // отслеживание
  order: "Заказ №{n}", notFound: "Заказ не найден", notFoundText: "Проверьте ссылку или свяжитесь с диспетчером.",
  st_new: "Принят, ждёт подтверждения", st_confirmed: "Подтверждён, подбираем водителя", st_assigned: "Водитель назначен",
  st_en_route: "Водитель едет к вам", st_arrived: "Водитель на месте", st_in_progress: "В пути", st_completed: "Поездка завершена", st_cancelled: "Заказ отменён",
  steps: "Принят|Подтверждён|Водитель назначен|Едет к вам|На месте|В пути|Завершён",
  pickup: "Подача", yourDriver: "Ваш водитель", call: "Позвонить", whereCar: "Где машина", updated: "обновлено {t}",
  price: "Стоимость", cancelOrder: "Отменить заказ", cancelReasonPh: "Причина (необязательно)", cancelConfirm: "Да, отменить", back: "Назад",
  cancelled: "Заказ отменён", cannotCancel: "Отменить онлайн уже нельзя — позвоните диспетчеру",
  thanks: "Спасибо, что выбрали Anuken Transfer!", reason: "Причина: {r}", autoRefresh: "Статус обновляется сам",
  noOrders: "Здесь появятся заказы, сделанные с этого телефона", hourlyN: "Почасовая аренда · {n} ч",
};
type Dict = typeof ru;
const en: Dict = {
  brandSub: "airport transfers & chauffeur service",
  heroTitle: "Airport transfers and cars with a driver",
  heroText: "Fixed price upfront. We meet you at arrivals with a name sign and help with luggage.",
  myOrders: "My bookings",
  city: "City", type: "Service",
  transfer: "Transfer", hourly: "By the hour", intercity: "Intercity",
  route: "Route", otherRoute: "Other route — the dispatcher will quote a price",
  hours: "Hours", minHours: "minimum {n} h",
  carClass: "Car class", upTo: "up to {n} pax", onRequest: "on request",
  when: "Pickup date and time", whenHint: "Kazakhstan time. Book at least 30 minutes ahead",
  from: "From", to: "To", fromPh: "Address, hotel, terminal", toPh: "Destination address",
  intercityHint: "The dispatcher will quote the intercity price by phone",
  name: "Your name", phone: "Phone", phonePh: "+7 7__ ___ __ __",
  passengers: "Passengers", luggage: "Suitcases",
  airport: "Airport meeting", flight: "Flight number", flightPh: "KC 852", sign: "Name on the sign", signPh: "What to write on the sign",
  childSeat: "Child seat", comment: "Notes", commentPh: "E.g. water please, travelling with a dog",
  payment: "Payment", cash: "Cash to the driver", kaspi: "Kaspi transfer to the driver",
  total: "Price", submit: "Book now", sending: "Sending…",
  agree: "By tapping “Book now” you agree that the dispatcher will contact you at this number.",
  errName: "Enter your name", errPhone: "Enter the full phone number", errFrom: "Enter the pickup address",
  errTo: "Enter the destination", errWhen: "Pick a time at least 30 minutes from now", errSeats: "This class takes up to {n} passengers",
  doneTitle: "Booking #{n} received", doneText: "The dispatcher will confirm and assign a driver. Follow the status by the link — it is saved on this phone.",
  doneOnRequest: "The dispatcher will call you with the price.",
  openTracking: "Open booking status", copyLink: "Copy link", copied: "Link copied", newOrder: "New booking",
  callDispatcher: "Call the dispatcher", whatsapp: "WhatsApp",
  order: "Booking #{n}", notFound: "Booking not found", notFoundText: "Check the link or contact the dispatcher.",
  st_new: "Received, awaiting confirmation", st_confirmed: "Confirmed, assigning a driver", st_assigned: "Driver assigned",
  st_en_route: "Driver is on the way", st_arrived: "Driver has arrived", st_in_progress: "On the way", st_completed: "Trip completed", st_cancelled: "Booking cancelled",
  steps: "Received|Confirmed|Driver assigned|On the way|Arrived|Riding|Completed",
  pickup: "Pickup", yourDriver: "Your driver", call: "Call", whereCar: "Where is the car", updated: "updated {t}",
  price: "Price", cancelOrder: "Cancel booking", cancelReasonPh: "Reason (optional)", cancelConfirm: "Yes, cancel", back: "Back",
  cancelled: "Booking cancelled", cannotCancel: "Online cancellation is no longer possible — please call the dispatcher",
  thanks: "Thank you for choosing Anuken Transfer!", reason: "Reason: {r}", autoRefresh: "Status updates automatically",
  noOrders: "Bookings made from this phone will appear here", hourlyN: "Hourly hire · {n} h",
};
export const DICTS: Record<Lang, Dict> = { ru, en };
export type Key = keyof Dict;

export const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "ru", setLang: () => {} });
export function useT() {
  const { lang } = useContext(LangCtx);
  return (k: Key, vars?: Record<string, string | number>) => {
    let s = DICTS[lang][k] ?? DICTS.ru[k];
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, String(b));
    return s;
  };
}
export const detectLang = (): Lang => {
  try {
    const saved = localStorage.getItem("at.lang");
    if (saved === "ru" || saved === "en") return saved;
  } catch { /* без хранилища */ }
  return /^(ru|kk|uk|be)/i.test(navigator.language) ? "ru" : "en";
};
