import { useEffect, useState } from "react";
import { api } from "./lib/api";
import type { DriverOrder } from "./lib/types";
import { flightLink, money, navLinks, NEXT, PAY, phonePretty, relative, STATUS, telLink, timeOnly, dayLabel, waLink } from "./lib/format";
import { Icon, useBusy } from "./ui";

const REASONS = ["Не успеваю к времени", "Машина неисправна", "Плохо себя чувствую", "Другое"];

export function OrderView({ order, citySlug, className, onBack, onChanged }: {
  order: DriverOrder; citySlug: string; className: string; onBack: () => void; onChanged: (finished: boolean) => Promise<void> | void;
}) {
  const { busy, run } = useBusy();
  const [confirmDone, setConfirmDone] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [sign, setSign] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => { setConfirmDone(false); }, [order.status]);

  const next = NEXT[order.status];
  const st = STATUS[order.status];
  const ended = order.status === "completed" || order.status === "cancelled";
  // навигация ведёт к подаче, пока клиент не сел, потом — к месту назначения
  const toDropoff = order.status === "in_progress" && order.dropoff_address;

  const go = () => {
    if (!next) return;
    if (next.to === "completed" && !confirmDone) { setConfirmDone(true); return; }
    run(async () => { await api.setStatus(order.id, next.to); await onChanged(next.to === "completed"); }, next.to === "completed" ? "Поездка завершена" : undefined)
      .then((ok) => { if (ok && next.to === "completed") onBack(); });
  };
  const decline = (reason: string) =>
    run(async () => { await api.decline(order.id, reason); await onChanged(true); }, "Вы отказались от заказа. Диспетчер назначит другого водителя")
      .then((ok) => ok && onBack());

  const cashToCollect = order.payment_method === "cash" && order.payment_status !== "paid" ? order.price : null;

  return (
    <div className="order-view">
      <header className="ov-head">
        <button className="icon-btn" onClick={onBack} aria-label="Назад"><Icon name="back" size={24} /></button>
        <div className="ov-title"><b>Заказ №{order.number}</b><span className={"chip t-" + st.tone}>{st.label}</span></div>
      </header>

      <div className="ov-body">
        <section className="ov-when">
          <p className="big-time">{timeOnly(order.pickup_at)}</p>
          <p className="muted">{dayLabel(order.pickup_at)}{ended ? "" : " · " + relative(order.pickup_at)}{order.type === "hourly" ? ` · почасовая ${order.hours} ч` : ""}</p>
        </section>

        <section className="ov-route">
          <Point label="Подача" address={order.pickup_address} lat={order.pickup_lat} lng={order.pickup_lng}
            city={citySlug} primary={!toDropoff && !ended} />
          {order.dropoff_address && (
            <Point label="Куда" address={order.dropoff_address} lat={order.dropoff_lat} lng={order.dropoff_lng}
              city={citySlug} primary={Boolean(toDropoff)} dest />
          )}
        </section>

        {order.sign_text && !ended && (
          <button className="sign-btn" onClick={() => setSign(true)}>
            <Icon name="sign" size={22} />
            <span><b>Показать табличку</b><small>{order.sign_text}</small></span>
          </button>
        )}

        <section className="ov-client">
          <div>
            <small className="muted">Клиент</small>
            <p className="strong lg">{order.client_name}</p>
            <p className="muted">{phonePretty(order.client_phone)}</p>
          </div>
          {!ended && (
            <div className="row">
              <a className="btn round" href={telLink(order.client_phone)} aria-label="Позвонить клиенту"><Icon name="phone" size={22} /></a>
              <a className="btn round" href={waLink(order.client_phone)} target="_blank" rel="noreferrer" aria-label="Написать в WhatsApp"><Icon name="chat" size={22} /></a>
            </div>
          )}
        </section>

        <section className="ov-facts">
          <Fact icon="people" text={`${order.passengers} ${order.passengers === 1 ? "пассажир" : order.passengers < 5 ? "пассажира" : "пассажиров"}`} />
          <Fact icon="bag" text={order.luggage ? `Багаж: ${order.luggage}` : "Без багажа"} />
          <Fact icon="car" text={className} />
          {order.child_seat && <Fact icon="child" text="Нужно детское кресло" warn />}
          {order.flight_number && (
            <a className="fact link" href={flightLink(order.flight_number)} target="_blank" rel="noreferrer">
              <Icon name="plane" /> Рейс {order.flight_number} — проверить прилёт
            </a>
          )}
        </section>

        {order.comment && <p className="ov-comment"><Icon name="note" size={18} />{order.comment}</p>}

        <section className="ov-money">
          <div><small className="muted">Ваш заработок</small><p className="strong xl">{money(order.driver_payout)}</p></div>
          <div className="pay">
            <small className="muted">Оплата</small>
            <p>{PAY[order.payment_method]}{order.payment_status === "paid" ? " · оплачено" : ""}</p>
            {cashToCollect !== null && <p className="collect">Получить с клиента: <b>{money(cashToCollect)}</b></p>}
          </div>
        </section>

        {order.status === "assigned" && !declining && (
          <button className="text-btn danger" onClick={() => setDeclining(true)}>Не могу выполнить заказ</button>
        )}
        {declining && (
          <section className="decline">
            <p className="strong">Почему отказываетесь?</p>
            {REASONS.map((r) => <button key={r} className="btn ghost wide" disabled={busy} onClick={() => decline(r)}>{r}</button>)}
            <button className="text-btn" onClick={() => setDeclining(false)}>Я передумал, беру заказ</button>
          </section>
        )}
      </div>

      {next && (
        <footer className="action-bar">
          {confirmDone && <p className="confirm-hint">Клиент вышел и оплата получена? Нажмите ещё раз</p>}
          <button className={"btn action" + (next.to === "completed" ? " done" : "") + (confirmDone ? " confirm" : "")} disabled={busy}
            onClick={go} onBlur={() => setConfirmDone(false)}>
            {busy ? "Отправляю…" : confirmDone ? "Да, завершить" : next.label}
          </button>
          {!confirmDone && <p className="action-hint">{next.hint}</p>}
        </footer>
      )}

      {sign && order.sign_text && (
        <div className="sign-screen" role="dialog" aria-label="Табличка для встречи" onClick={() => setSign(false)}>
          <p className="sign-brand">ANUKEN TRANSFER</p>
          <p className="sign-text">{order.sign_text}</p>
          <p className="sign-close">Нажмите, чтобы закрыть</p>
        </div>
      )}
    </div>
  );
}

function Point({ label, address, lat, lng, city, primary, dest }: {
  label: string; address: string; lat: number | null; lng: number | null; city: string; primary: boolean; dest?: boolean;
}) {
  const l = navLinks(address, lat, lng, city);
  return (
    <div className={"point" + (primary ? " primary" : "")}>
      <span className={"pdot" + (dest ? " dest" : "")} />
      <div className="pbody">
        <small className="muted">{label}</small>
        <p className="paddr">{address}</p>
        <div className="nav-row">
          <a className="nav-btn" href={l.dgis} target="_blank" rel="noreferrer"><Icon name="nav" size={16} />2GIS</a>
          <a className="nav-btn" href={l.yandex} target="_blank" rel="noreferrer">Яндекс</a>
          <a className="nav-btn" href={l.google} target="_blank" rel="noreferrer">Google</a>
        </div>
      </div>
    </div>
  );
}

const Fact = ({ icon, text, warn }: { icon: string; text: string; warn?: boolean }) => (
  <p className={"fact" + (warn ? " warn" : "")}><Icon name={icon} />{text}</p>
);
