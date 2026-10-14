import { useContext, useEffect, useMemo, useState } from "react";
import { api, DISPATCH_PHONE, trackUrl } from "./lib/api";
import type { BookingResult, CarClass, City, ClassRate, OrderType, PaymentMethod, Tariff } from "./lib/types";
import { defaultPickup, errText, isAirport, localToIso, minPickup, money, phoneDigits, phoneOk, phonePretty, saveOrder, telLink, waLink } from "./lib/format";
import { LangCtx, useT } from "./lib/i18n";

export function Booking({ cities, classes, onTrack }: { cities: City[]; classes: CarClass[]; onTrack: (token: string) => void }) {
  const t = useT();
  const { lang } = useContext(LangCtx);
  const [city, setCity] = useState(cities[0]?.id ?? 1);
  const [type, setType] = useState<OrderType>("transfer");
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [rates, setRates] = useState<ClassRate[]>([]);
  const [route, setRoute] = useState<string>("");        // название маршрута; "" — свой маршрут
  const [cls, setCls] = useState(classes[0]?.id ?? 1);
  const [f, setF] = useState({
    pickup_at: defaultPickup(), from: "", to: "", hours: 3, name: "", phone: "", passengers: 1, luggage: 1,
    airport: false, flight: "", sign: "", child_seat: false, comment: "", payment: "cash" as PaymentMethod,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState<BookingResult | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };

  useEffect(() => {
    let alive = true;
    Promise.all([api.tariffs(city), api.rates(city)]).then(([tr, r]) => {
      if (!alive) return;
      setTariffs(tr); setRates(r);
      const first = tr.slice().sort((a, b) => a.sort - b.sort)[0];
      setRoute(first?.title_ru ?? "");
    }).catch(() => { if (alive) { setTariffs([]); setRates([]); } });
    return () => { alive = false; };
  }, [city]);

  const routes = useMemo(() => [...new Map(tariffs.slice().sort((a, b) => a.sort - b.sort).map((x) => [x.title_ru, x])).values()], [tariffs]);
  const routeInfo = routes.find((r) => r.title_ru === route) ?? null;

  // при выборе маршрута подставляем точки — клиент уточняет адрес
  useEffect(() => {
    if (type === "transfer" && routeInfo) {
      setF((s) => ({ ...s, from: routeInfo.from_label, to: routeInfo.to_label, airport: isAirport(routeInfo.from_label) }));
    }
  }, [routeInfo, type]);

  const priceFor = (classId: number): number | null => {
    if (type === "transfer") return route ? tariffs.find((x) => x.title_ru === route && x.car_class_id === classId)?.price ?? null : null;
    if (type === "hourly") {
      const r = rates.find((x) => x.car_class_id === classId);
      return r ? r.hourly_price * Math.max(f.hours, r.min_hours) : null;
    }
    return null;
  };
  const minHours = rates.find((x) => x.car_class_id === cls)?.min_hours ?? 2;
  const seats = classes.find((c) => c.id === cls)?.seats ?? 4;
  const price = priceFor(cls);
  const tariffId = type === "transfer" && route ? tariffs.find((x) => x.title_ru === route && x.car_class_id === cls)?.id ?? null : null;
  const name = (c: { name_ru: string; name_en: string }) => (lang === "en" ? c.name_en : c.name_ru);

  const validate = () => {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = t("errName");
    if (!phoneOk(f.phone)) e.phone = t("errPhone");
    if (f.from.trim().length < 3) e.from = t("errFrom");
    if (type !== "hourly" && f.to.trim().length < 3) e.to = t("errTo");
    if (!f.pickup_at || new Date(localToIso(f.pickup_at)).getTime() < Date.now() + 30 * 6e4) e.pickup_at = t("errWhen");
    if (f.passengers > seats) e.passengers = t("errSeats", { n: seats });
    setErrors(e);
    if (Object.keys(e).length) {
      const firstKey = ["pickup_at", "from", "to", "name", "phone", "passengers"].find((k) => e[k]);
      document.getElementById("f-" + firstKey)?.focus();
    }
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setServerError("");
    if (!validate()) return;
    setSending(true);
    try {
      const r = await api.book({
        city, car_class: cls, type, pickup_at: localToIso(f.pickup_at),
        pickup_address: f.from.trim(), dropoff_address: type === "hourly" ? undefined : f.to.trim(),
        tariff: tariffId, hours: type === "hourly" ? f.hours : null,
        client_name: f.name.trim(), client_phone: "+" + phoneDigits(f.phone), passengers: f.passengers, luggage: f.luggage,
        flight_number: f.airport ? f.flight.trim() : "", sign_text: f.airport ? (f.sign.trim() || f.name.trim()) : "",
        child_seat: f.child_seat, comment: f.comment.trim(), payment_method: f.payment,
      });
      saveOrder(r.tracking_token, r.number);
      setDone(r);
      window.scrollTo(0, 0);
    } catch (e) { setServerError(errText(e)); }
    finally { setSending(false); }
  };

  if (done) {
    const link = trackUrl(done.tracking_token);
    return (
      <section className="panel done" aria-live="polite">
        <h1>{t("doneTitle", { n: done.number })}</h1>
        <p>{t("doneText")}</p>
        {done.price === null ? <p className="note">{t("doneOnRequest")}</p> : <p className="big-price">{money(done.price, lang)}</p>}
        <button className="btn primary wide" onClick={() => onTrack(done.tracking_token)}>{t("openTracking")}</button>
        <CopyLink link={link} />
        {DISPATCH_PHONE && (
          <div className="row">
            <a className="btn ghost" href={telLink(DISPATCH_PHONE)}>{t("callDispatcher")}</a>
            <a className="btn ghost" href={waLink(DISPATCH_PHONE, `Заказ №${done.number}`)} target="_blank" rel="noreferrer">{t("whatsapp")}</a>
          </div>
        )}
        <button className="btn link" onClick={() => { setDone(null); setF((s) => ({ ...s, comment: "", flight: "", sign: "" })); }}>{t("newOrder")}</button>
      </section>
    );
  }

  return (
    <form className="panel form" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <div className="grid2 top">
        <label className="field"><span>{t("city")}</span>
          <select id="f-city" value={city} onChange={(e) => setCity(Number(e.target.value))}>
            {cities.map((c) => <option key={c.id} value={c.id}>{name(c)}</option>)}
          </select>
        </label>
        <div className="field"><span>{t("type")}</span>
          <div className="seg" role="radiogroup" aria-label={t("type")}>
            {(["transfer", "hourly", "intercity"] as OrderType[]).map((v) => (
              <button type="button" key={v} role="radio" aria-checked={type === v} className={type === v ? "on" : ""} onClick={() => setType(v)}>{t(v)}</button>
            ))}
          </div>
        </div>
      </div>

      {type === "transfer" && (
        <label className="field"><span>{t("route")}</span>
          <select id="f-route" value={route} onChange={(e) => setRoute(e.target.value)}>
            {routes.map((r) => <option key={r.title_ru} value={r.title_ru}>{lang === "en" ? r.title_en || r.title_ru : r.title_ru}</option>)}
            <option value="">{t("otherRoute")}</option>
          </select>
        </label>
      )}
      {type === "hourly" && (
        <div className="field"><span>{t("hours")} <small className="muted">· {t("minHours", { n: minHours })}</small></span>
          <div className="stepper">
            <button type="button" aria-label="−" onClick={() => set("hours", Math.max(1, f.hours - 1))}>−</button>
            <b>{f.hours}</b>
            <button type="button" aria-label="+" onClick={() => set("hours", Math.min(24, f.hours + 1))}>+</button>
          </div>
        </div>
      )}

      <div className="field"><span>{t("carClass")}</span>
        <div className="classes" role="radiogroup" aria-label={t("carClass")}>
          {classes.map((c) => {
            const p = priceFor(c.id);
            return (
              <button type="button" key={c.id} role="radio" aria-checked={cls === c.id} className={"cls" + (cls === c.id ? " on" : "")} onClick={() => setCls(c.id)}>
                <b>{name(c)}</b>
                <small>{t("upTo", { n: c.seats })}{c.description_ru && lang === "ru" ? ` · ${c.description_ru.replace(/ или аналог$/, "")}` : ""}</small>
                <em>{money(p, lang) ?? t("onRequest")}</em>
              </button>
            );
          })}
        </div>
      </div>

      <label className="field"><span>{t("when")}</span>
        <input id="f-pickup_at" type="datetime-local" min={minPickup()} value={f.pickup_at} onChange={(e) => set("pickup_at", e.target.value)} aria-invalid={!!errors.pickup_at} />
        {errors.pickup_at ? <em className="err">{errors.pickup_at}</em> : <small className="muted">{t("whenHint")}</small>}
      </label>
      <label className="field"><span>{t("from")}</span>
        <input id="f-from" value={f.from} onChange={(e) => set("from", e.target.value)} placeholder={t("fromPh")} autoComplete="street-address" aria-invalid={!!errors.from} />
        {errors.from && <em className="err">{errors.from}</em>}
      </label>
      {type !== "hourly" && (
        <label className="field"><span>{t("to")}</span>
          <input id="f-to" value={f.to} onChange={(e) => set("to", e.target.value)} placeholder={t("toPh")} aria-invalid={!!errors.to} />
          {errors.to && <em className="err">{errors.to}</em>}
          {type === "intercity" && <small className="muted">{t("intercityHint")}</small>}
        </label>
      )}

      <div className="grid2">
        <label className="field"><span>{t("name")}</span>
          <input id="f-name" value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" aria-invalid={!!errors.name} />
          {errors.name && <em className="err">{errors.name}</em>}
        </label>
        <label className="field"><span>{t("phone")}</span>
          <input id="f-phone" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} onBlur={() => phoneOk(f.phone) && set("phone", phonePretty(f.phone))}
            placeholder={t("phonePh")} autoComplete="tel" aria-invalid={!!errors.phone} />
          {errors.phone && <em className="err">{errors.phone}</em>}
        </label>
        <div className="field"><span>{t("passengers")}</span>
          <div className="stepper">
            <button type="button" aria-label="−" onClick={() => set("passengers", Math.max(1, f.passengers - 1))}>−</button>
            <b id="f-passengers">{f.passengers}</b>
            <button type="button" aria-label="+" onClick={() => set("passengers", Math.min(20, f.passengers + 1))}>+</button>
          </div>
          {errors.passengers && <em className="err">{errors.passengers}</em>}
        </div>
        <div className="field"><span>{t("luggage")}</span>
          <div className="stepper">
            <button type="button" aria-label="−" onClick={() => set("luggage", Math.max(0, f.luggage - 1))}>−</button>
            <b>{f.luggage}</b>
            <button type="button" aria-label="+" onClick={() => set("luggage", Math.min(30, f.luggage + 1))}>+</button>
          </div>
        </div>
      </div>

      <label className="check"><input id="f-airport" type="checkbox" checked={f.airport} onChange={(e) => set("airport", e.target.checked)} /> {t("airport")}</label>
      {f.airport && (
        <div className="grid2">
          <label className="field"><span>{t("flight")}</span><input id="f-flight" value={f.flight} onChange={(e) => set("flight", e.target.value.toUpperCase())} placeholder={t("flightPh")} /></label>
          <label className="field"><span>{t("sign")}</span><input id="f-sign" value={f.sign} onChange={(e) => set("sign", e.target.value)} placeholder={f.name || t("signPh")} /></label>
        </div>
      )}
      <label className="check"><input id="f-child" type="checkbox" checked={f.child_seat} onChange={(e) => set("child_seat", e.target.checked)} /> {t("childSeat")}</label>
      <label className="field"><span>{t("comment")}</span>
        <textarea id="f-comment" rows={2} value={f.comment} onChange={(e) => set("comment", e.target.value)} placeholder={t("commentPh")} />
      </label>

      <div className="field"><span>{t("payment")}</span>
        <div className="seg" role="radiogroup" aria-label={t("payment")}>
          {(["cash", "kaspi"] as PaymentMethod[]).map((p) => (
            <button type="button" key={p} role="radio" aria-checked={f.payment === p} className={f.payment === p ? "on" : ""} onClick={() => set("payment", p)}>{t(p as "cash" | "kaspi")}</button>
          ))}
        </div>
      </div>

      <div className="total">
        <div><small className="muted">{t("total")}</small><b>{money(price, lang) ?? t("onRequest")}</b></div>
        <button className="btn primary" disabled={sending}>{sending ? t("sending") : t("submit")}</button>
      </div>
      {serverError && <p className="err block" role="alert">{serverError}</p>}
      <p className="muted small">{t("agree")}</p>
    </form>
  );
}

export function CopyLink({ link }: { link: string }) {
  const t = useT();
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setOk(true); setTimeout(() => setOk(false), 2500); }
    catch { (document.getElementById("track-link") as HTMLInputElement | null)?.select(); }
  };
  return (
    <div className="copy">
      <input id="track-link" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Ссылка" />
      <button type="button" className="btn ghost" onClick={copy}>{ok ? t("copied") : t("copyLink")}</button>
    </div>
  );
}
