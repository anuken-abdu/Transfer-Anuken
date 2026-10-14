import { useCallback, useContext, useEffect, useState } from "react";
import { api, DISPATCH_PHONE, trackUrl } from "./lib/api";
import type { OrderStatus, Tracking } from "./lib/types";
import { dateTime, errText, mapLink, money, phonePretty, savedOrders, telLink, timeOnly, waLink } from "./lib/format";
import { LangCtx, useT, type Key } from "./lib/i18n";
import { CopyLink } from "./Booking";

const FLOW: OrderStatus[] = ["new", "confirmed", "assigned", "en_route", "arrived", "in_progress", "completed"];

export function Track({ token, onNew }: { token: string; onNew: () => void }) {
  const t = useT();
  const { lang } = useContext(LangCtx);
  const [o, setO] = useState<Tracking | null | undefined>(undefined);
  const [err, setErr] = useState("");
  const [at, setAt] = useState<Date | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setO(await api.track(token)); setAt(new Date()); setErr(""); }
    catch (e) { setErr(errText(e)); setO((x) => (x === undefined ? null : x)); }
  }, [token]);
  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 15000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  if (o === undefined) return <div className="panel"><div className="spinner" aria-label="…" /></div>;
  if (o === null) return (
    <section className="panel">
      <h1>{t("notFound")}</h1><p className="muted">{err || t("notFoundText")}</p>
      <button className="btn primary" onClick={onNew}>{t("newOrder")}</button>
    </section>
  );

  const step = FLOW.indexOf(o.status);
  const labels = t("steps").split("|");
  const done = o.status === "completed";
  const off = o.status === "cancelled";

  const cancel = async () => {
    setBusy(true);
    try { await api.cancel(token, reason.trim()); setCancelling(false); await load(); }
    catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  };

  return (
    <section className="panel track">
      <div className="track-head">
        <p className="muted">{t("order", { n: o.number })} · {lang === "en" ? o.car_class_en : o.car_class}</p>
        <h1 className={off ? "off" : done ? "ok" : ""}>{t(("st_" + o.status) as Key)}</h1>
        {!off && !done && <p className="muted small">{t("autoRefresh")}{at ? ` · ${t("updated", { t: timeOnly(at.toISOString()) })}` : ""}</p>}
        {off && o.cancel_reason && <p className="muted">{t("reason", { r: o.cancel_reason })}</p>}
        {done && <p>{t("thanks")}</p>}
      </div>

      {!off && (
        <ol className="steps" aria-label="Статус">
          {labels.map((l, i) => <li key={l} className={i < step ? "past" : i === step ? "now" : ""}><span />{l}</li>)}
        </ol>
      )}

      {o.driver && (
        <div className="driver">
          <small className="muted">{t("yourDriver")}</small>
          <p className="strong">{o.driver.name}</p>
          <p>{o.driver.car} · <b className="plate">{o.driver.plate}</b></p>
          <div className="row">
            {o.driver.phone && <a className="btn primary" href={telLink(o.driver.phone)}>{t("call")} · {phonePretty(o.driver.phone)}</a>}
            {o.driver.lat !== null && o.driver.lng !== null && (
              <a className="btn ghost" href={mapLink(o.driver.lat, o.driver.lng, o.city_slug)} target="_blank" rel="noreferrer">{t("whereCar")}</a>
            )}
          </div>
        </div>
      )}

      <dl className="facts">
        <div><dt>{t("pickup")}</dt><dd>{dateTime(o.pickup_at, lang)}</dd></div>
        <div><dt>{t("from")}</dt><dd>{o.pickup_address}</dd></div>
        {o.dropoff_address ? <div><dt>{t("to")}</dt><dd>{o.dropoff_address}</dd></div>
          : o.type === "hourly" && <div><dt>{t("type")}</dt><dd>{t("hourlyN", { n: o.hours ?? 0 })}</dd></div>}
        <div><dt>{t("price")}</dt><dd>{money(o.price, lang) ?? t("onRequest")} · {t(o.payment_method === "kaspi" ? "kaspi" : "cash")}</dd></div>
      </dl>

      <CopyLink link={trackUrl(token)} />
      {err && <p className="err block" role="alert">{err}</p>}

      {o.can_cancel && !cancelling && <button className="btn link danger" onClick={() => setCancelling(true)}>{t("cancelOrder")}</button>}
      {cancelling && (
        <div className="cancel">
          <input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("cancelReasonPh")} />
          <div className="row">
            <button className="btn ghost" onClick={() => setCancelling(false)}>{t("back")}</button>
            <button className="btn danger" disabled={busy} onClick={cancel}>{t("cancelConfirm")}</button>
          </div>
        </div>
      )}
      {!o.can_cancel && !off && !done && step < 4 && <p className="muted small">{t("cannotCancel")}</p>}

      {DISPATCH_PHONE && !done && (
        <div className="row">
          <a className="btn ghost" href={telLink(DISPATCH_PHONE)}>{t("callDispatcher")}</a>
          <a className="btn ghost" href={waLink(DISPATCH_PHONE, `Заказ №${o.number}`)} target="_blank" rel="noreferrer">{t("whatsapp")}</a>
        </div>
      )}
      {(done || off) && <button className="btn primary" onClick={onNew}>{t("newOrder")}</button>}
    </section>
  );
}

export function MyOrders({ onOpen, onNew }: { onOpen: (token: string) => void; onNew: () => void }) {
  const t = useT();
  const { lang } = useContext(LangCtx);
  const [list, setList] = useState<{ token: string; number: number; o: Tracking | null }[] | null>(null);
  useEffect(() => {
    const saved = savedOrders();
    Promise.all(saved.map(async (s) => ({ ...s, o: await api.track(s.token).catch(() => null) })))
      .then((r) => setList(r.filter((x) => x.o)));
  }, []);
  if (list === null) return <div className="panel"><div className="spinner" aria-label="…" /></div>;
  return (
    <section className="panel">
      <h1>{t("myOrders")}</h1>
      {list.length === 0 ? <p className="muted">{t("noOrders")}</p> : (
        <ul className="my">
          {list.map(({ token, o }) => o && (
            <li key={token}>
              <button onClick={() => onOpen(token)}>
                <span><b>{t("order", { n: o.number })}</b><small className="muted">{dateTime(o.pickup_at, lang)}</small></span>
                <span className="muted small">{o.pickup_address}{o.dropoff_address ? ` → ${o.dropoff_address}` : ""}</span>
                <span className={"st st-" + o.status}>{t(("st_" + o.status) as Key)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="btn primary" onClick={onNew}>{t("newOrder")}</button>
    </section>
  );
}
