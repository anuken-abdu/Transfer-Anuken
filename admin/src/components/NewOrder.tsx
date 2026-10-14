import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Company, OrderType, PaymentMethod, Tariff } from "../lib/types";
import { isoToLocalInput, localInputToIso, money, PAY_METHOD } from "../lib/format";
import { Field, Modal, Segmented, useBusy, useRefs, useToast } from "./ui";

export function NewOrder({ defaultCity, onClose, onCreated }: {
  defaultCity: number; onClose: () => void; onCreated: (id: string) => void;
}) {
  const { cities, classes } = useRefs();
  const toast = useToast();
  const { busy, run } = useBusy();
  const [city, setCity] = useState(defaultCity || cities[0]?.id || 1);
  const [type, setType] = useState<OrderType>("transfer");
  const [cls, setCls] = useState(classes[0]?.id ?? 1);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [routeTitle, setRouteTitle] = useState("");      // выбранный фиксированный маршрут ("" = свой)
  const [f, setF] = useState({
    pickup_at: isoToLocalInput(new Date(Math.ceil((Date.now() + 36e5) / 9e5) * 9e5).toISOString()),
    pickup_address: "", dropoff_address: "", hours: "3", distance_km: "",
    client_name: "", client_phone: "", passengers: "1", luggage: "1",
    flight_number: "", sign_text: "", child_seat: false, comment: "",
    payment_method: "cash" as PaymentMethod, company: "", price_override: "",
  });
  const [quote, setQuote] = useState<number | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => { api.tariffs(city).then((t) => setTariffs(t.filter((x) => x.is_active))); setRouteTitle(""); }, [city]);
  useEffect(() => { api.companies().then((c) => setCompanies(c.filter((x) => x.is_active))).catch(() => {}); }, []);

  const routes = useMemo(() => [...new Map(tariffs.map((t) => [t.title_ru, t])).values()], [tariffs]);
  const tariff = tariffs.find((t) => t.title_ru === routeTitle && t.car_class_id === cls) ?? null;

  // при выборе маршрута подставляем адреса
  useEffect(() => {
    const t = routes.find((r) => r.title_ru === routeTitle);
    if (t) setF((s) => ({ ...s, pickup_address: t.from_label, dropoff_address: t.to_label }));
  }, [routeTitle, routes]);

  useEffect(() => {
    const company = f.company ? Number(f.company) : null;
    const hours = Number(f.hours) || null;
    const km = Number(f.distance_km) || null;
    let alive = true;
    api.quote({ city, car_class: cls, type, tariff: tariff?.id ?? null, hours, distance_km: km, company })
      .then((q) => alive && setQuote(q)).catch(() => alive && setQuote(null));
    return () => { alive = false; };
  }, [city, cls, type, tariff?.id, f.hours, f.distance_km, f.company]);

  const seats = classes.find((c) => c.id === cls)?.seats ?? 4;
  const isAirport = /аэропорт/i.test(f.pickup_address);

  const submit = () => {
    if (f.client_name.trim().length < 2) return toast("Укажите имя клиента", true);
    if (f.client_phone.replace(/\D/g, "").length < 10) return toast("Укажите телефон клиента", true);
    if (f.pickup_address.trim().length < 3) return toast("Укажите адрес подачи", true);
    if (type !== "hourly" && f.dropoff_address.trim().length < 3) return toast("Укажите адрес назначения", true);
    if (Number(f.passengers) > seats) return toast(`В этом классе максимум ${seats} пассажиров`, true);
    run(async () => {
      const r = await api.createOrder({
        city, car_class: cls, type, pickup_at: localInputToIso(f.pickup_at),
        pickup_address: f.pickup_address, dropoff_address: type === "hourly" ? undefined : f.dropoff_address,
        tariff: type === "transfer" ? tariff?.id ?? null : null,
        hours: type === "hourly" ? Number(f.hours) : null,
        distance_km: type === "intercity" ? Number(f.distance_km) || null : null,
        client_name: f.client_name, client_phone: f.client_phone,
        passengers: Number(f.passengers) || 1, luggage: Number(f.luggage) || 0,
        flight_number: f.flight_number, sign_text: f.sign_text, child_seat: f.child_seat, comment: f.comment,
        payment_method: f.payment_method, company: f.company ? Number(f.company) : null,
        price_override: f.price_override ? Number(f.price_override.replace(/\s/g, "")) : null,
      });
      onCreated(r.id);
    }, "Заказ создан");
  };

  const finalPrice = f.price_override ? Number(f.price_override.replace(/\s/g, "")) : quote;

  return (
    <Modal wide title="Новый заказ" onClose={onClose} footer={
      <>
        <div className="foot-price"><small>Итого</small><b>{money(finalPrice)}</b></div>
        <button className="btn ghost" onClick={onClose}>Отмена</button>
        <button className="btn" disabled={busy} onClick={submit}>{busy ? "Создаю…" : "Создать заказ"}</button>
      </>
    }>
      <div className="form-grid">
        <Field label="Город">
          <select value={city} onChange={(e) => setCity(Number(e.target.value))}>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name_ru}</option>)}
          </select>
        </Field>
        <Field label="Тип">
          <Segmented label="Тип заказа" value={type} onChange={setType}
            options={[{ value: "transfer", label: "Трансфер" }, { value: "hourly", label: "Почасовая" }, { value: "intercity", label: "Межгород" }]} />
        </Field>
        <Field label="Класс авто" span>
          <div className="class-pick">
            {classes.filter((c) => c.is_active).map((c) => (
              <button key={c.id} type="button" className={c.id === cls ? "on" : ""} onClick={() => setCls(c.id)}>
                <b>{c.name_ru}</b><small>до {c.seats} пасс.</small>
              </button>
            ))}
          </div>
        </Field>

        {type === "transfer" && (
          <Field label="Маршрут" span hint={routeTitle && !tariff ? "Для этого класса маршрут не настроен — укажите цену вручную" : undefined}>
            <select value={routeTitle} onChange={(e) => setRouteTitle(e.target.value)}>
              <option value="">Свой маршрут (цена по запросу)</option>
              {routes.map((r) => <option key={r.title_ru} value={r.title_ru}>{r.title_ru}</option>)}
            </select>
          </Field>
        )}
        <Field label="Когда подать">
          <input type="datetime-local" value={f.pickup_at} onChange={(e) => set("pickup_at", e.target.value)} />
        </Field>
        {type === "hourly" && <Field label="Часов"><input inputMode="numeric" value={f.hours} onChange={(e) => set("hours", e.target.value.replace(/\D/g, ""))} /></Field>}
        {type === "intercity" && <Field label="Расстояние, км" hint="Для расчёта цены по км"><input inputMode="numeric" value={f.distance_km} onChange={(e) => set("distance_km", e.target.value.replace(/\D/g, ""))} /></Field>}
        <Field label="Откуда" span><input value={f.pickup_address} onChange={(e) => set("pickup_address", e.target.value)} placeholder="Адрес, отель, терминал" /></Field>
        {type !== "hourly" && <Field label="Куда" span><input value={f.dropoff_address} onChange={(e) => set("dropoff_address", e.target.value)} placeholder="Адрес назначения" /></Field>}

        <Field label="Имя клиента"><input value={f.client_name} onChange={(e) => set("client_name", e.target.value)} autoComplete="off" /></Field>
        <Field label="Телефон"><input type="tel" inputMode="tel" value={f.client_phone} onChange={(e) => set("client_phone", e.target.value)} placeholder="+7 7__ ___ __ __" /></Field>
        <Field label="Пассажиров"><input inputMode="numeric" value={f.passengers} onChange={(e) => set("passengers", e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Мест багажа"><input inputMode="numeric" value={f.luggage} onChange={(e) => set("luggage", e.target.value.replace(/\D/g, ""))} /></Field>

        {(isAirport || f.flight_number) && <Field label="Номер рейса"><input value={f.flight_number} onChange={(e) => set("flight_number", e.target.value.toUpperCase())} placeholder="KC 852" /></Field>}
        {(isAirport || f.sign_text) && <Field label="Текст таблички"><input value={f.sign_text} onChange={(e) => set("sign_text", e.target.value)} placeholder="Имя гостя" /></Field>}

        <Field label="Оплата">
          <select value={f.payment_method} onChange={(e) => set("payment_method", e.target.value as PaymentMethod)}>
            {Object.entries(PAY_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Компания">
          <select value={f.company} onChange={(e) => set("company", e.target.value)}>
            <option value="">Частный клиент</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}{c.discount_pct ? ` (−${c.discount_pct}%)` : ""}</option>)}
          </select>
        </Field>
        <Field label="Своя цена, ₸" hint={quote !== null ? `По тарифу: ${money(quote)}` : "Тарифа нет — укажите цену или оставьте «по запросу»"}>
          <input inputMode="numeric" value={f.price_override} onChange={(e) => set("price_override", e.target.value.replace(/[^\d\s]/g, ""))} placeholder="Необязательно" />
        </Field>
        <label className="check"><input type="checkbox" checked={f.child_seat} onChange={(e) => set("child_seat", e.target.checked)} /> Детское кресло</label>
        <Field label="Комментарий" span><textarea rows={2} value={f.comment} onChange={(e) => set("comment", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
