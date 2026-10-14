import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { ClassRate, Tariff } from "../lib/types";
import { Empty, Field, Icon, Modal, Spinner, useBusy, useRefs, useToast } from "../components/ui";

const num = (v: string) => Number(v.replace(/\s/g, ""));
const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

export function TariffsPage({ city }: { city: number }) {
  const { cities, classes } = useRefs();
  const toast = useToast();
  const cityId = city || cities[0]?.id;
  const [tariffs, setTariffs] = useState<Tariff[] | null>(null);
  const [rates, setRates] = useState<ClassRate[]>([]);
  const [editRoute, setEditRoute] = useState<string | null | "">(null); // "" — новый маршрут

  const load = useCallback(async () => {
    if (!cityId) return;
    try { const [t, r] = await Promise.all([api.tariffs(cityId), api.rates(cityId)]); setTariffs(t); setRates(r); }
    catch (e) { toast((e as Error).message, true); }
  }, [cityId, toast]);
  useEffect(() => { setTariffs(null); load(); }, [load]);

  const routes = useMemo(() => {
    const m = new Map<string, Tariff[]>();
    (tariffs ?? []).forEach((t) => m.set(t.title_ru, [...(m.get(t.title_ru) ?? []), t]));
    return [...m.entries()];
  }, [tariffs]);
  const active = classes.filter((c) => c.is_active);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Тарифы · {cities.find((c) => c.id === cityId)?.name_ru}</h1>
        <button className="btn" onClick={() => setEditRoute("")}><Icon name="plus" size={18} />Маршрут</button>
      </header>
      {!city && <p className="field-hint">Выбран первый город. Переключите город вверху, чтобы изменить тарифы другого.</p>}

      <h2 className="sub">Фиксированные маршруты</h2>
      {tariffs === null ? <Spinner /> : routes.length === 0 ? <Empty title="Маршрутов нет" text="Добавьте аэропорт, вокзал, горнолыжку и т.д." /> : (
        <div className="table-wrap">
          <table className="price-table">
            <thead><tr><th>Маршрут</th>{active.map((c) => <th key={c.id}>{c.name_ru}</th>)}<th aria-label="Изменить" /></tr></thead>
            <tbody>
              {routes.map(([title, list]) => (
                <tr key={title} className={list.every((t) => !t.is_active) ? "off" : ""}>
                  <td data-label="Маршрут"><b>{title}</b><small>{list[0].from_label} → {list[0].to_label}</small></td>
                  {active.map((c) => {
                    const t = list.find((x) => x.car_class_id === c.id);
                    return <td key={c.id} data-label={c.name_ru}>{t && t.is_active ? fmt(t.price) + " ₸" : "—"}</td>;
                  })}
                  <td className="row-act"><button className="icon-btn" aria-label={"Изменить " + title} onClick={() => setEditRoute(title)}><Icon name="edit" size={18} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="sub">Почасовая аренда и межгород</h2>
      <div className="rate-grid">
        {active.map((c) => {
          const r = rates.find((x) => x.car_class_id === c.id) ?? { city_id: cityId, car_class_id: c.id, hourly_price: 0, min_hours: 2, intercity_km_price: 0 };
          return <RateCard key={c.id} title={c.name_ru} rate={r} onSaved={load} />;
        })}
      </div>

      {editRoute !== null && cityId && (
        <RouteForm cityId={cityId} title={editRoute} list={routes.find(([t]) => t === editRoute)?.[1] ?? []}
          onClose={() => setEditRoute(null)} onSaved={() => { setEditRoute(null); load(); }} />
      )}
    </div>
  );
}

function RateCard({ title, rate, onSaved }: { title: string; rate: ClassRate; onSaved: () => void }) {
  const { busy, run } = useBusy();
  const [f, setF] = useState({ h: String(rate.hourly_price), m: String(rate.min_hours), k: String(rate.intercity_km_price) });
  useEffect(() => setF({ h: String(rate.hourly_price), m: String(rate.min_hours), k: String(rate.intercity_km_price) }), [rate]);
  const dirty = f.h !== String(rate.hourly_price) || f.m !== String(rate.min_hours) || f.k !== String(rate.intercity_km_price);
  const only = (v: string) => v.replace(/\D/g, "");
  return (
    <div className="card rate">
      <p className="strong">{title}</p>
      <Field label="Час, ₸"><input inputMode="numeric" value={f.h} onChange={(e) => setF({ ...f, h: only(e.target.value) })} /></Field>
      <Field label="Минимум часов"><input inputMode="numeric" value={f.m} onChange={(e) => setF({ ...f, m: only(e.target.value) })} /></Field>
      <Field label="Межгород, ₸/км"><input inputMode="numeric" value={f.k} onChange={(e) => setF({ ...f, k: only(e.target.value) })} /></Field>
      <button className="btn sm wide" disabled={!dirty || busy}
        onClick={() => run(() => api.saveRate({ ...rate, hourly_price: num(f.h) || 0, min_hours: Math.max(1, num(f.m) || 1), intercity_km_price: num(f.k) || 0 }), "Ставки сохранены").then((ok) => ok && onSaved())}>
        Сохранить
      </button>
    </div>
  );
}

function RouteForm({ cityId, title, list, onClose, onSaved }: {
  cityId: number; title: string; list: Tariff[]; onClose: () => void; onSaved: () => void;
}) {
  const { classes } = useRefs();
  const toast = useToast();
  const { busy, run } = useBusy();
  const [name, setName] = useState(title);
  const [from, setFrom] = useState(list[0]?.from_label ?? "");
  const [to, setTo] = useState(list[0]?.to_label ?? "");
  const [prices, setPrices] = useState<Record<number, string>>(() =>
    Object.fromEntries(classes.map((c) => { const t = list.find((x) => x.car_class_id === c.id); return [c.id, t && t.is_active ? String(t.price) : ""]; })));
  const sort = list[0]?.sort ?? 99;

  const save = (disableAll = false) => {
    if (name.trim().length < 3 || from.trim().length < 2 || to.trim().length < 2) return toast("Заполните название, откуда и куда", true);
    run(async () => {
      for (const c of classes) {
        const t = list.find((x) => x.car_class_id === c.id);
        const p = num(prices[c.id] ?? "");
        const base = { city_id: cityId, car_class_id: c.id, title_ru: name.trim(), from_label: from.trim(), to_label: to.trim(), sort };
        if (t) await api.saveTariff({ ...t, ...base, price: p > 0 ? p : t.price, is_active: !disableAll && p > 0 });
        else if (p > 0 && !disableAll) await api.saveTariff({ ...base, price: p, is_active: true });
      }
    }, disableAll ? "Маршрут отключён" : "Маршрут сохранён").then((ok) => ok && onSaved());
  };

  return (
    <Modal title={title ? "Маршрут" : "Новый маршрут"} onClose={onClose} footer={<>
      {list.length > 0 && <button className="btn danger-ghost" disabled={busy} onClick={() => save(true)}>Отключить</button>}
      <button className="btn ghost" onClick={onClose}>Отмена</button>
      <button className="btn" disabled={busy} onClick={() => save()}>Сохранить</button>
    </>}>
      <div className="form-grid">
        <Field label="Название" span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Аэропорт — центр города" /></Field>
        <Field label="Откуда"><input value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Куда"><input value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        {classes.map((c) => (
          <Field key={c.id} label={`${c.name_ru}, ₸`}>
            <input inputMode="numeric" value={prices[c.id] ?? ""} placeholder="не возим"
              onChange={(e) => setPrices({ ...prices, [c.id]: e.target.value.replace(/[^\d\s]/g, "") })} />
          </Field>
        ))}
      </div>
      <p className="field-hint">Пустая цена — класс на этом маршруте не предлагается.</p>
    </Modal>
  );
}
