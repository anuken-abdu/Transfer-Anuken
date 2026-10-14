import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Driver, Order, OrderEvent, OrderStatus, PaymentStatus } from "../lib/types";
import { dateTime, money, PAY_METHOD, PAY_STATUS, phonePretty, STATUS, TYPE, waLink, DRIVER_STATE } from "../lib/format";
import { Badge, Field, Icon, Modal, useBusy, useRefs, useToast } from "./ui";

const SITE = (import.meta.env.VITE_SITE_URL as string | undefined) || "https://anuken-transfer.kz";

// что диспетчер может сделать дальше в каждом статусе
const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  new: { to: "confirmed", label: "Подтвердить" },
  assigned: { to: "en_route", label: "Водитель выехал" },
  en_route: { to: "arrived", label: "Водитель на месте" },
  arrived: { to: "in_progress", label: "Клиент в машине" },
  in_progress: { to: "completed", label: "Завершить заказ" },
};

export function OrderSheet({ order, drivers, onClose, onChanged }: {
  order: Order; drivers: Driver[]; onClose: () => void; onChanged: () => void;
}) {
  const { cities, classes } = useRefs();
  const toast = useToast();
  const { busy, run } = useBusy();
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [price, setPrice] = useState(order.price?.toString() ?? "");
  const [note, setNote] = useState(order.internal_note ?? "");
  const [pick, setPick] = useState(order.driver_id && order.car_id ? `${order.driver_id}|${order.car_id}` : "");
  const [cancelMode, setCancelMode] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => { api.orderEvents(order.id).then(setEvents).catch(() => setEvents([])); }, [order.id, order.status]);

  const cls = classes.find((c) => c.id === order.car_class_id);
  const city = cities.find((c) => c.id === order.city_id);
  const closed = order.status === "completed" || order.status === "cancelled";

  // подходящие машины: тот же город, класс не ниже заказанного, хватает мест
  const options = useMemo(() => {
    const sortOf = (id: number) => classes.find((c) => c.id === id)?.sort ?? 0;
    const need = sortOf(order.car_class_id);
    return drivers
      .filter((d) => d.is_active && d.city_id === order.city_id)
      .flatMap((d) => d.cars.filter((c) => c.is_active && sortOf(c.car_class_id) >= need && c.seats >= order.passengers)
        .map((c) => ({ d, c, key: `${d.id}|${c.id}` })))
      .sort((a, b) => (a.d.state === "online" ? 0 : a.d.state === "busy" ? 1 : 2) - (b.d.state === "online" ? 0 : b.d.state === "busy" ? 1 : 2));
  }, [drivers, classes, order]);

  const act = (fn: () => Promise<unknown>, ok: string) => run(async () => { await fn(); onChanged(); }, ok);

  const savePrice = () => {
    const v = price.trim() === "" ? null : Number(price.replace(/\s/g, ""));
    if (v !== null && (!Number.isFinite(v) || v < 0)) return toast("Неверная цена", true);
    act(async () => {
      await api.updateOrder(order.id, { price: v });
      if (v !== null && order.status === "new") await api.setStatus(order.id, "confirmed");
    }, "Цена сохранена");
  };
  const assign = () => {
    const [d, c] = pick.split("|");
    if (!d || !c) return toast("Выберите водителя", true);
    act(() => api.assign(order.id, d, Number(c)), "Водитель назначен");
  };
  const trackUrl = `${SITE}/t/${order.tracking_token}`;
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast("Ссылка скопирована"); }
    catch { toast("Не удалось скопировать: " + text, true); }
  };

  const next = NEXT[order.status];
  const st = STATUS[order.status];

  return (
    <Modal wide onClose={onClose} title={<>Заказ №{order.number} <Badge tone={st.tone}>{st.label}</Badge></>}>
      <div className="sheet">
        <section className="sheet-main">
          <div className="route">
            <div className="route-pt"><span className="dot a" /><div><small>Подача · {dateTime(order.pickup_at)}</small><p>{order.pickup_address}</p></div></div>
            {order.dropoff_address && <div className="route-pt"><span className="dot b" /><div><small>Куда</small><p>{order.dropoff_address}</p></div></div>}
          </div>

          <dl className="facts">
            <div><dt>Тип</dt><dd>{TYPE[order.type]}{order.hours ? ` · ${order.hours} ч` : ""}</dd></div>
            <div><dt>Класс</dt><dd>{cls?.name_ru}</dd></div>
            <div><dt>Город</dt><dd>{city?.name_ru}</dd></div>
            <div><dt>Пассажиры</dt><dd>{order.passengers} · багаж {order.luggage}</dd></div>
            {order.flight_number && <div><dt>Рейс</dt><dd><Icon name="plane" size={14} /> {order.flight_number}</dd></div>}
            {order.sign_text && <div><dt>Табличка</dt><dd>{order.sign_text}</dd></div>}
            {order.child_seat && <div><dt>Детское кресло</dt><dd>Нужно</dd></div>}
            <div><dt>Оплата</dt><dd>{PAY_METHOD[order.payment_method]}</dd></div>
            <div><dt>Источник</dt><dd>{{ web: "Сайт", app: "Приложение", admin: "Диспетчер", phone: "Звонок" }[order.source]}</dd></div>
          </dl>
          {order.comment && <p className="comment">«{order.comment}»</p>}
          {order.cancel_reason && order.status === "cancelled" && <p className="comment bad">Причина отмены: {order.cancel_reason}</p>}

          <div className="client">
            <div><small>Клиент</small><p className="strong">{order.client_name}</p><p className="muted">{phonePretty(order.client_phone)}</p></div>
            <div className="client-actions">
              <a className="btn ghost sm" href={"tel:" + order.client_phone}><Icon name="phone" size={16} />Позвонить</a>
              <a className="btn ghost sm" href={waLink(order.client_phone)} target="_blank" rel="noreferrer"><Icon name="chat" size={16} />WhatsApp</a>
              <button className="btn ghost sm" onClick={() => copy(trackUrl)}><Icon name="link" size={16} />Ссылка клиенту</button>
            </div>
          </div>

          {events.length > 0 && (
            <ol className="timeline">
              {events.map((e) => <li key={e.id}><span>{dateTime(e.created_at)}</span>{STATUS[e.status].label}{e.note ? ` — ${e.note}` : ""}</li>)}
            </ol>
          )}
        </section>

        <aside className="sheet-side">
          <div className="panel">
            <Field label="Цена клиенту, ₸" hint={order.price === null ? "Индивидуальный маршрут — укажите цену" : undefined}>
              <div className="inline">
                <input inputMode="numeric" value={price} disabled={closed} onChange={(e) => setPrice(e.target.value.replace(/[^\d\s]/g, ""))} placeholder="Например 25000" />
                <button className="btn sm" disabled={busy || closed || price === (order.price?.toString() ?? "")} onClick={savePrice}>OK</button>
              </div>
            </Field>
            {order.driver_payout !== null && <p className="payout">Водителю: <b>{money(order.driver_payout)}</b> · вам: <b>{money((order.price ?? 0) - order.driver_payout)}</b></p>}
          </div>

          {!closed && order.status !== "in_progress" && (
            <div className="panel">
              <Field label={order.driver_id ? "Водитель (можно заменить)" : "Назначить водителя"}>
                <select value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">— выберите —</option>
                  {options.map(({ d, c, key }) => (
                    <option key={key} value={key}>
                      {d.profile?.full_name} · {c.make} {c.model} {c.plate} · {DRIVER_STATE[d.state].toLowerCase()}
                    </option>
                  ))}
                </select>
              </Field>
              {options.length === 0 && <p className="field-hint">Нет подходящих машин в этом городе и классе</p>}
              <button className="btn wide" disabled={busy || !pick || order.price === null || pick === `${order.driver_id}|${order.car_id}`} onClick={assign}>
                {order.driver_id ? "Заменить водителя" : "Назначить"}
              </button>
            </div>
          )}
          {order.driver && (
            <div className="panel driver-card">
              <small>Водитель</small>
              <p className="strong">{order.driver.profile?.full_name}</p>
              <p className="muted">{order.car?.color} {order.car?.make} {order.car?.model} · <b className="plate">{order.car?.plate}</b></p>
              {order.driver.profile?.phone && <a className="btn ghost sm" href={"tel:" + order.driver.profile.phone}><Icon name="phone" size={16} />{phonePretty(order.driver.profile.phone)}</a>}
            </div>
          )}

          <div className="panel">
            <Field label="Оплата">
              <select value={order.payment_status} onChange={(e) => act(() => api.updateOrder(order.id, { payment_status: e.target.value as PaymentStatus }), "Статус оплаты обновлён")}>
                {Object.entries(PAY_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Заметка для диспетчеров">
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (order.internal_note ?? "") && act(() => api.updateOrder(order.id, { internal_note: note || null }), "Заметка сохранена")} />
            </Field>
          </div>

          {!closed && (
            <div className="actions">
              {next && (next.to !== "confirmed" || order.price !== null) && (next.to === "confirmed" || order.driver_id) && (
                <button className="btn wide" disabled={busy} onClick={() => act(() => api.setStatus(order.id, next.to), "Статус: " + STATUS[next.to].label)}>{next.label}</button>
              )}
              {!cancelMode
                ? <button className="btn danger-ghost wide" onClick={() => setCancelMode(true)}>Отменить заказ</button>
                : (
                  <div className="cancel-box">
                    <input autoFocus placeholder="Причина отмены" value={reason} onChange={(e) => setReason(e.target.value)} />
                    <div className="inline">
                      <button className="btn ghost sm" onClick={() => setCancelMode(false)}>Назад</button>
                      <button className="btn danger sm" disabled={busy || reason.trim().length < 3}
                        onClick={() => act(() => api.setStatus(order.id, "cancelled", reason.trim()), "Заказ отменён").then((ok) => ok && onClose())}>Отменить заказ</button>
                    </div>
                  </div>
                )}
            </div>
          )}
          {order.status === "cancelled" && (
            <button className="btn ghost wide" disabled={busy} onClick={() => act(() => api.setStatus(order.id, order.price === null ? "new" : "confirmed"), "Заказ восстановлен")}>Восстановить заказ</button>
          )}
        </aside>
      </div>
    </Modal>
  );
}
